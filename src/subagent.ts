import { join } from "node:path";
import { type ShotputConfig, createConfig } from "./config";
import { interpolationStream } from "./interpolationStream";
import { getLogger } from "./logger";
import type { SourcePlugin } from "./plugins";
import { validatePath } from "./security";
import { consumeStreamToString } from "./streamUtils";
import type { ShotputOutput } from "./types";

const log = getLogger("subagent");

export const SUBAGENT_PREFIX = "subagent:";

export interface SubagentConfig {
	model?: string;
	temperature?: number;
	tools?: string[];
	permissions?: string[];
	description?: string;
	mode?: string;
	[key: string]: unknown;
}

export interface ResolvedSubagent {
	systemPrompt: string;
	agentConfig: SubagentConfig;
	metadata: ShotputOutput["metadata"];
}

/**
 * Parse YAML frontmatter between --- markers. Supports scalars and simple arrays.
 */
export const parseSubagentFrontmatter = (
	content: string,
): { frontmatter: SubagentConfig; body: string } | null => {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return null;

	const yamlContent = match[1];
	const body = match[2].trim();
	const frontmatter: SubagentConfig = {};

	const lines = yamlContent.split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const scalarMatch = line.match(/^(\w+):\s*(.+)$/);
		if (scalarMatch) {
			const key = scalarMatch[1];
			let value: unknown = scalarMatch[2].trim();
			if (value === "true") value = true;
			else if (value === "false") value = false;
			else if (value === "" || value === "null") value = undefined;
			else if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))
				value = Number.parseFloat(value);
			else if (
				typeof value === "string" &&
				(value.startsWith('"') || value.startsWith("'"))
			)
				value = value.slice(1, -1);
			frontmatter[key] = value;
			i++;
			continue;
		}
		const arrayMatch = line.match(/^(\w+):\s*$/);
		if (arrayMatch) {
			const key = arrayMatch[1];
			const arr: string[] = [];
			i++;
			while (i < lines.length && lines[i].startsWith("  ")) {
				const item = lines[i].replace(/^\s*-\s*/, "").trim();
				if (item) arr.push(item.replace(/^["']|["']$/g, ""));
				i++;
			}
			frontmatter[key] = arr;
			continue;
		}
		i++;
	}

	return { frontmatter, body };
};

/**
 * Create the built-in subagent SourcePlugin. Resolves {{subagent:name}} to the
 * subagent file body (frontmatter stripped); body is then recursively interpolated.
 */
export const createSubagentPlugin = (): SourcePlugin => ({
	name: "subagent",
	canContainTemplates: true,
	matches: (rawPath: string) => rawPath.startsWith(SUBAGENT_PREFIX),

	async resolve(ctx) {
		const { rawPath, config, remainingLength } = ctx;
		if (!rawPath.startsWith(SUBAGENT_PREFIX)) {
			throw new Error(`Invalid subagent path: ${rawPath}`);
		}
		const name = rawPath.slice(SUBAGENT_PREFIX.length).trim();
		const subagentsDir = config.subagentsDir ?? "./.agents";
		const base = config.allowedBasePaths?.[0] ?? process.cwd();
		const agentPath = join(base, subagentsDir, `${name}.md`);
		const validatedPath = validatePath(config, agentPath, base);

		const file = Bun.file(validatedPath);
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`Subagent not found: ${name}`);
		}

		const content = await file.text();
		const parsed = parseSubagentFrontmatter(content);
		const body = parsed ? parsed.body : content;

		const usedLength = Math.min(body.length, remainingLength);
		log.info(`Resolved subagent [${name}]`);

		return {
			content: body,
			remainingLength: remainingLength - usedLength,
		};
	},
});

/**
 * Load a subagent definition file, resolve its template body, and return
 * the system prompt plus agent config (frontmatter).
 */
export const resolveSubagent = async (
	configInput: Partial<ShotputConfig> & { subagentFile?: string },
): Promise<ResolvedSubagent> => {
	const config = createConfig(configInput);
	const subagentFile = configInput.subagentFile;
	if (!subagentFile) {
		throw new Error("resolveSubagent requires subagentFile");
	}

	const base = config.allowedBasePaths?.[0] ?? process.cwd();
	const validatedPath = validatePath(config, subagentFile, base);
	const content = await Bun.file(validatedPath).text();
	const parsed = parseSubagentFrontmatter(content);

	let body = content;
	let agentConfig: SubagentConfig = {};
	if (parsed) {
		body = parsed.body;
		agentConfig = parsed.frontmatter;
	}

	const basePath = base;
	const start = Date.now();
	const { stream, metadata } = interpolationStream(body, config, basePath);
	const processedTemplate = await consumeStreamToString(stream);
	const resolvedMetadata = await metadata;
	const duration = Date.now() - start;

	return {
		systemPrompt: processedTemplate,
		agentConfig,
		metadata: {
			duration,
			resultMetadata: resolvedMetadata.resultMetadata ?? [],
		},
	};
};
