import type { AgentFile, AgentFileInput, Workflow, WsEvent } from "./types";

const BASE = "/api";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, {
		headers: { "Content-Type": "application/json" },
		...init,
	});
	if (!res.ok) {
		const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error: string };
		throw new Error(err.error || res.statusText);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export const api = {
	agents: {
		list: () => req<AgentFile[]>(`${BASE}/agents`),
		get: (name: string) => req<AgentFile>(`${BASE}/agents/${encodeURIComponent(name)}`),
		create: (agent: AgentFileInput) =>
			req<AgentFile>(`${BASE}/agents`, { method: "POST", body: JSON.stringify(agent) }),
		update: (name: string, agent: AgentFileInput) =>
			req<AgentFile>(`${BASE}/agents/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(agent) }),
		delete: (name: string) =>
			req<void>(`${BASE}/agents/${encodeURIComponent(name)}`, { method: "DELETE" }),
	},
	workflows: {
		list: () => req<Workflow[]>(`${BASE}/workflows`),
		get: (id: string) => req<Workflow>(`${BASE}/workflows/${id}`),
		create: (w: Omit<Workflow, "id" | "createdAt" | "updatedAt">) =>
			req<Workflow>(`${BASE}/workflows`, { method: "POST", body: JSON.stringify(w) }),
		update: (id: string, w: Partial<Workflow>) =>
			req<Workflow>(`${BASE}/workflows/${id}`, { method: "PUT", body: JSON.stringify(w) }),
		delete: (id: string) => req<void>(`${BASE}/workflows/${id}`, { method: "DELETE" }),
	},
	execute: {
		start: (workflowId: string, input: string) =>
			req<{ executionId: string }>(`${BASE}/execute/${workflowId}`, {
				method: "POST",
				body: JSON.stringify({ input }),
			}),
		abort: (executionId: string) =>
			req<void>(`${BASE}/execute/${executionId}`, { method: "DELETE" }),
	},
};

export class AgentManagerWs {
	private ws: WebSocket;
	private handlers = new Map<string, Set<(data: WsEvent) => void>>();

	constructor(onopen?: () => void) {
		const proto = location.protocol === "https:" ? "wss" : "ws";
		this.ws = new WebSocket(`${proto}://${location.host}/ws`);
		this.ws.onmessage = (e) => {
			const event = JSON.parse(e.data as string) as WsEvent;
			this.handlers.get(event.type)?.forEach((h) => h(event));
		};
		if (onopen) this.ws.onopen = onopen;
	}

	on(type: string, handler: (data: WsEvent) => void): () => void {
		if (!this.handlers.has(type)) this.handlers.set(type, new Set());
		this.handlers.get(type)!.add(handler);
		return () => this.handlers.get(type)?.delete(handler);
	}

	close() {
		this.ws.close();
	}
}
