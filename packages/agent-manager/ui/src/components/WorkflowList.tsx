import { useCallback, useEffect, useState } from "react";
import { AgentManagerWs, api } from "../api";
import type { ExecutionProgress, NodeStatus, Workflow, WsEvent } from "../types";

export default function WorkflowList({
	onOpen,
}: {
	onOpen: (w: Workflow) => void;
}) {
	const [workflows, setWorkflows] = useState<Workflow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	// executionId → progress, updated via WS
	const [executions, setExecutions] = useState<Record<string, ExecutionProgress>>({});
	// workflowId → executionId
	const [activeByWorkflow, setActiveByWorkflow] = useState<Record<string, string>>({});

	const load = useCallback(async () => {
		try {
			setWorkflows(await api.workflows.list());
			setError(null);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();

		const ws = new AgentManagerWs();

		ws.on("workflows_changed", () => void load());

		ws.on("execution_start", (e) => {
			const ev = e as Extract<WsEvent, { type: "execution_start" }>;
			setExecutions((prev) => ({
				...prev,
				[ev.executionId]: {
					executionId: ev.executionId,
					workflowId: ev.workflowId,
					nodeStatuses: {},
					nodeOutputs: {},
					status: "running",
				},
			}));
			setActiveByWorkflow((prev) => ({ ...prev, [ev.workflowId]: ev.executionId }));
		});

		ws.on("node_start", (e) => {
			const ev = e as Extract<WsEvent, { type: "node_start" }>;
			setExecutions((prev) => {
				const exec = prev[ev.executionId];
				if (!exec) return prev;
				return {
					...prev,
					[ev.executionId]: {
						...exec,
						nodeStatuses: { ...exec.nodeStatuses, [ev.nodeId]: "running" },
					},
				};
			});
		});

		ws.on("node_complete", (e) => {
			const ev = e as Extract<WsEvent, { type: "node_complete" }>;
			setExecutions((prev) => {
				const exec = prev[ev.executionId];
				if (!exec) return prev;
				return {
					...prev,
					[ev.executionId]: {
						...exec,
						nodeStatuses: { ...exec.nodeStatuses, [ev.nodeId]: "complete" },
						nodeOutputs: { ...exec.nodeOutputs, [ev.nodeId]: ev.output },
					},
				};
			});
		});

		ws.on("node_error", (e) => {
			const ev = e as Extract<WsEvent, { type: "node_error" }>;
			setExecutions((prev) => {
				const exec = prev[ev.executionId];
				if (!exec) return prev;
				return {
					...prev,
					[ev.executionId]: {
						...exec,
						nodeStatuses: { ...exec.nodeStatuses, [ev.nodeId]: "error" },
					},
				};
			});
		});

		ws.on("workflow_complete", (e) => {
			const ev = e as Extract<WsEvent, { type: "workflow_complete" }>;
			setExecutions((prev) => {
				const exec = prev[ev.executionId];
				if (!exec) return prev;
				return { ...prev, [ev.executionId]: { ...exec, status: "complete" } };
			});
		});

		ws.on("workflow_aborted", (e) => {
			const ev = e as Extract<WsEvent, { type: "workflow_aborted" }>;
			setExecutions((prev) => {
				const exec = prev[ev.executionId];
				if (!exec) return prev;
				return { ...prev, [ev.executionId]: { ...exec, status: "aborted" } };
			});
		});

		return () => ws.close();
	}, [load]);

	if (loading) return <Center>Loading workflows…</Center>;
	if (error) return <Center>Error: {error}</Center>;

	return (
		<div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
				<h2 style={{ color: "#e2e8f0", fontSize: "18px" }}>Workflows</h2>
				<span style={{ fontSize: "12px", color: "#475569" }}>
					{workflows.length} workflow{workflows.length !== 1 ? "s" : ""} · manage via CLI
				</span>
			</div>

			{workflows.length === 0 ? (
				<div style={{ textAlign: "center", color: "#64748b", paddingTop: "48px" }}>
					<p style={{ fontSize: "16px", marginBottom: "8px" }}>No workflows yet</p>
					<p style={{ fontSize: "13px", color: "#475569" }}>
						Use <code style={{ color: "#a78bfa" }}>create_workflow</code> in the CLI to build one
					</p>
				</div>
			) : (
				<div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
					{workflows.map((w) => {
						const execId = activeByWorkflow[w.id];
						const execution = execId ? executions[execId] : undefined;
						return (
							<WorkflowCard
								key={w.id}
								workflow={w}
								execution={execution}
								onOpen={() => onOpen(w)}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

function WorkflowCard({
	workflow,
	execution,
	onOpen,
}: {
	workflow: Workflow;
	execution?: ExecutionProgress;
	onOpen: () => void;
}) {
	const updated = new Date(workflow.updatedAt).toLocaleDateString();
	const isRunning = execution?.status === "running";
	const isComplete = execution?.status === "complete";
	const isError = execution?.nodeStatuses
		? Object.values(execution.nodeStatuses).some((s) => s === "error")
		: false;

	const borderColor = isRunning
		? "#fbbf24"
		: isError
			? "#f87171"
			: isComplete
				? "#4ade80"
				: "#2d2d4e";

	return (
		<div
			style={{
				background: "#1e1e35",
				border: `1px solid ${borderColor}`,
				borderRadius: "10px",
				padding: "16px",
				cursor: "pointer",
				transition: "border-color 0.2s",
			}}
			onClick={onOpen}
		>
			{/* Header */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
				<span style={{ fontWeight: "600", color: "#e2e8f0", fontSize: "15px" }}>{workflow.name}</span>
				{execution && <StatusBadge status={execution.status} />}
			</div>

			<div style={{ fontSize: "12px", color: "#475569", marginBottom: "12px" }}>
				{workflow.nodes.length} node{workflow.nodes.length !== 1 ? "s" : ""}
				{" · "}
				{workflow.edges.length} edge{workflow.edges.length !== 1 ? "s" : ""}
				{" · "}
				{updated}
			</div>

			{/* Pipeline step indicators */}
			{workflow.nodes.length > 0 && (
				<div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", marginBottom: "12px" }}>
					{workflow.nodes.map((n, i) => {
						const nodeStatus = execution?.nodeStatuses[n.id];
						return (
							<>
								{i > 0 && (
									<span style={{ color: "#2d2d4e", fontSize: "10px" }}>→</span>
								)}
								<NodeStep
									key={n.id}
									nodeId={n.id}
									agentName={n.data.agentName}
									status={nodeStatus}
								/>
							</>
						);
					})}
				</div>
			)}

			{/* Node output preview during/after execution */}
			{execution && Object.keys(execution.nodeOutputs).length > 0 && (
				<div style={{ borderTop: "1px solid #2d2d4e", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
					{Object.entries(execution.nodeOutputs).map(([nodeId, output]) => (
						<div key={nodeId}>
							<div style={{ fontSize: "10px", color: "#475569", fontFamily: "monospace", marginBottom: "2px" }}>
								{nodeId}
							</div>
							<div
								style={{
									background: "#0f0f1a",
									borderRadius: "4px",
									padding: "5px 8px",
									fontSize: "11px",
									color: "#64748b",
									fontFamily: "monospace",
									maxHeight: "60px",
									overflowY: "auto",
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
								}}
							>
								{output.length > 200 ? `…${output.slice(-200)}` : output}
							</div>
						</div>
					))}
				</div>
			)}

			<div style={{ marginTop: "12px" }}>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onOpen();
					}}
					style={openBtn}
				>
					Open
				</button>
			</div>
		</div>
	);
}

function NodeStep({
	nodeId,
	agentName,
	status,
}: {
	nodeId: string;
	agentName: string;
	status?: NodeStatus;
}) {
	const color =
		status === "running"
			? "#fbbf24"
			: status === "complete"
				? "#4ade80"
				: status === "error"
					? "#f87171"
					: "#3f3f6e";

	return (
		<div
			title={`${nodeId}: ${agentName}`}
			style={{
				display: "flex",
				alignItems: "center",
				gap: "4px",
				background: `${color}18`,
				border: `1px solid ${color}`,
				borderRadius: "5px",
				padding: "2px 8px",
				fontSize: "11px",
				color,
				whiteSpace: "nowrap",
			}}
		>
			{status === "running" && <span style={{ fontSize: "9px" }}>⏳</span>}
			{status === "complete" && <span style={{ fontSize: "9px" }}>✓</span>}
			{status === "error" && <span style={{ fontSize: "9px" }}>✗</span>}
			<span style={{ fontFamily: "monospace", fontSize: "10px" }}>{nodeId}</span>
			<span style={{ color: "#64748b", fontSize: "10px" }}>{agentName}</span>
		</div>
	);
}

function StatusBadge({ status }: { status: ExecutionProgress["status"] }) {
	const map = {
		running: { label: "running", color: "#fbbf24" },
		complete: { label: "complete", color: "#4ade80" },
		error: { label: "error", color: "#f87171" },
		aborted: { label: "aborted", color: "#94a3b8" },
	};
	const { label, color } = map[status];
	return (
		<span
			style={{
				fontSize: "10px",
				color,
				background: `${color}18`,
				border: `1px solid ${color}`,
				padding: "2px 8px",
				borderRadius: "4px",
				fontWeight: "500",
			}}
		>
			{status === "running" && "⏳ "}{label}
		</span>
	);
}

function Center({ children }: { children: React.ReactNode }) {
	return (
		<div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "#64748b" }}>
			{children}
		</div>
	);
}

const openBtn: React.CSSProperties = {
	background: "#7c3aed",
	border: "none",
	color: "white",
	padding: "6px 14px",
	borderRadius: "5px",
	cursor: "pointer",
	fontSize: "12px",
	fontWeight: "500",
};
