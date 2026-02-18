import { join } from "node:path";
import { getLogger } from "./logger";
import type { SourcePlugin } from "./plugins";
import { validatePath } from "./security";

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
 * Parse command markdown: --- yaml --- body. Returns frontmatter and body.
 * Minimal YAML: name, description, parameters with nested type/default.
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

	const nameMatch = yamlContent.match(/^name:\s*(.+)$/m);
	if (!nameMatch) {
		throw new Error("Invalid command frontmatter - missing name");
	}
	const descriptionMatch = yamlContent.match(/^description:\s*(.+)$/m);

	const parameters: CommandFrontmatter["parameters"] = {};
	const paramBlock = yamlContent.match(/^parameters:\s*\n((?:\s{2,}.+\n?)*)/m);
	if (paramBlock) {
		const lines = paramBlock[1].split("\n");
		let currentParam: string | null = null;
		for (const line of lines) {
			const paramMatch = line.match(/^\s{2}(\w+):\s*$/);
			if (paramMatch) {
				currentParam = paramMatch[1];
				parameters[currentParam] = {};
			} else if (currentParam && line.startsWith("    ")) {
				const defaultMatch = line.match(/default:\s*(.+)$/);
				const typeMatch = line.match(/type:\s*(.+)$/);
				if (defaultMatch) {
					const v = defaultMatch[1].trim();
					parameters[currentParam].default =
						v.startsWith('"') || v.startsWith("'") ? v.slice(1, -1) : v;
				}
				if (typeMatch) parameters[currentParam].type = typeMatch[1].trim();
			} else {
				currentParam = null;
			}
		}
	}

	return {
		frontmatter: {
			name: nameMatch[1].trim(),
			description: descriptionMatch?.[1]?.trim(),
			parameters: Object.keys(parameters).length ? parameters : undefined,
		},
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
