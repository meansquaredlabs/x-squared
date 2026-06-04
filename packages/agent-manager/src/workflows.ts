import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { Workflow } from "./types.ts";

function getWorkflowsDir(): string {
	return path.join(getAgentDir(), "workflows");
}

export function listWorkflows(): Workflow[] {
	const dir = getWorkflowsDir();
	if (!fs.existsSync(dir)) return [];

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const workflows: Workflow[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".json")) continue;
		try {
			const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
			workflows.push(JSON.parse(content) as Workflow);
		} catch {
			continue;
		}
	}
	return workflows;
}

export function getWorkflow(id: string): Workflow | undefined {
	const filePath = path.join(getWorkflowsDir(), `${id}.json`);
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Workflow;
	} catch {
		return undefined;
	}
}

function writeWorkflow(workflow: Workflow): void {
	const dir = getWorkflowsDir();
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, `${workflow.id}.json`), JSON.stringify(workflow, null, 2), "utf-8");
}

export function createWorkflow(data: Omit<Workflow, "id" | "createdAt" | "updatedAt">): Workflow {
	const workflow: Workflow = {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...data,
	};
	writeWorkflow(workflow);
	return workflow;
}

export function updateWorkflow(id: string, data: Partial<Omit<Workflow, "id" | "createdAt">>): Workflow {
	const existing = getWorkflow(id);
	if (!existing) throw new Error(`Workflow "${id}" not found`);
	const updated: Workflow = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
	writeWorkflow(updated);
	return updated;
}

export function deleteWorkflow(id: string): void {
	const filePath = path.join(getWorkflowsDir(), `${id}.json`);
	if (!fs.existsSync(filePath)) throw new Error(`Workflow "${id}" not found`);
	fs.unlinkSync(filePath);
}
