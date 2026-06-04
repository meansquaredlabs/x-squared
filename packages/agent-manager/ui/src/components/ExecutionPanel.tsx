import type { ExecutionProgress, UsageStats } from "../types";

export default function ExecutionPanel({
	progress,
	onAbort,
	onClose,
}: {
	progress: ExecutionProgress;
	onAbort: () => void;
	onClose: () => void;
}) {
	const isRunning = progress.status === "running";
	const nodeIds = Object.keys(progress.nodeStatuses);

	return (
		<div
			style={{
				position: "absolute",
				bottom: "16px",
				right: "16px",
				width: "360px",
				background: "#1e1e35",
				border: "1px solid #2d2d4e",
				borderRadius: "10px",
				boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
				overflow: "hidden",
				zIndex: 100,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "10px 14px",
					borderBottom: "1px solid #2d2d4e",
					background: "#16162a",
				}}
			>
				<span style={{ fontWeight: "600", color: "#e2e8f0", fontSize: "13px" }}>
					{isRunning ? "⏳ Running…" : statusLabel(progress.status)}
				</span>
				<div style={{ display: "flex", gap: "6px" }}>
					{isRunning && (
						<button onClick={onAbort} style={abortBtn}>Abort</button>
					)}
					{!isRunning && (
						<button onClick={onClose} style={closeBtn}>✕</button>
					)}
				</div>
			</div>
			<div style={{ maxHeight: "400px", overflowY: "auto", padding: "12px 14px" }}>
				{nodeIds.map((nodeId) => (
					<NodeRow
						key={nodeId}
						nodeId={nodeId}
						status={progress.nodeStatuses[nodeId]!}
						output={progress.nodeOutputs[nodeId]}
					/>
				))}
				{nodeIds.length === 0 && (
					<p style={{ color: "#64748b", fontSize: "13px" }}>Starting execution…</p>
				)}
			</div>
		</div>
	);
}

function NodeRow({
	nodeId,
	status,
	output,
}: {
	nodeId: string;
	status: string;
	output?: string;
}) {
	const icon = status === "running" ? "⏳" : status === "complete" ? "✓" : status === "error" ? "✗" : "○";
	const color = status === "complete" ? "#4ade80" : status === "error" ? "#f87171" : status === "running" ? "#fbbf24" : "#64748b";

	return (
		<div style={{ marginBottom: "10px" }}>
			<div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
				<span style={{ color, fontSize: "12px" }}>{icon}</span>
				<span style={{ fontSize: "12px", color: "#94a3b8", fontFamily: "monospace" }}>{nodeId}</span>
				<span
					style={{
						fontSize: "10px",
						color,
						background: `${color}22`,
						padding: "1px 5px",
						borderRadius: "3px",
					}}
				>
					{status}
				</span>
			</div>
			{output && (
				<div
					style={{
						background: "#0f0f1a",
						borderRadius: "5px",
						padding: "6px 8px",
						fontSize: "11px",
						color: "#64748b",
						fontFamily: "monospace",
						maxHeight: "80px",
						overflowY: "auto",
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
					}}
				>
					{output.length > 300 ? `${output.slice(-300)}` : output}
				</div>
			)}
		</div>
	);
}

function statusLabel(status: ExecutionProgress["status"]): string {
	if (status === "complete") return "✓ Complete";
	if (status === "error") return "✗ Error";
	if (status === "aborted") return "⊘ Aborted";
	return status;
}

const abortBtn: React.CSSProperties = {
	background: "#7f1d1d33",
	border: "1px solid #7f1d1d",
	color: "#f87171",
	padding: "3px 10px",
	borderRadius: "4px",
	cursor: "pointer",
	fontSize: "11px",
};

const closeBtn: React.CSSProperties = {
	background: "transparent",
	border: "none",
	color: "#64748b",
	padding: "3px 6px",
	cursor: "pointer",
	fontSize: "14px",
};
