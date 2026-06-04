export interface AgentFile {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	filePath: string;
}

export interface AgentFileInput {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
}

export interface WorkflowNodeData {
	agentName: string;
	taskTemplate: string;
	label?: string;
}

export interface WorkflowNode {
	id: string;
	type: "agent";
	data: WorkflowNodeData;
	position: { x: number; y: number };
}

export interface WorkflowEdge {
	id: string;
	source: string;
	target: string;
}

export interface Workflow {
	id: string;
	name: string;
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
	createdAt: string;
	updatedAt: string;
}

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export type WsEvent =
	| { type: "agents_changed" }
	| { type: "workflows_changed" }
	| { type: "execution_start"; executionId: string; workflowId: string }
	| { type: "node_start"; executionId: string; nodeId: string; agentName: string }
	| { type: "node_output"; executionId: string; nodeId: string; partial: string }
	| { type: "node_complete"; executionId: string; nodeId: string; output: string; usage: UsageStats }
	| { type: "node_error"; executionId: string; nodeId: string; error: string }
	| { type: "workflow_complete"; executionId: string; outputs: Record<string, string> }
	| { type: "workflow_aborted"; executionId: string };

export type NodeStatus = "pending" | "running" | "complete" | "error";

export interface ExecutionProgress {
	executionId: string;
	workflowId: string;
	nodeStatuses: Record<string, NodeStatus>;
	nodeOutputs: Record<string, string>;
	status: "running" | "complete" | "error" | "aborted";
}
