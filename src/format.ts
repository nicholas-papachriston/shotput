/**
 * Handler for format-prefixed references: {{yaml:path}}, {{json:path}},
 * {{jsonl:path}}, {{xml:path}}, {{md:path}}. Parses the file and expands
 * to a string representation (object → JSON/YAML/XML string; md → content).
 */
import type { ShotputConfig } from "./config";
import { handlerErrorResult } from "./handlerResult";
import {
	buildJinjaContext,
	getCompiledJinjaRenderer,
} from "./language/jinja/jinja";
import { getLogger } from "./logger";
import { SecurityError, validatePath } from "./security";
import { parseJsonl } from "./support/jsonl";
import { parseXml, xmlNodeToString } from "./support/xml";
import { parseYaml } from "./yaml";

const log = getLogger("format");

const FORMAT_PREFIXES = [
	"yaml:",
	"json:",
	"jsonl:",
	"xml:",
	"md:",
	"jinja:",
] as const;
export const FORMAT_PATH_PREFIX_REGEX = /^(yaml|json|jsonl|xml|md|jinja):/;
type FormatKind = (typeof FORMAT_PREFIXES)[number] extends `${infer F}:`
	? F
	: never;
const STRUCTURED_FORMATS = new Set<FormatKind>([
	"yaml",
	"json",
	"jsonl",
	"xml",
]);

function parseFormatPath(path: string): {
	format: FormatKind;
	filePath: string;
} {
	for (const prefix of FORMAT_PREFIXES) {
		if (path.startsWith(prefix)) {
			return {
				format: prefix.slice(0, -1) as FormatKind,
				filePath: path.slice(prefix.length),
			};
		}
	}
	throw new Error(`Invalid format path: ${path}`);
}

function expandYaml(content: string): string {
	const parsed = parseYaml(content);
	return JSON.stringify(parsed, null, 2);
}

function expandJson(content: string): string {
	const parsed = JSON.parse(content) as unknown;
	return JSON.stringify(parsed, null, 2);
}

function expandJsonl(content: string): string {
	const parsed = parseJsonl(content);
	return JSON.stringify(parsed, null, 2);
}

function expandXml(content: string): string {
	const root = parseXml(content);
	return xmlNodeToString(root);
}

function expandMd(content: string): string {
	return content;
}

function expandJinja(content: string, config: ShotputConfig): string {
	const renderer = getCompiledJinjaRenderer(content);
	return renderer(buildJinjaContext(config));
}

export const handleFormat = async (
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<{
	operationResults: string;
	combinedRemainingCount: number;
	replacement?: string;
}> => {
	const { format, filePath } = parseFormatPath(path);
	log.info(`Format expand: ${format} ${filePath}`);

	try {
		const validatedPath = validatePath(config, filePath);

		const file = Bun.file(validatedPath);
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`File not found: ${validatedPath}`);
		}

		const content = await file.text();

		let expanded: string;
		switch (format) {
			case "yaml":
				expanded = expandYaml(content);
				break;
			case "json":
				expanded = expandJson(content);
				break;
			case "jsonl":
				expanded = expandJsonl(content);
				break;
			case "xml":
				expanded = expandXml(content);
				break;
			case "md":
				expanded = expandMd(content);
				break;
			case "jinja":
				expanded = expandJinja(content, config);
				break;
			default:
				throw new Error(`Unsupported format: ${format}`);
		}

		let replacement = expanded;
		if (
			remainingLength >= 0 &&
			expanded.length > remainingLength &&
			STRUCTURED_FORMATS.has(format)
		) {
			replacement = `[Truncated ${format} content: ${expanded.length} chars exceeds budget ${remainingLength}]`;
		}
		const used = Math.min(replacement.length, remainingLength);
		const truncated =
			used < replacement.length ? replacement.slice(0, used) : replacement;

		return {
			operationResults: result.replace(match, truncated),
			combinedRemainingCount: remainingLength - used,
			replacement: truncated,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for ${filePath}: ${error.message}`);
		} else {
			log.error(`Failed to expand ${format} ${filePath}: ${error}`);
		}
		return handlerErrorResult(result, match, remainingLength, error, {
			path: filePath,
		});
	}
};
