import { useEffect, useState } from "react";
import { api } from "../api";
import type { AgentFile } from "../types";

const CLOUD_MODELS = [
	"claude-haiku-4-5",
	"claude-sonnet-4-6",
	"claude-opus-4-7",
];
const TOOLS_OPTIONS = ["read", "bash", "write", "edit", "grep", "find", "ls"];

export default function AgentEditor({
	agent,
	onSave,
	onCancel,
}: {
	agent?: AgentFile;
	onSave: () => void;
	onCancel: () => void;
}) {
	const isNew = !agent;
	const [name, setName] = useState(agent?.name ?? "");
	const [description, setDescription] = useState(agent?.description ?? "");
	const [model, setModel] = useState(agent?.model ?? "claude-sonnet-4-6");
	const [tools, setTools] = useState<string[]>(agent?.tools ?? ["read", "bash", "grep", "find", "ls"]);
	const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [localModels, setLocalModels] = useState<string[]>([]);
	const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
	const [customModel, setCustomModel] = useState("");
	const [showCustom, setShowCustom] = useState(false);

	useEffect(() => {
		fetch("/api/local-models")
			.then((r) => r.json())
			.then((data: { models: string[]; available: boolean }) => {
				setLocalModels(data.models);
				setOllamaAvailable(data.available);
				// If the current model isn't in either list, show the custom input
				const allKnown = [...CLOUD_MODELS, ...data.models];
				if (agent?.model && !allKnown.includes(agent.model)) {
					setShowCustom(true);
					setCustomModel(agent.model);
				}
			})
			.catch(() => setOllamaAvailable(false));
	}, [agent?.model]);

	function toggleTool(t: string) {
		setTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
	}

	function handleModelSelect(value: string) {
		if (value === "__custom__") {
			setShowCustom(true);
		} else {
			setShowCustom(false);
			setModel(value);
		}
	}

	const effectiveModel = showCustom ? customModel.trim() || model : model;

	async function handleSave() {
		if (!name.trim()) { setError("Name is required"); return; }
		if (!description.trim()) { setError("Description is required"); return; }
		if (!effectiveModel) { setError("Model is required"); return; }
		setSaving(true);
		setError(null);
		try {
			const input = { name: name.trim(), description: description.trim(), model: effectiveModel, tools, systemPrompt };
			if (isNew) {
				await api.agents.create(input);
			} else {
				await api.agents.update(agent.name, input);
			}
			onSave();
		} catch (e) {
			setError(String(e));
		} finally {
			setSaving(false);
		}
	}

	const selectorValue = showCustom ? "__custom__" : model;
	const allKnown = [...CLOUD_MODELS, ...localModels];
	const isKnown = allKnown.includes(model);

	return (
		<div style={{ padding: "24px", overflowY: "auto", height: "100%", maxWidth: "720px" }}>
			<div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
				<button onClick={onCancel} style={backBtn}>← Back</button>
				<h2 style={{ color: "#e2e8f0", fontSize: "18px" }}>{isNew ? "New Agent" : `Edit: ${agent.name}`}</h2>
			</div>

			{error && (
				<div style={{ background: "#7f1d1d33", border: "1px solid #7f1d1d", borderRadius: "6px", padding: "10px 14px", color: "#f87171", marginBottom: "16px", fontSize: "13px" }}>
					{error}
				</div>
			)}

			<div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
				<Field label="Name">
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={!isNew}
						placeholder="e.g. scout"
						style={{ ...inputStyle, opacity: isNew ? 1 : 0.6 }}
					/>
					{!isNew && <span style={{ fontSize: "11px", color: "#64748b" }}>Name cannot be changed after creation</span>}
				</Field>

				<Field label="Description">
					<input
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Short description of what this agent does"
						style={inputStyle}
					/>
				</Field>

				<Field label="Model">
					<select
						value={selectorValue}
						onChange={(e) => handleModelSelect(e.target.value)}
						style={selectStyle}
					>
						<optgroup label="Cloud — Anthropic Claude">
							{CLOUD_MODELS.map((m) => (
								<option key={m} value={m}>{m}</option>
							))}
						</optgroup>

						{localModels.length > 0 && (
							<optgroup label="Local — Ollama">
								{localModels.map((m) => (
									<option key={m} value={m}>{m}</option>
								))}
							</optgroup>
						)}

						{!isKnown && !showCustom && model && (
							<optgroup label="Current">
								<option value={model}>{model}</option>
							</optgroup>
						)}

						<optgroup label="Other">
							<option value="__custom__">Custom model name…</option>
						</optgroup>
					</select>

					{/* Ollama status hint */}
					{ollamaAvailable === false && (
						<span style={{ fontSize: "11px", color: "#64748b" }}>
							Ollama not detected at localhost:11434 — start it to see local models
						</span>
					)}
					{ollamaAvailable === true && localModels.length === 0 && (
						<span style={{ fontSize: "11px", color: "#64748b" }}>
							Ollama running but no models pulled — run <code style={{ color: "#a78bfa" }}>ollama pull &lt;model&gt;</code>
						</span>
					)}
					{ollamaAvailable === true && localModels.length > 0 && (
						<span style={{ fontSize: "11px", color: "#4ade80" }}>
							{localModels.length} local model{localModels.length !== 1 ? "s" : ""} available via Ollama
						</span>
					)}

					{/* Custom model input */}
					{showCustom && (
						<div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
							<input
								value={customModel}
								onChange={(e) => {
									setCustomModel(e.target.value);
									setModel(e.target.value);
								}}
								placeholder="e.g. ollama/llama3.2 or mistral"
								style={{ ...inputStyle, flex: 1 }}
								autoFocus
							/>
							<button
								onClick={() => {
									setShowCustom(false);
									if (!customModel.trim()) setModel(CLOUD_MODELS[1]!);
								}}
								style={cancelCustomBtn}
							>
								✕
							</button>
						</div>
					)}
				</Field>

				<Field label="Tools">
					<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
						{TOOLS_OPTIONS.map((t) => (
							<ToolToggle key={t} name={t} active={tools.includes(t)} onClick={() => toggleTool(t)} />
						))}
					</div>
					<div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
						Selected: {tools.length > 0 ? tools.join(", ") : "none"}
					</div>
				</Field>

				<Field label="System Prompt">
					<textarea
						value={systemPrompt}
						onChange={(e) => setSystemPrompt(e.target.value)}
						placeholder="You are a specialized agent. Your role is to..."
						rows={10}
						style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: "13px" }}
					/>
				</Field>

				<div style={{ display: "flex", gap: "8px", paddingBottom: "24px" }}>
					<button onClick={() => void handleSave()} disabled={saving} style={primaryBtn}>
						{saving ? "Saving…" : isNew ? "Create Agent" : "Save Changes"}
					</button>
					<button onClick={onCancel} style={secondaryBtn}>Cancel</button>
				</div>
			</div>
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
			<label style={{ fontSize: "12px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
				{label}
			</label>
			{children}
		</div>
	);
}

function ToolToggle({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
	return (
		<button
			onClick={onClick}
			style={{
				background: active ? "#0e749033" : "transparent",
				border: `1px solid ${active ? "#0e7490" : "#3f3f6e"}`,
				color: active ? "#22d3ee" : "#64748b",
				padding: "4px 10px",
				borderRadius: "5px",
				cursor: "pointer",
				fontSize: "12px",
				fontWeight: active ? "500" : "400",
			}}
		>
			{name}
		</button>
	);
}

const inputStyle: React.CSSProperties = {
	background: "#0f0f1a",
	border: "1px solid #2d2d4e",
	borderRadius: "6px",
	color: "#e2e8f0",
	padding: "8px 12px",
	fontSize: "14px",
	width: "100%",
	outline: "none",
};

const selectStyle: React.CSSProperties = {
	...inputStyle,
	cursor: "pointer",
};

const backBtn: React.CSSProperties = {
	background: "transparent",
	border: "none",
	color: "#64748b",
	cursor: "pointer",
	fontSize: "13px",
	padding: "4px 0",
};

const cancelCustomBtn: React.CSSProperties = {
	background: "transparent",
	border: "1px solid #3f3f6e",
	color: "#64748b",
	padding: "7px 10px",
	borderRadius: "6px",
	cursor: "pointer",
	fontSize: "12px",
	flexShrink: 0,
};

const primaryBtn: React.CSSProperties = {
	background: "#7c3aed",
	border: "none",
	color: "white",
	padding: "9px 20px",
	borderRadius: "6px",
	cursor: "pointer",
	fontSize: "14px",
	fontWeight: "500",
};

const secondaryBtn: React.CSSProperties = {
	background: "transparent",
	border: "1px solid #3f3f6e",
	color: "#94a3b8",
	padding: "9px 16px",
	borderRadius: "6px",
	cursor: "pointer",
	fontSize: "14px",
};
