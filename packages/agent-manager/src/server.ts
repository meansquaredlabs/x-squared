import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import chokidar from "chokidar";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import * as agents from "./agents.ts";
import { abortExecution, startExecution } from "./executor.ts";
import type { WsEvent } from "./types.ts";
import * as workflows from "./workflows.ts";

export interface ServerOptions {
	uiDist: string;
	port: number;
	cwd?: string;
}

export async function startServer(opts: ServerOptions): Promise<() => void> {
	const app = express();
	const httpServer = http.createServer(app);
	const clients = new Set<WebSocket>();
	const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

	const broadcast = (event: WsEvent) => {
		const msg = JSON.stringify(event);
		for (const client of clients) {
			if (client.readyState === WebSocket.OPEN) client.send(msg);
		}
	};

	wss.on("connection", (ws) => {
		clients.add(ws);
		ws.on("close", () => clients.delete(ws));
	});

	const agentsDir = path.join(getAgentDir(), "agents");
	fs.mkdirSync(agentsDir, { recursive: true });
	const agentWatcher = chokidar.watch(agentsDir, { ignoreInitial: true });
	agentWatcher.on("all", () => broadcast({ type: "agents_changed" }));

	const workflowsDir = path.join(getAgentDir(), "workflows");
	fs.mkdirSync(workflowsDir, { recursive: true });
	const workflowWatcher = chokidar.watch(workflowsDir, { ignoreInitial: true });
	workflowWatcher.on("all", () => broadcast({ type: "workflows_changed" }));

	app.use(express.json());

	app.get("/api/agents", (_req, res) => {
		try {
			res.json(agents.listAgents());
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	app.get("/api/agents/:name", (req, res) => {
		const agent = agents.getAgent(req.params["name"]!);
		if (!agent) return void res.status(404).json({ error: "Not found" });
		res.json(agent);
	});

	app.post("/api/agents", (req, res) => {
		try {
			res.status(201).json(agents.createAgent(req.body));
		} catch (err) {
			res.status(400).json({ error: String(err) });
		}
	});

	app.put("/api/agents/:name", (req, res) => {
		try {
			res.json(agents.updateAgent(req.params["name"]!, req.body));
		} catch (err) {
			res.status(400).json({ error: String(err) });
		}
	});

	app.delete("/api/agents/:name", (req, res) => {
		try {
			agents.deleteAgent(req.params["name"]!);
			res.status(204).end();
		} catch (err) {
			res.status(404).json({ error: String(err) });
		}
	});

	app.get("/api/workflows", (_req, res) => {
		try {
			res.json(workflows.listWorkflows());
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	app.get("/api/workflows/:id", (req, res) => {
		const w = workflows.getWorkflow(req.params["id"]!);
		if (!w) return void res.status(404).json({ error: "Not found" });
		res.json(w);
	});

	app.post("/api/workflows", (req, res) => {
		try {
			res.status(201).json(workflows.createWorkflow(req.body));
		} catch (err) {
			res.status(400).json({ error: String(err) });
		}
	});

	app.put("/api/workflows/:id", (req, res) => {
		try {
			res.json(workflows.updateWorkflow(req.params["id"]!, req.body));
		} catch (err) {
			res.status(400).json({ error: String(err) });
		}
	});

	app.delete("/api/workflows/:id", (req, res) => {
		try {
			workflows.deleteWorkflow(req.params["id"]!);
			res.status(204).end();
		} catch (err) {
			res.status(404).json({ error: String(err) });
		}
	});

	app.post("/api/execute/:workflowId", (req, res) => {
		const w = workflows.getWorkflow(req.params["workflowId"]!);
		if (!w) return void res.status(404).json({ error: "Workflow not found" });
		try {
			const executionId = startExecution(w, (req.body as { input?: string }).input ?? "", opts.cwd ?? process.cwd(), broadcast);
			res.json({ executionId });
		} catch (err) {
			res.status(500).json({ error: String(err) });
		}
	});

	app.delete("/api/execute/:executionId", (req, res) => {
		const ok = abortExecution(req.params["executionId"]!);
		if (!ok) return void res.status(404).json({ error: "Execution not found" });
		res.status(204).end();
	});

	app.get("/api/local-models", async (_req, res) => {
		try {
			const response = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
			if (!response.ok) return void res.json({ models: [], available: false });
			const data = (await response.json()) as { models?: { name: string }[] };
			const models = (data.models ?? []).map((m) => m.name);
			res.json({ models, available: true });
		} catch {
			res.json({ models: [], available: false });
		}
	});

	if (fs.existsSync(opts.uiDist)) {
		app.use(express.static(opts.uiDist));
		app.get(/.*/, (_req, res) => {
			res.sendFile(path.join(opts.uiDist, "index.html"));
		});
	}

	await new Promise<void>((resolve) => httpServer.listen(opts.port, resolve));

	return () => {
		agentWatcher.close();
		workflowWatcher.close();
		wss.close();
		httpServer.close();
		clients.clear();
	};
}
