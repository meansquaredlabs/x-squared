import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { stringify } from "yaml";
import type { AgentFile, AgentFileInput } from "./types.ts";

function getAgentsDir(): string {
	return path.join(getAgentDir(), "agents");
}

export function listAgents(): AgentFile[] {
	const dir = getAgentsDir();
	if (!fs.existsSync(dir)) return [];

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const agents: AgentFile[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		if (!frontmatter.name || !frontmatter.description) continue;

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body.trim(),
			filePath,
		});
	}
	return agents;
}

export function getAgent(name: string): AgentFile | undefined {
	return listAgents().find((a) => a.name === name);
}

function serializeAgent(agent: AgentFileInput): string {
	const fm: Record<string, string> = {
		name: agent.name,
		description: agent.description,
	};
	if (agent.tools?.length) fm.tools = agent.tools.join(", ");
	if (agent.model) fm.model = agent.model;
	return `---\n${stringify(fm)}---\n\n${agent.systemPrompt}\n`;
}

export function createAgent(input: AgentFileInput): AgentFile {
	const dir = getAgentsDir();
	fs.mkdirSync(dir, { recursive: true });
	const fileName = `${input.name.replace(/[^\w.-]+/g, "_")}.md`;
	const filePath = path.join(dir, fileName);
	if (fs.existsSync(filePath)) {
		throw new Error(`Agent "${input.name}" already exists`);
	}
	fs.writeFileSync(filePath, serializeAgent(input), "utf-8");
	return { ...input, filePath };
}

export function updateAgent(name: string, input: AgentFileInput): AgentFile {
	const existing = getAgent(name);
	if (!existing) throw new Error(`Agent "${name}" not found`);
	fs.writeFileSync(existing.filePath, serializeAgent(input), "utf-8");
	return { ...input, filePath: existing.filePath };
}

export function deleteAgent(name: string): void {
	const existing = getAgent(name);
	if (!existing) throw new Error(`Agent "${name}" not found`);
	fs.unlinkSync(existing.filePath);
}
