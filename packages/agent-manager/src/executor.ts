import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { UsageStats, Workflow, WorkflowNode, WsEvent } from "./types.ts";

const MAX_CONCURRENCY = 4;

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

function topologicalSort(nodes: WorkflowNode[], edges: { source: string; target: string }[]): string[] {
	const inDegree = new Map<string, number>();
	const adj = new Map<string, string[]>();

	for (const n of nodes) {
		inDegree.set(n.id, 0);
		adj.set(n.id, []);
	}
	for (const e of edges) {
		adj.get(e.source)?.push(e.target);
		inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
	}

	const queue: string[] = [];
	for (const [id, deg] of inDegree) {
		if (deg === 0) queue.push(id);
	}

	const order: string[] = [];
	while (queue.length > 0) {
		const id = queue.shift()!;
		order.push(id);
		for (const next of adj.get(id) ?? []) {
			const deg = (inDegree.get(next) ?? 1) - 1;
			inDegree.set(next, deg);
			if (deg === 0) queue.push(next);
		}
	}

	if (order.length !== nodes.length) {
		throw new Error("Workflow contains a cycle");
	}
	return order;
}

function buildParallelGroups(order: string[], edges: { source: string; target: string }[]): string[][] {
	const level = new Map<string, number>();
	const predecessors = new Map<string, string[]>();

	for (const e of edges) {
		if (!predecessors.has(e.target)) predecessors.set(e.target, []);
		predecessors.get(e.target)!.push(e.source);
	}

	for (const id of order) {
		const preds = predecessors.get(id) ?? [];
		if (preds.length === 0) {
			level.set(id, 0);
		} else {
			level.set(id, Math.max(...preds.map((p) => level.get(p)!)) + 1);
		}
	}

	const groups = new Map<number, string[]>();
	for (const id of order) {
		const l = level.get(id)!;
		if (!groups.has(l)) groups.set(l, []);
		groups.get(l)!.push(id);
	}

	return Array.from(groups.keys())
		.sort((a, b) => a - b)
		.map((l) => groups.get(l)!);
}

function substituteTemplates(template: string, outputs: Record<string, string>, input: string): string {
	let result = template.replace(/\{\{input\}\}/g, input);
	for (const [nodeId, output] of Object.entries(outputs)) {
		result = result.replace(new RegExp(`\\{\\{${nodeId}\\}\\}`, "g"), output);
	}
	return result;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

interface AgentConfig {
	name: string;
	systemPrompt: string;
	tools?: string[];
	model?: string;
}

function loadAgentConfig(agentName: string): AgentConfig | undefined {
	const agentsDir = path.join(getAgentDir(), "agents");
	if (!fs.existsSync(agentsDir)) return undefined;

	let files: fs.Dirent[];
	try {
		files = fs.readdirSync(agentsDir, { withFileTypes: true }).filter((e) => e.name.endsWith(".md"));
	} catch {
		return undefined;
	}

	for (const file of files) {
		let content: string;
		try {
			content = fs.readFileSync(path.join(agentsDir, file.name), "utf-8");
		} catch {
			continue;
		}
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		if (frontmatter.name === agentName) {
			const tools = frontmatter.tools
				?.split(",")
				.map((t: string) => t.trim())
				.filter(Boolean);
			return { name: frontmatter.name, systemPrompt: body, tools, model: frontmatter.model };
		}
	}
	return undefined;
}

async function runSingleNode(
	node: WorkflowNode,
	task: string,
	cwd: string,
	executionId: string,
	signal: AbortSignal,
	onEvent: (e: WsEvent) => void,
): Promise<{ output: string; usage: UsageStats }> {
	const agent = loadAgentConfig(node.data.agentName);
	if (!agent) {
		throw new Error(`Agent "${node.data.agentName}" not found`);
	}

	const usage: UsageStats = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		contextTokens: 0,
		turns: 0,
	};

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools?.length) args.push("--tools", agent.tools.join(","));

	let tmpDir: string | null = null;
	let tmpFile: string | null = null;

	try {
		if (agent.systemPrompt.trim()) {
			tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-agent-mgr-"));
			tmpFile = path.join(tmpDir, `prompt-${node.data.agentName}.md`);
			await fs.promises.writeFile(tmpFile, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
			args.push("--append-system-prompt", tmpFile);
		}
		args.push(`Task: ${task}`);

		let lastOutput = "";
		let stderrOutput = "";

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: Record<string, unknown>;
				try {
					event = JSON.parse(line) as Record<string, unknown>;
				} catch {
					return;
				}

				if (event["type"] === "message_end" && event["message"]) {
					const msg = event["message"] as Record<string, unknown>;
					if (msg["role"] === "assistant") {
						usage.turns++;
						const u = msg["usage"] as Record<string, unknown> | undefined;
						if (u) {
							usage.input += (u["input"] as number) ?? 0;
							usage.output += (u["output"] as number) ?? 0;
							usage.cacheRead += (u["cacheRead"] as number) ?? 0;
							usage.cacheWrite += (u["cacheWrite"] as number) ?? 0;
							const cost = u["cost"] as Record<string, number> | undefined;
							usage.cost += cost?.["total"] ?? 0;
							usage.contextTokens = (u["totalTokens"] as number) ?? 0;
						}
						const content = msg["content"] as Array<Record<string, unknown>> | undefined;
						for (const part of content ?? []) {
							if (part["type"] === "text") {
								lastOutput = (part["text"] as string) ?? "";
								onEvent({ type: "node_output", executionId, nodeId: node.id, partial: lastOutput });
							}
						}
					}
				}
			};

			proc.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data: Buffer) => {
				stderrOutput += data.toString();
			});

			proc.on("close", (code: number | null) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", (err) => {
				stderrOutput += err.message;
				resolve(1);
			});

			const killProc = () => {
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 5000);
			};

			if (signal.aborted) {
				killProc();
			} else {
				signal.addEventListener("abort", killProc, { once: true });
			}
		});

		if (signal.aborted) throw new Error("aborted");
		if (exitCode !== 0) {
			const detail = stderrOutput.trim() || lastOutput.trim() || `exit code ${exitCode}`;
			throw new Error(`Agent "${node.data.agentName}" failed: ${detail}`);
		}

		return { output: lastOutput, usage };
	} finally {
		if (tmpFile) {
			try {
				fs.unlinkSync(tmpFile);
			} catch {
				/* ignore */
			}
		}
		if (tmpDir) {
			try {
				fs.rmdirSync(tmpDir);
			} catch {
				/* ignore */
			}
		}
	}
}

export async function runWorkflow(
	workflow: Workflow,
	input: string,
	cwd: string,
	signal: AbortSignal,
	onProgress?: (message: string) => void,
): Promise<{ outputs: Record<string, string> }> {
	const order = topologicalSort(workflow.nodes, workflow.edges);
	const groups = buildParallelGroups(order, workflow.edges);
	const outputs: Record<string, string> = {};
	const executionId = crypto.randomUUID();

	for (const group of groups) {
		if (signal.aborted) throw new Error("aborted");

		await mapWithConcurrencyLimit(group, MAX_CONCURRENCY, async (nodeId) => {
			if (signal.aborted) return;
			const node = workflow.nodes.find((n) => n.id === nodeId);
			if (!node) return;

			const task = substituteTemplates(node.data.taskTemplate, outputs, input);
			onProgress?.(`▶ ${node.id} (${node.data.agentName})`);

			try {
				const { output, usage } = await runSingleNode(node, task, cwd, executionId, signal, () => {});
				outputs[nodeId] = output;
				onProgress?.(
					`✓ ${node.id} (${node.data.agentName}) — ${usage.turns} turn${usage.turns !== 1 ? "s" : ""}` +
						(usage.cost > 0 ? `, $${usage.cost.toFixed(4)}` : ""),
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg === "aborted") throw err;
				onProgress?.(`✗ ${node.id} (${node.data.agentName}): ${msg}`);
				outputs[nodeId] = "";
			}
		});
	}

	return { outputs };
}

export interface ExecutionState {
	id: string;
	workflowId: string;
	abortController: AbortController;
	status: "running" | "complete" | "error" | "aborted";
}

const activeExecutions = new Map<string, ExecutionState>();

export function abortExecution(id: string): boolean {
	const exec = activeExecutions.get(id);
	if (!exec) return false;
	exec.abortController.abort();
	return true;
}

export function hasExecution(id: string): boolean {
	return activeExecutions.has(id);
}

export function startExecution(
	workflow: Workflow,
	input: string,
	cwd: string,
	onEvent: (e: WsEvent) => void,
): string {
	const executionId = crypto.randomUUID();
	const abortController = new AbortController();

	const state: ExecutionState = {
		id: executionId,
		workflowId: workflow.id,
		abortController,
		status: "running",
	};
	activeExecutions.set(executionId, state);

	onEvent({ type: "execution_start", executionId, workflowId: workflow.id });

	(async () => {
		try {
			const order = topologicalSort(workflow.nodes, workflow.edges);
			const groups = buildParallelGroups(order, workflow.edges);
			const outputs: Record<string, string> = {};

			for (const group of groups) {
				if (abortController.signal.aborted) throw new Error("aborted");

				await mapWithConcurrencyLimit(group, MAX_CONCURRENCY, async (nodeId) => {
					if (abortController.signal.aborted) return;

					const node = workflow.nodes.find((n) => n.id === nodeId);
					if (!node) return;

					const task = substituteTemplates(node.data.taskTemplate, outputs, input);
					onEvent({ type: "node_start", executionId, nodeId, agentName: node.data.agentName });

					try {
						const { output, usage } = await runSingleNode(
							node,
							task,
							cwd,
							executionId,
							abortController.signal,
							onEvent,
						);
						outputs[nodeId] = output;
						onEvent({ type: "node_complete", executionId, nodeId, output, usage });
					} catch (err) {
						const error = err instanceof Error ? err.message : String(err);
						if (error === "aborted") throw err;
						onEvent({ type: "node_error", executionId, nodeId, error });
						outputs[nodeId] = "";
					}
				});
			}

			state.status = "complete";
			onEvent({ type: "workflow_complete", executionId, outputs });
		} catch {
			if (abortController.signal.aborted) {
				state.status = "aborted";
				onEvent({ type: "workflow_aborted", executionId });
			} else {
				state.status = "error";
			}
		} finally {
			activeExecutions.delete(executionId);
		}
	})();

	return executionId;
}
