import { join } from "node:path";
import { type ShotputConfig, createConfig } from "../config";
import { getLogger } from "../logger";
import { parseYamlFrontmatterObject } from "../okf";
import { interpolationStream } from "../runtime/interpolationStream";
import { validatePath } from "../security";
import { consumeStreamToString } from "../streamUtils";
import type { ShotputOutput } from "../types";
import type { SourcePlugin } from "./plugins";

const log = getLogger("subagent");

export const SUBAGENT_PREFIX = "subagent:";

/**
 * Directories searched for `{{subagent:name}}` definitions, in order.
 *
 * `./.agents` is the Shotput layout. `./.agent-oxide/agents` is where Agent Oxide keeps
 * project agent profiles, so one repository can hold a single set of definitions that both
 * tools read.
 */
export const DEFAULT_SUBAGENT_DIRS = [
	"./.agents",
	"./.agent-oxide/agents",
] as const;

/**
 * Search order for one lookup: the configured directory first, then the shared defaults.
 */
export const subagentSearchDirs = (configured?: string): string[] => {
	const dirs = configured ? [configured] : [];
	for (const dir of DEFAULT_SUBAGENT_DIRS) {
		if (!dirs.includes(dir)) dirs.push(dir);
	}
	return dirs;
};

/**
 * Agent config parsed from YAML frontmatter in subagent definition files.
 * Common fields: model, temperature, tools, permissions, description, mode.
 * Supports additional unknown fields for extensibility.
 */
export interface SubagentConfig {
	model?: string;
	temperature?: number;
	tools?: string[];
	permissions?: string[];
	description?: string;
	mode?: string;
	[key: string]: unknown;
}

/**
 * Result of resolveSubagent(): system prompt plus agent config and metadata.
 * Handoff point for agent frameworks (e.g. Agent Oxide).
 */
export interface ResolvedSubagent {
	/** Resolved template body; use as system prompt */
	systemPrompt: string;
	/** Parsed YAML frontmatter (model, tools, etc.) */
	agentConfig: SubagentConfig;
	/** Processing metadata: duration, resultMetadata */
	metadata: ShotputOutput["metadata"];
}

/**
 * Parse YAML frontmatter between --- markers using Bun.YAML.parse.
 * Returns null if no frontmatter or YAML is invalid.
 */
export const parseSubagentFrontmatter = (
	content: string,
): { frontmatter: SubagentConfig; body: string } | null => {
	const parsed = parseYamlFrontmatterObject(content);
	if (!parsed) return null;
	return {
		frontmatter: parsed.frontmatter as SubagentConfig,
		body: parsed.body,
	};
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
		const base = config.allowedBasePaths?.[0] ?? process.cwd();

		let found: string | undefined;
		for (const dir of subagentSearchDirs(config.subagentsDir)) {
			const validatedPath = validatePath(
				config,
				join(base, dir, `${name}.md`),
				base,
			);
			if (await Bun.file(validatedPath).exists()) {
				found = validatedPath;
				break;
			}
		}
		if (!found) {
			throw new Error(`Subagent not found: ${name}`);
		}

		const content = await Bun.file(found).text();
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
 *
 * Use when you have a file path to a subagent .md file and need the resolved
 * system prompt and config for an agent framework. The file is parsed for
 * YAML frontmatter; the body is resolved via shotput ({{placeholders}}, rules).
 *
 * @param configInput - Shotput config plus subagentFile (path to .md)
 * @returns Resolved system prompt, agent config from frontmatter, and metadata
 *
 * @example
 * ```ts
 * const { systemPrompt, agentConfig } = await resolveSubagent({
 *   subagentFile: "./agents/reviewer.md",
 *   allowedBasePaths: ["./"],
 *   context: { language: "rust" },
 * });
 * // Use systemPrompt and agentConfig with your agent runtime.
 * ```
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
