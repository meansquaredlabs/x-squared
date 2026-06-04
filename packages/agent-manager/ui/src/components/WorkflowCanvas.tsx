import {
	Background,
	BackgroundVariant,
	Controls,
	Handle,
	MiniMap,
	Panel,
	Position,
	ReactFlow,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useRef, useState } from "react";
import { AgentManagerWs, api } from "../api";
import type { ExecutionProgress, NodeStatus, Workflow, WorkflowEdge, WorkflowNode, WsEvent } from "../types";
import ExecutionPanel from "./ExecutionPanel";

// ─── Custom agent node ────────────────────────────────────────────────────────

const NodeStatusCtx = { current: {} as Record<string, NodeStatus | undefined> };

function AgentNode({
	id,
	data,
	selected,
}: {
	id: string;
	data: { agentName: string; taskTemplate: string };
	selected: boolean;
}) {
	const status = NodeStatusCtx.current[id];
	const borderColor = selected
		? "#a78bfa"
		: status === "running"
			? "#fbbf24"
			: status === "complete"
				? "#4ade80"
				: status === "error"
					? "#f87171"
					: "#3f3f6e";

	return (
		<div
			style={{
				background: "#1e1e35",
				border: `2px solid ${borderColor}`,
				borderRadius: "10px",
				padding: "10px 14px",
				minWidth: "160px",
				maxWidth: "220px",
				boxShadow: selected ? `0 0 12px ${borderColor}66` : "none",
				transition: "border-color 0.2s",
			}}
		>
			<Handle type="target" position={Position.Left} style={handleStyle} />
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
				<span style={{ fontWeight: "600", color: "#e2e8f0", fontSize: "13px" }}>{data.agentName}</span>
				<span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace", background: "#0f0f1a", padding: "1px 5px", borderRadius: "3px" }}>
					{id}
				</span>
			</div>
			{data.taskTemplate && (
				<div style={{ fontSize: "11px", color: "#64748b", wordBreak: "break-word", lineHeight: "1.4" }}>
					{data.taskTemplate.length > 55 ? `${data.taskTemplate.slice(0, 55)}…` : data.taskTemplate}
				</div>
			)}
			{status === "running" && <div style={{ fontSize: "10px", color: "#fbbf24", marginTop: "4px" }}>⏳ running…</div>}
			{status === "complete" && <div style={{ fontSize: "10px", color: "#4ade80", marginTop: "4px" }}>✓ done</div>}
			{status === "error" && <div style={{ fontSize: "10px", color: "#f87171", marginTop: "4px" }}>✗ error</div>}
			<Handle type="source" position={Position.Right} style={handleStyle} />
		</div>
	);
}

const nodeTypes = { agent: AgentNode };

// ─── Main canvas ──────────────────────────────────────────────────────────────

export default function WorkflowCanvas({
	workflowId,
	onBack,
}: {
	workflowId: string;
	onBack: () => void;
}) {
	const [workflow, setWorkflow] = useState<Workflow | null>(null);
	const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
	const [edges, , onEdgesChange] = useEdgesState<WorkflowEdge>([]);
	const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
	const [progress, setProgress] = useState<ExecutionProgress | null>(null);
	const [runInput, setRunInput] = useState("");
	const [showRunPanel, setShowRunPanel] = useState(false);
	const nodeStatusRef = useRef<Record<string, NodeStatus | undefined>>({});
	const [, forceRender] = useState(0);

	function setNodeStatus(nodeId: string, status: NodeStatus | undefined) {
		nodeStatusRef.current = { ...nodeStatusRef.current, [nodeId]: status };
		NodeStatusCtx.current = nodeStatusRef.current;
		forceRender((n) => n + 1);
	}

	function clearNodeStatuses() {
		nodeStatusRef.current = {};
		NodeStatusCtx.current = {};
		forceRender((n) => n + 1);
	}

	useEffect(() => {
		const loadWorkflow = () => {
			api.workflows.get(workflowId).then((w) => {
				if (w) {
					setWorkflow(w);
					setNodes(w.nodes as WorkflowNode[]);
				}
			});
		};
		loadWorkflow();

		const ws = new AgentManagerWs();

		ws.on("workflows_changed", loadWorkflow);

		ws.on("execution_start", (e) => {
			const ev = e as Extract<WsEvent, { type: "execution_start" }>;
			if (ev.workflowId !== workflowId) return;
			clearNodeStatuses();
			setProgress({
				executionId: ev.executionId,
				workflowId: ev.workflowId,
				nodeStatuses: {},
				nodeOutputs: {},
				status: "running",
			});
		});

		ws.on("node_start", (e) => {
			const ev = e as Extract<WsEvent, { type: "node_start" }>;
			setProgress((p) => p && { ...p, nodeStatuses: { ...p.nodeStatuses, [ev.nodeId]: "running" } });
			setNodeStatus(ev.nodeId, "running");
		});

		ws.on("node_output", (e) => {
			const ev = e as Extract<WsEvent, { type: "node_output" }>;
			setProgress((p) => p && { ...p, nodeOutputs: { ...p.nodeOutputs, [ev.nodeId]: ev.partial } });
		});

		ws.on("node_complete", (e) => {
			const ev = e as Extract<WsEvent, { type: "node_complete" }>;
			setProgress((p) => p && {
				...p,
				nodeStatuses: { ...p.nodeStatuses, [ev.nodeId]: "complete" },
				nodeOutputs: { ...p.nodeOutputs, [ev.nodeId]: ev.output },
			});
			setNodeStatus(ev.nodeId, "complete");
		});

		ws.on("node_error", (e) => {
			const ev = e as Extract<WsEvent, { type: "node_error" }>;
			setProgress((p) => p && {
				...p,
				nodeStatuses: { ...p.nodeStatuses, [ev.nodeId]: "error" },
				nodeOutputs: { ...p.nodeOutputs, [ev.nodeId]: ev.error },
			});
			setNodeStatus(ev.nodeId, "error");
		});

		ws.on("workflow_complete", (e) => {
			const ev = e as Extract<WsEvent, { type: "workflow_complete" }>;
			setProgress((p) => p && { ...p, status: "complete", nodeOutputs: { ...p.nodeOutputs, ...ev.outputs } });
			clearNodeStatuses();
		});

		ws.on("workflow_aborted", () => {
			setProgress((p) => p && { ...p, status: "aborted" });
			clearNodeStatuses();
		});

		return () => ws.close();
	}, [workflowId]);

	async function startRun() {
		if (!workflow) return;
		try {
			await api.execute.start(workflow.id, runInput);
			setShowRunPanel(false);
			setRunInput("");
		} catch (e) {
			alert(String(e));
		}
	}

	async function handleAbort() {
		if (!progress) return;
		try {
			await api.execute.abort(progress.executionId);
		} catch {
			/* ignore */
		}
	}

	function onNodeClick(_: React.MouseEvent, node: { id: string }) {
		const n = nodes.find((x) => x.id === node.id) ?? null;
		setSelectedNode(n);
	}

	return (
		<div style={{ display: "flex", height: "100%" }}>
			{/* Sidebar */}
			<div
				style={{
					width: "200px",
					flexShrink: 0,
					background: "#16162a",
					borderRight: "1px solid #2d2d4e",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<div
					style={{
						padding: "10px 12px",
						borderBottom: "1px solid #2d2d4e",
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<button onClick={onBack} style={backBtn}>←</button>
					<span
						style={{
							fontSize: "12px",
							fontWeight: "600",
							color: "#94a3b8",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{workflow?.name ?? "…"}
					</span>
				</div>

				{/* Node list */}
				<div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
					<p style={{ fontSize: "10px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
						Nodes
					</p>
					{nodes.length === 0 ? (
						<p style={{ fontSize: "11px", color: "#475569" }}>No nodes yet</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
							{nodes.map((n) => {
								const status = nodeStatusRef.current[n.id];
								const color =
									status === "running" ? "#fbbf24" :
									status === "complete" ? "#4ade80" :
									status === "error" ? "#f87171" : "#3f3f6e";
								return (
									<div
										key={n.id}
										onClick={() => setSelectedNode(n)}
										style={{
											padding: "5px 8px",
											borderRadius: "5px",
											border: `1px solid ${color}`,
											cursor: "pointer",
											background: selectedNode?.id === n.id ? "#2d2d4e" : "transparent",
										}}
									>
										<div style={{ display: "flex", justifyContent: "space-between" }}>
											<span style={{ fontSize: "11px", color: "#e2e8f0", fontWeight: "500" }}>{n.data.agentName}</span>
											<span style={{ fontSize: "9px", fontFamily: "monospace", color: "#475569" }}>{n.id}</span>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				<div style={{ padding: "10px 12px" }}>
					<button
						onClick={() => {
							if (nodes.length === 0) { alert("This workflow has no nodes yet. Add nodes via CLI."); return; }
							setShowRunPanel(true);
						}}
						disabled={progress?.status === "running"}
						style={runBtn}
					>
						▶ Run
					</button>
				</div>
			</div>

			{/* Canvas */}
			<div style={{ flex: 1, position: "relative" }}>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onNodeClick={onNodeClick}
					onPaneClick={() => setSelectedNode(null)}
					nodeTypes={nodeTypes}
					nodesDraggable={true}
					nodesConnectable={false}
					fitView
					style={{ background: "#0f0f1a" }}
				>
					<Background color="#1e1e35" variant={BackgroundVariant.Dots} gap={20} />
					<Controls style={{ background: "#1e1e35", border: "1px solid #2d2d4e" }} />
					<MiniMap
						style={{ background: "#16162a", border: "1px solid #2d2d4e" }}
						nodeColor="#7c3aed"
					/>
					<Panel position="top-right">
						<span style={{ fontSize: "11px", color: "#475569" }}>
							{nodes.length} node{nodes.length !== 1 ? "s" : ""}
							{" · "}
							{edges.length} edge{edges.length !== 1 ? "s" : ""}
						</span>
					</Panel>
				</ReactFlow>

				{/* Node detail panel */}
				{selectedNode && (
					<div
						style={{
							position: "absolute",
							top: "16px",
							left: "16px",
							width: "320px",
							background: "#1e1e35",
							border: "1px solid #2d2d4e",
							borderRadius: "8px",
							padding: "14px",
							zIndex: 10,
						}}
					>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
							<span style={{ fontWeight: "600", color: "#e2e8f0", fontSize: "13px" }}>
								{selectedNode.data.agentName}
							</span>
							<div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
								<span style={{ fontSize: "10px", color: "#7c3aed", fontFamily: "monospace", background: "#7c3aed22", padding: "2px 7px", borderRadius: "4px" }}>
									{selectedNode.id}
								</span>
								<button onClick={() => setSelectedNode(null)} style={closeBtn}>✕</button>
							</div>
						</div>

						<p style={{ fontSize: "10px", color: "#475569", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
							Task template
						</p>
						<div
							style={{
								background: "#0f0f1a",
								borderRadius: "5px",
								padding: "8px 10px",
								fontSize: "12px",
								color: "#94a3b8",
								fontFamily: "monospace",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								lineHeight: "1.5",
								maxHeight: "80px",
								overflowY: "auto",
							}}
						>
							{selectedNode.data.taskTemplate || "(empty)"}
						</div>

						{progress?.nodeOutputs[selectedNode.id] && (
							<>
								<p style={{ fontSize: "10px", color: "#475569", marginTop: "10px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
									Output
								</p>
								<div
									style={{
										background: "#0f0f1a",
										borderRadius: "5px",
										padding: "8px 10px",
										fontSize: "11px",
										color: "#64748b",
										fontFamily: "monospace",
										whiteSpace: "pre-wrap",
										wordBreak: "break-word",
										lineHeight: "1.5",
										maxHeight: "120px",
										overflowY: "auto",
									}}
								>
									{progress.nodeOutputs[selectedNode.id]}
								</div>
							</>
						)}
					</div>
				)}

				{/* Run input panel */}
				{showRunPanel && (
					<div
						style={{
							position: "absolute",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							width: "400px",
							background: "#1e1e35",
							border: "1px solid #2d2d4e",
							borderRadius: "10px",
							padding: "20px",
							zIndex: 20,
						}}
					>
						<h3 style={{ color: "#e2e8f0", fontSize: "15px", marginBottom: "12px" }}>Run Workflow</h3>
						<p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
							Replaces <code style={{ color: "#a78bfa" }}>{"{{input}}"}</code> in all task templates.
						</p>
						<textarea
							value={runInput}
							onChange={(e) => setRunInput(e.target.value)}
							placeholder="Describe what you want to accomplish…"
							rows={4}
							style={taskTextarea}
							autoFocus
						/>
						<div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
							<button onClick={() => void startRun()} style={runBtn}>▶ Start</button>
							<button onClick={() => setShowRunPanel(false)} style={cancelBtn}>Cancel</button>
						</div>
					</div>
				)}

				{/* Execution progress overlay */}
				{progress && (
					<ExecutionPanel
						progress={progress}
						onAbort={() => void handleAbort()}
						onClose={() => setProgress(null)}
					/>
				)}
			</div>
		</div>
	);
}

const handleStyle: React.CSSProperties = {
	width: "10px",
	height: "10px",
	background: "#7c3aed",
	border: "2px solid #a78bfa",
};

const backBtn: React.CSSProperties = {
	background: "transparent",
	border: "none",
	color: "#64748b",
	cursor: "pointer",
	fontSize: "16px",
	padding: "2px 4px",
	flexShrink: 0,
};

const closeBtn: React.CSSProperties = {
	background: "transparent",
	border: "none",
	color: "#64748b",
	cursor: "pointer",
	fontSize: "13px",
	padding: "2px 4px",
};

const runBtn: React.CSSProperties = {
	background: "#7c3aed",
	border: "none",
	color: "white",
	padding: "8px 0",
	borderRadius: "6px",
	cursor: "pointer",
	fontSize: "13px",
	fontWeight: "500",
	width: "100%",
};

const cancelBtn: React.CSSProperties = {
	background: "transparent",
	border: "1px solid #3f3f6e",
	color: "#94a3b8",
	padding: "8px 16px",
	borderRadius: "6px",
	cursor: "pointer",
	fontSize: "13px",
};

const taskTextarea: React.CSSProperties = {
	background: "#0f0f1a",
	border: "1px solid #2d2d4e",
	borderRadius: "6px",
	color: "#e2e8f0",
	padding: "8px 12px",
	fontSize: "13px",
	width: "100%",
	resize: "vertical",
	fontFamily: "ui-monospace, monospace",
	outline: "none",
};
