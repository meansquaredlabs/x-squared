import { useCallback, useEffect, useState } from "react";
import { AgentManagerWs, api } from "../api";
import type { AgentFile } from "../types";

const TOOLS_PRESETS = ["read", "bash", "write", "edit", "grep", "find", "ls"];
const MODEL_PRESETS = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"];

export default function AgentList() {
	const [agents, setAgents] = useState<AgentFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setAgents(await api.agents.list());
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
		const unsub = ws.on("agents_changed", () => void load());
		return () => {
			unsub();
			ws.close();
		};
	}, [load]);

	if (loading) return <CenterMsg>Loading agents…</CenterMsg>;
	if (error) return <CenterMsg>Error: {error}</CenterMsg>;

	return (
		<div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
				<h2 style={{ color: "#e2e8f0", fontSize: "18px" }}>Agents</h2>
				<span style={{ fontSize: "12px", color: "#475569" }}>
					{agents.length} agent{agents.length !== 1 ? "s" : ""} · manage via CLI
				</span>
			</div>

			{agents.length === 0 ? (
				<div style={{ textAlign: "center", color: "#64748b", paddingTop: "48px" }}>
					<p style={{ fontSize: "16px", marginBottom: "8px" }}>No agents yet</p>
					<p style={{ fontSize: "13px", color: "#475569" }}>
						Use <code style={{ color: "#a78bfa" }}>create_agent</code> in the CLI to create one
					</p>
				</div>
			) : (
				<div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
					{agents.map((agent) => (
						<AgentCard key={agent.name} agent={agent} />
					))}
				</div>
			)}
		</div>
	);
}

function AgentCard({ agent }: { agent: AgentFile }) {
	const [expanded, setExpanded] = useState(false);
	const model = agent.model ?? "claude-sonnet-4-6";
	const isKnown = MODEL_PRESETS.includes(model);

	return (
		<div
			style={{
				background: "#1e1e35",
				border: "1px solid #2d2d4e",
				borderRadius: "10px",
				overflow: "hidden",
			}}
		>
			<div style={{ padding: "16px" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
					<span style={{ fontWeight: "700", color: "#e2e8f0", fontSize: "15px" }}>{agent.name}</span>
					<span
						style={{
							fontSize: "10px",
							fontFamily: "monospace",
							background: isKnown ? "#7c3aed33" : "#374151",
							border: `1px solid ${isKnown ? "#7c3aed66" : "#4b5563"}`,
							color: isKnown ? "#a78bfa" : "#9ca3af",
							padding: "2px 8px",
							borderRadius: "4px",
							whiteSpace: "nowrap",
						}}
					>
						{model}
					</span>
				</div>

				<p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5", marginBottom: "10px" }}>
					{agent.description}
				</p>

				{agent.tools && agent.tools.length > 0 && (
					<div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "10px" }}>
						{agent.tools.map((t) => (
							<span
								key={t}
								style={{
									background: TOOLS_PRESETS.includes(t) ? "#0e749022" : "#37415122",
									border: `1px solid ${TOOLS_PRESETS.includes(t) ? "#0e749066" : "#4b556366"}`,
									color: TOOLS_PRESETS.includes(t) ? "#22d3ee" : "#9ca3af",
									borderRadius: "4px",
									padding: "1px 7px",
									fontSize: "11px",
								}}
							>
								{t}
							</span>
						))}
					</div>
				)}

				{agent.systemPrompt.trim() && (
					<button
						onClick={() => setExpanded((e) => !e)}
						style={{
							background: "transparent",
							border: "1px solid #2d2d4e",
							color: "#64748b",
							padding: "4px 10px",
							borderRadius: "5px",
							cursor: "pointer",
							fontSize: "11px",
							width: "100%",
							textAlign: "left",
						}}
					>
						{expanded ? "▲ Hide system prompt" : "▼ Show system prompt"}
					</button>
				)}
			</div>

			{expanded && agent.systemPrompt.trim() && (
				<div
					style={{
						borderTop: "1px solid #2d2d4e",
						padding: "12px 16px",
						background: "#0f0f1a",
						fontSize: "12px",
						color: "#94a3b8",
						fontFamily: "ui-monospace, monospace",
						whiteSpace: "pre-wrap",
						lineHeight: "1.6",
						maxHeight: "240px",
						overflowY: "auto",
					}}
				>
					{agent.systemPrompt}
				</div>
			)}
		</div>
	);
}

function CenterMsg({ children }: { children: React.ReactNode }) {
	return (
		<div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "#64748b" }}>
			{children}
		</div>
	);
}
