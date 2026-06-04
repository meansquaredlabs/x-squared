import { useState } from "react";
import AgentList from "./components/AgentList";
import WorkflowCanvas from "./components/WorkflowCanvas";
import WorkflowList from "./components/WorkflowList";
import type { Workflow } from "./types";

type View =
	| { type: "agents" }
	| { type: "workflows" }
	| { type: "workflow-canvas"; workflowId: string };

export default function App() {
	const [view, setView] = useState<View>({ type: "agents" });

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
			<nav
				style={{
					background: "#1a1a2e",
					borderBottom: "1px solid #2d2d4e",
					padding: "0 16px",
					display: "flex",
					alignItems: "center",
					gap: "4px",
					height: "48px",
					flexShrink: 0,
				}}
			>
				<span style={{ fontWeight: "700", color: "#a78bfa", marginRight: "12px", fontSize: "15px" }}>
					⚙ Agent Manager
				</span>
				<NavBtn
					active={view.type === "agents"}
					onClick={() => setView({ type: "agents" })}
				>
					Agents
				</NavBtn>
				<NavBtn
					active={view.type === "workflows" || view.type === "workflow-canvas"}
					onClick={() => setView({ type: "workflows" })}
				>
					Workflows
				</NavBtn>
			</nav>
			<div style={{ flex: 1, overflow: "hidden" }}>
				{view.type === "agents" && <AgentList />}
				{view.type === "workflows" && (
					<WorkflowList
						onOpen={(w: Workflow) => setView({ type: "workflow-canvas", workflowId: w.id })}
					/>
				)}
				{view.type === "workflow-canvas" && (
					<WorkflowCanvas
						workflowId={view.workflowId}
						onBack={() => setView({ type: "workflows" })}
					/>
				)}
			</div>
		</div>
	);
}

function NavBtn({
	children,
	active,
	onClick,
}: {
	children: React.ReactNode;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			style={{
				background: active ? "rgba(167,139,250,0.2)" : "transparent",
				border: active ? "1px solid rgba(167,139,250,0.4)" : "1px solid transparent",
				color: active ? "#a78bfa" : "#94a3b8",
				padding: "5px 14px",
				borderRadius: "6px",
				cursor: "pointer",
				fontSize: "13px",
				fontWeight: active ? "600" : "400",
			}}
		>
			{children}
		</button>
	);
}
