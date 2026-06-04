import { exec } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as agents from "./agents.ts";
import { runWorkflow } from "./executor.ts";
import { startServer } from "./server.ts";
import * as workflows from "./workflows.ts";

function getOpenCommand(): string {
	if (process.platform === "darwin") return "open";
	if (process.platform === "win32") return "start";
	return "xdg-open";
}

function autoLayout(
	nodeIds: string[],
	edges: { source: string; target: string }[],
): Record<string, { x: number; y: number }> {
	const adj = new Map<string, string[]>();
	const inDegree = new Map<string, number>();
	for (const id of nodeIds) {
		adj.set(id, []);
		inDegree.set(id, 0);
	}
	for (const e of edges) {
		adj.get(e.source)?.push(e.target);
		inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
	}

	const levels = new Map<string, number>();
	const queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
	queue.forEach((id) => levels.set(id, 0));
	let i = 0;
	while (i < queue.length) {
		const id = queue[i++]!;
		for (const next of adj.get(id) ?? []) {
			const newLevel = (levels.get(id) ?? 0) + 1;
			if (!levels.has(next) || levels.get(next)! < newLevel) levels.set(next, newLevel);
			if (!queue.includes(next)) queue.push(next);
		}
	}
	for (const id of nodeIds) {
		if (!levels.has(id)) levels.set(id, 0);
	}

	const byLevel = new Map<number, string[]>();
	for (const [id, level] of levels) {
		if (!byLevel.has(level)) byLevel.set(level, []);
		byLevel.get(level)!.push(id);
	}

	const positions: Record<string, { x: number; y: number }> = {};
	for (const [level, ids] of byLevel) {
		ids.forEach((id, j) => {
			positions[id] = { x: 80 + level * 280, y: 80 + j * 160 };
		});
	}
	return positions;
}

// ─── Tool parameter schemas ───────────────────────────────────────────────────

const ListAgentsParams = Type.Object({});

const CreateAgentParams = Type.Object({
	name: Type.String({ description: "Agent identifier, e.g. researcher (snake_case)" }),
	description: Type.String({ description: "Short description of what this agent does" }),
	model: Type.Optional(
		Type.String({ description: "Model ID, e.g. claude-sonnet-4-6 (defaults to claude-sonnet-4-6)" }),
	),
	tools: Type.Optional(
		Type.Array(Type.String(), {
			description: "Tool names the agent may use: read, bash, write, edit, grep, find, ls",
		}),
	),
	systemPrompt: Type.Optional(
		Type.String({ description: "System prompt describing the agent's behavior and expertise" }),
	),
});

const ListWorkflowsParams = Type.Object({});

const GetWorkflowParams = Type.Object({
	id: Type.String({ description: "Workflow ID" }),
});

const WorkflowNodeSchema = Type.Object({
	id: Type.String({
		description: "Short node identifier, e.g. n1, n2. Used in {{n1}} template references",
	}),
	agentName: Type.String({ description: "Name of the agent assigned to this node" }),
	taskTemplate: Type.String({
		description:
			"Task prompt for this node. Use {{input}} for the workflow's input and {{n1}} to pass output of node n1",
	}),
});

const WorkflowEdgeSchema = Type.Object({
	source: Type.String({ description: "Source node ID" }),
	target: Type.String({ description: "Target node ID — receives source's output via {{source}}" }),
});

const CreateWorkflowParams = Type.Object({
	name: Type.String({ description: "Human-readable workflow name" }),
	nodes: Type.Array(WorkflowNodeSchema, {
		description: "Ordered list of agent nodes. Nodes without incoming edges start in parallel",
	}),
	edges: Type.Array(WorkflowEdgeSchema, {
		description: "Directed edges defining data flow between nodes",
	}),
});

const UpdateWorkflowParams = Type.Object({
	id: Type.String({ description: "Workflow ID to update" }),
	name: Type.Optional(Type.String({ description: "New workflow name" })),
	nodes: Type.Optional(
		Type.Array(WorkflowNodeSchema, { description: "Full replacement node list" }),
	),
	edges: Type.Optional(
		Type.Array(WorkflowEdgeSchema, { description: "Full replacement edge list" }),
	),
});

const GetAgentParams = Type.Object({
	name: Type.String({ description: "Agent name" }),
});

const UpdateAgentParams = Type.Object({
	name: Type.String({ description: "Agent name to update" }),
	description: Type.Optional(Type.String({ description: "New description" })),
	model: Type.Optional(Type.String({ description: "New model ID" })),
	tools: Type.Optional(
		Type.Array(Type.String(), { description: "Full replacement tool list: read, bash, write, edit, grep, find, ls" }),
	),
	systemPrompt: Type.Optional(Type.String({ description: "New system prompt" })),
});

const DeleteAgentParams = Type.Object({
	name: Type.String({ description: "Agent name to delete" }),
});

const DeleteWorkflowParams = Type.Object({
	id: Type.String({ description: "Workflow ID to delete" }),
});

const RunWorkflowParams = Type.Object({
	id: Type.String({ description: "Workflow ID to execute" }),
	input: Type.Optional(
		Type.String({ description: "Input string injected as {{input}} in all task templates" }),
	),
});

// ─── Extension factory ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let cleanup: (() => void) | undefined;

	pi.registerCommand("agents", {
		description: "Open the Agent Manager UI in your browser",
		handler: async (_args, ctx) => {
			const url = "http://localhost:3737";
			if (cleanup) {
				ctx.ui.notify(`Agent Manager already running at ${url}`, "info");
				exec(`${getOpenCommand()} "${url}"`);
				return;
			}

			const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
			const port = 3737;

			try {
				cleanup = await startServer({
					uiDist: join(pkgRoot, "dist", "ui"),
					port,
					cwd: ctx.cwd,
				});
				exec(`${getOpenCommand()} "${url}"`);
				ctx.ui.setStatus("agent-manager", `⚙ agents :${port}`);
				ctx.ui.notify(`Agent Manager opened at ${url}`);
			} catch (err) {
				ctx.ui.notify(`Failed to start Agent Manager: ${String(err)}`, "error");
			}
		},
	});

	// ─── Agent tools ─────────────────────────────────────────────────────────

	pi.registerTool({
		name: "list_agents",
		label: "List agents",
		description: "List all available agents with their name, description, model, and tools",
		parameters: ListAgentsParams,
		async execute() {
			const list = agents.listAgents();
			if (list.length === 0) {
				return { content: [{ type: "text", text: "No agents found. Use create_agent to add one." }], details: undefined };
			}
			const lines = list.map(
				(a) =>
					`• ${a.name} (${a.model ?? "claude-sonnet-4-6"}) — ${a.description}${a.tools?.length ? ` [tools: ${a.tools.join(", ")}]` : ""}`,
			);
			return { content: [{ type: "text", text: lines.join("\n") }], details: undefined };
		},
	});

	pi.registerTool({
		name: "create_agent",
		label: "Create agent",
		description:
			"Create a new agent. The agent will appear immediately in the Agent Manager UI.",
		promptSnippet: "create_agent — create a new pi agent with a name, description, model, tools, and system prompt",
		parameters: CreateAgentParams,
		async execute(_toolCallId, params) {
			try {
				const agent = agents.createAgent({
					name: params.name,
					description: params.description,
					model: params.model ?? "claude-sonnet-4-6",
					tools: params.tools ?? ["read", "bash", "grep", "find", "ls"],
					systemPrompt: params.systemPrompt ?? "",
				});
				return {
					content: [
						{
							type: "text",
							text: `Created agent "${agent.name}" (${agent.model}) at ${agent.filePath}`,
						},
					],
					details: undefined,
				};
			} catch (err) {
				return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true, details: undefined };
			}
		},
	});

	pi.registerTool({
		name: "get_agent",
		label: "Get agent",
		description: "Get full details of an agent including its system prompt",
		parameters: GetAgentParams,
		async execute(_toolCallId, params) {
			const agent = agents.getAgent(params.name);
			if (!agent) {
				return {
					content: [{ type: "text", text: `Agent "${params.name}" not found. Use list_agents to see available agents.` }],
					isError: true,
					details: undefined,
				};
			}
			const lines = [
				`Agent: ${agent.name}`,
				`Description: ${agent.description}`,
				`Model: ${agent.model ?? "claude-sonnet-4-6"}`,
				`Tools: ${agent.tools?.join(", ") ?? "none"}`,
				`\nSystem prompt:\n${agent.systemPrompt.trim() || "(empty)"}`,
			];
			return { content: [{ type: "text", text: lines.join("\n") }], details: undefined };
		},
	});

	pi.registerTool({
		name: "update_agent",
		label: "Update agent",
		description:
			"Update an existing agent's description, model, tools, or system prompt. Only provide the fields you want to change — others are preserved. The name cannot be changed.",
		promptSnippet: "update_agent — modify an existing agent's description, model, tools, or system prompt",
		parameters: UpdateAgentParams,
		async execute(_toolCallId, params) {
			const existing = agents.getAgent(params.name);
			if (!existing) {
				return {
					content: [{ type: "text", text: `Agent "${params.name}" not found.` }],
					isError: true,
					details: undefined,
				};
			}
			try {
				const updated = agents.updateAgent(params.name, {
					name: existing.name,
					description: params.description ?? existing.description,
					model: params.model ?? existing.model,
					tools: params.tools ?? existing.tools,
					systemPrompt: params.systemPrompt ?? existing.systemPrompt,
				});
				return {
					content: [{ type: "text", text: `Updated agent "${updated.name}"` }],
					details: undefined,
				};
			} catch (err) {
				return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true, details: undefined };
			}
		},
	});

	pi.registerTool({
		name: "delete_agent",
		label: "Delete agent",
		description: "Permanently delete an agent. This cannot be undone.",
		parameters: DeleteAgentParams,
		async execute(_toolCallId, params) {
			try {
				agents.deleteAgent(params.name);
				return {
					content: [{ type: "text", text: `Deleted agent "${params.name}"` }],
					details: undefined,
				};
			} catch (err) {
				return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true, details: undefined };
			}
		},
	});

	// ─── Workflow tools ───────────────────────────────────────────────────────

	pi.registerTool({
		name: "list_workflows",
		label: "List workflows",
		description: "List all saved workflows with their names, node counts, and IDs",
		parameters: ListWorkflowsParams,
		async execute() {
			const list = workflows.listWorkflows();
			if (list.length === 0) {
				return {
					content: [{ type: "text", text: "No workflows found. Use create_workflow to build one." }],
					details: undefined,
				};
			}
			const lines = list.map(
				(w) =>
					`• [${w.id}] ${w.name} — ${w.nodes.length} node${w.nodes.length !== 1 ? "s" : ""}, ${w.edges.length} edge${w.edges.length !== 1 ? "s" : ""}`,
			);
			return { content: [{ type: "text", text: lines.join("\n") }], details: undefined };
		},
	});

	pi.registerTool({
		name: "get_workflow",
		label: "Get workflow",
		description: "Get full details of a workflow including all nodes and edges",
		parameters: GetWorkflowParams,
		async execute(_toolCallId, params) {
			const w = workflows.getWorkflow(params.id);
			if (!w) {
				return {
					content: [{ type: "text", text: `Workflow "${params.id}" not found. Use list_workflows to see available IDs.` }],
					isError: true,
					details: undefined,
				};
			}
			const nodeLines = w.nodes.map(
				(n) => `  ${n.id} (${n.data.agentName}): ${n.data.taskTemplate}`,
			);
			const edgeLines = w.edges.map((e) => `  ${e.source} → ${e.target}`);
			const text = [
				`Workflow: ${w.name} [${w.id}]`,
				`Nodes:\n${nodeLines.join("\n") || "  (none)"}`,
				`Edges:\n${edgeLines.join("\n") || "  (none)"}`,
			].join("\n\n");
			return { content: [{ type: "text", text }], details: undefined };
		},
	});

	pi.registerTool({
		name: "create_workflow",
		label: "Create workflow",
		description:
			"Create a new agent workflow DAG. Nodes without incoming edges run first (in parallel). Use {{input}} in task templates for the workflow's input string, and {{nodeId}} to pipe one node's output into another's task.",
		promptSnippet:
			"create_workflow — build a DAG workflow connecting agents in sequence or parallel",
		parameters: CreateWorkflowParams,
		async execute(_toolCallId, params) {
			try {
				const edgeList = params.edges.map((e, i) => ({ id: `e${i + 1}`, ...e }));
				const positions = autoLayout(
					params.nodes.map((n) => n.id),
					edgeList,
				);
				const nodeList = params.nodes.map((n) => ({
					id: n.id,
					type: "agent" as const,
					data: { agentName: n.agentName, taskTemplate: n.taskTemplate },
					position: positions[n.id] ?? { x: 80, y: 80 },
				}));
				const w = workflows.createWorkflow({
					name: params.name,
					nodes: nodeList,
					edges: edgeList,
				});
				const nodeDesc = params.nodes.map((n) => `${n.id}:${n.agentName}`).join(" → ");
				return {
					content: [
						{
							type: "text",
							text: `Created workflow "${w.name}" [${w.id}]\nPipeline: ${nodeDesc}`,
						},
					],
					details: undefined,
				};
			} catch (err) {
				return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true, details: undefined };
			}
		},
	});

	pi.registerTool({
		name: "update_workflow",
		label: "Update workflow",
		description:
			"Update an existing workflow's name, nodes, or edges. Providing nodes/edges replaces them entirely — use get_workflow first to see the current structure.",
		parameters: UpdateWorkflowParams,
		async execute(_toolCallId, params) {
			const existing = workflows.getWorkflow(params.id);
			if (!existing) {
				return {
					content: [{ type: "text", text: `Workflow "${params.id}" not found.` }],
					isError: true,
					details: undefined,
				};
			}
			try {
				const patch: Partial<typeof existing> = {};
				if (params.name) patch.name = params.name;

				if (params.nodes) {
					const edgeList = (params.edges ?? existing.edges).map((e, i) => ({
						id: `e${i + 1}`,
						source: e.source,
						target: e.target,
					}));
					const positions = autoLayout(
						params.nodes.map((n) => n.id),
						edgeList,
					);
					patch.nodes = params.nodes.map((n) => ({
						id: n.id,
						type: "agent" as const,
						data: { agentName: n.agentName, taskTemplate: n.taskTemplate },
						position: positions[n.id] ?? { x: 80, y: 80 },
					}));
					patch.edges = edgeList;
				} else if (params.edges) {
					patch.edges = params.edges.map((e, i) => ({ id: `e${i + 1}`, ...e }));
				}

				const updated = workflows.updateWorkflow(params.id, patch);
				return {
					content: [
						{
							type: "text",
							text: `Updated workflow "${updated.name}" [${updated.id}] — ${updated.nodes.length} nodes, ${updated.edges.length} edges`,
						},
					],
					details: undefined,
				};
			} catch (err) {
				return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true, details: undefined };
			}
		},
	});

	pi.registerTool({
		name: "delete_workflow",
		label: "Delete workflow",
		description: "Permanently delete a workflow. This cannot be undone.",
		parameters: DeleteWorkflowParams,
		async execute(_toolCallId, params) {
			try {
				workflows.deleteWorkflow(params.id);
				return {
					content: [{ type: "text", text: `Deleted workflow "${params.id}"` }],
					details: undefined,
				};
			} catch (err) {
				return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true, details: undefined };
			}
		},
	});

	pi.registerTool({
		name: "run_workflow",
		label: "Run workflow",
		description:
			"Execute a workflow end-to-end and return the outputs of every node. Each node runs its assigned agent with the task template. Use {{input}} in templates for the provided input string, and {{nodeId}} to pass one node's output into another's task.",
		promptSnippet:
			"run_workflow — execute a workflow pipeline and return per-node outputs",
		parameters: RunWorkflowParams,
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const w = workflows.getWorkflow(params.id);
			if (!w) {
				return {
					content: [{ type: "text", text: `Workflow "${params.id}" not found. Use list_workflows to see available IDs.` }],
					isError: true,
					details: undefined,
				};
			}
			if (w.nodes.length === 0) {
				return {
					content: [{ type: "text", text: `Workflow "${w.name}" has no nodes.` }],
					isError: true,
					details: undefined,
				};
			}

			const progressLines: string[] = [`Running workflow "${w.name}" (${w.nodes.length} nodes)…`];
			const update = (msg: string) => {
				progressLines.push(msg);
				onUpdate?.({ content: [{ type: "text", text: progressLines.join("\n") }], details: undefined });
			};

			const abortSignal = signal ?? new AbortController().signal;

			try {
				const { outputs } = await runWorkflow(w, params.input ?? "", ctx.cwd, abortSignal, update);

				const outputSections = Object.entries(outputs)
					.filter(([, v]) => v.trim())
					.map(([id, out]) => {
						const node = w.nodes.find((n) => n.id === id);
						const header = node ? `## ${id} — ${node.data.agentName}` : `## ${id}`;
						return `${header}\n${out}`;
					});

				const finalText =
					progressLines.join("\n") +
					(outputSections.length > 0 ? "\n\n" + outputSections.join("\n\n") : "\n\n(no output)");

				return { content: [{ type: "text", text: finalText }], details: undefined };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: progressLines.join("\n") + `\n\nFailed: ${msg}` }],
					isError: true,
					details: undefined,
				};
			}
		},
	});

	pi.on("session_shutdown", () => {
		cleanup?.();
		cleanup = undefined;
	});
}
