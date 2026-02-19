import { join } from "node:path";
import { getLogger } from "./logger";
import type { SourcePlugin } from "./plugins";
import { validatePath } from "./security";
import { parseYaml } from "./yaml";

const log = getLogger("command");

export const COMMAND_PREFIX = "command:";

export interface CommandFrontmatter {
	name: string;
	description?: string;
	parameters?: Record<
		string,
		{ type?: string; default?: unknown; description?: string }
	>;
}

export interface ParsedCommandInvocation {
	name: string;
	params: Record<string, string>;
}

/**
 * Parse "command:name key=val key2=val2" into name and params.
 */
export const parseCommandInvocation = (
	rawPath: string,
): ParsedCommandInvocation => {
	if (!rawPath.startsWith(COMMAND_PREFIX)) {
		throw new Error(`Invalid command path: ${rawPath}`);
	}
	const rest = rawPath.slice(COMMAND_PREFIX.length).trim();
	const firstSpace = rest.indexOf(" ");
	const name = firstSpace === -1 ? rest : rest.slice(0, firstSpace);
	const params: Record<string, string> = {};
	if (firstSpace !== -1) {
		const paramStr = rest.slice(firstSpace + 1);
		// Simple key=value parsing (values may contain spaces if quoted later; for now split on spaces)
		const parts = paramStr.split(/\s+/);
		for (const part of parts) {
			const eq = part.indexOf("=");
			if (eq > 0) {
				const key = part.slice(0, eq);
				const value = part.slice(eq + 1).replace(/^["']|["']$/g, "");
				params[key] = value;
			}
		}
	}
	return { name, params };
};

/**
 * Parse command markdown: --- yaml --- body using Bun.YAML.parse.
 * Expects name (required), description, parameters with nested type/default.
 */
const parseCommandMd = (
	content: string,
): { frontmatter: CommandFrontmatter; body: string } => {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) {
		throw new Error("Invalid command format - missing frontmatter");
	}
	const yamlContent = match[1];
	const body = match[2].trim();

	let parsed: unknown;
	try {
		parsed = parseYaml(yamlContent);
	} catch (e) {
		throw new Error(
			`Invalid command frontmatter - YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
		);
	}
	if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Invalid command frontmatter - not an object");
	}
	const obj = parsed as Record<string, unknown>;
	const name = obj["name"];
	if (typeof name !== "string" || !name.trim()) {
		throw new Error("Invalid command frontmatter - missing name");
	}
	const description =
		typeof obj["description"] === "string"
			? (obj["description"] as string).trim()
			: undefined;
	const rawParams = obj["parameters"];
	let parameters: CommandFrontmatter["parameters"] | undefined;
	if (
		rawParams != null &&
		typeof rawParams === "object" &&
		!Array.isArray(rawParams)
	) {
		parameters = {};
		for (const [key, spec] of Object.entries(rawParams)) {
			if (spec != null && typeof spec === "object" && !Array.isArray(spec)) {
				const s = spec as Record<string, unknown>;
				parameters[key] = {
					type:
						typeof s["type"] === "string" ? (s["type"] as string) : undefined,
					default: s["default"],
					description:
						typeof s["description"] === "string"
							? (s["description"] as string)
							: undefined,
				};
			}
		}
		parameters = Object.keys(parameters).length ? parameters : undefined;
	}

	return {
		frontmatter: { name: name.trim(), description, parameters },
		body,
	};
};

/**
 * Create the built-in command SourcePlugin. Uses config from SourceContext at resolve time.
 */
export const createCommandPlugin = (): SourcePlugin => ({
	name: "command",
	canContainTemplates: true,
	matches: (rawPath: string) => rawPath.startsWith(COMMAND_PREFIX),

	async resolve(ctx) {
		const { rawPath, config, remainingLength } = ctx;
		const commandsDir = config.commandsDir ?? "./commands";

		const { name, params: providedParams } = parseCommandInvocation(rawPath);

		const base = config.allowedBasePaths?.[0] ?? process.cwd();
		const commandPath = join(base, commandsDir, `${name}.md`);
		const validatedPath = validatePath(config, commandPath, base);

		const file = Bun.file(validatedPath);
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`Command not found: ${name}`);
		}

		const content = await file.text();
		const { frontmatter, body } = parseCommandMd(content);

		const defaults: Record<string, string> = {};
		for (const [key, spec] of Object.entries(frontmatter.parameters ?? {})) {
			const d = spec.default;
			defaults[key] = d != null ? String(d) : "";
		}
		const params: Record<string, string> = { ...defaults, ...providedParams };

		let substituted = body;
		for (const [key, value] of Object.entries(params)) {
			substituted = substituted.replace(
				new RegExp(`\\{\\{\\s*\\$${key}\\s*\\}\\}`, "g"),
				value,
			);
		}

		const usedLength = Math.min(substituted.length, remainingLength);
		log.info(
			`Resolved command [${name}] with ${Object.keys(params).length} params`,
		);

		return {
			content: substituted,
			remainingLength: remainingLength - usedLength,
			mergeContext: { params },
		};
	},
});
