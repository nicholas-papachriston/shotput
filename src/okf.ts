import { parseYaml } from "./yaml";

/**
 * Open Knowledge Format version targeted by Shotput's parser.
 * Field set is v0.1-compatible and tolerates common v0.2 extensions
 * (`generated`, `sources`, `verified`, `status`, `stale_after`).
 *
 * @see https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */
export const OKF_VERSION = "0.1" as const;

/** Reserved filenames that are not concept documents in an OKF bundle. */
export const OKF_RESERVED_FILENAMES = new Set(["index.md", "log.md"]);

/**
 * OKF v0.2 `generated` object (generation actor + timestamp).
 * Unknown keys are preserved for forward compatibility.
 */
export interface OkfGenerated {
	by?: string;
	at?: string;
	[key: string]: unknown;
}

/**
 * OKF concept frontmatter. `type` is the only always-required field.
 * Additional producer-defined keys are allowed.
 */
export interface OkfFrontmatter {
	/** Concept kind (routing/filtering). Required by OKF. */
	type: string;
	title?: string;
	description?: string;
	resource?: string;
	tags?: string[];
	/** OKF v0.1 freshness timestamp (ISO-8601). Prefer `generated.at` in v0.2. */
	timestamp?: string;
	okf_version?: string;
	/** OKF v0.2 generation metadata */
	generated?: OkfGenerated;
	sources?: unknown;
	verified?: unknown;
	status?: string;
	stale_after?: string;
	[key: string]: unknown;
}

/** One OKF concept extracted from a markdown document. */
export interface ParsedOkfDocument {
	okf: OkfFrontmatter;
	body: string;
	/** Path-derived concept id (bundle-relative path without `.md`) when a path is provided */
	conceptId?: string;
}

/** One OKF concept discovered while resolving a multi-file source. */
export interface OkfDocumentRef {
	path: string;
	okf: OkfFrontmatter;
	conceptId?: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;

/**
 * Split a markdown document into YAML frontmatter text and body.
 * Returns null when the document has no `---` delimited frontmatter block.
 */
export function splitYamlFrontmatter(
	content: string,
): { yaml: string; body: string } | null {
	const match = content.match(FRONTMATTER_RE);
	if (!match) return null;
	return {
		yaml: match[1] ?? "",
		body: (match[2] ?? "").trim(),
	};
}

/**
 * Parse YAML frontmatter into a plain object. Returns null when missing or invalid.
 */
export function parseYamlFrontmatterObject(
	content: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
	const split = splitYamlFrontmatter(content);
	if (!split) return null;
	try {
		const parsed = parseYaml(split.yaml);
		if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		return {
			frontmatter: parsed as Record<string, unknown>,
			body: split.body,
		};
	} catch {
		return null;
	}
}

/**
 * Type guard: value is OKF frontmatter when it has a non-empty string `type`.
 */
export function isOkfFrontmatter(value: unknown): value is OkfFrontmatter {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const type = (value as Record<string, unknown>)["type"];
	return typeof type === "string" && type.trim().length > 0;
}

/**
 * Narrow a frontmatter record to OkfFrontmatter when it qualifies as OKF.
 */
export function asOkfFrontmatter(
	value: Record<string, unknown>,
): OkfFrontmatter | null {
	if (!isOkfFrontmatter(value)) return null;
	return value;
}

/**
 * Derive an OKF concept id from a file path (strip trailing `.md`, normalize separators).
 * Without a bundle root this is the best available id for a single document.
 */
export function conceptIdFromPath(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	return normalized.replace(/\.md$/i, "");
}

/**
 * Whether a filename is reserved by OKF (not a concept document).
 */
export function isOkfReservedFilename(name: string): boolean {
	return OKF_RESERVED_FILENAMES.has(name);
}

/**
 * Parse an OKF concept document. Returns null when frontmatter is missing,
 * invalid YAML, or lacks a non-empty `type` (the OKF discriminator).
 */
export function parseOkfDocument(
	content: string,
	options?: { path?: string },
): ParsedOkfDocument | null {
	const parsed = parseYamlFrontmatterObject(content);
	if (!parsed) return null;
	const okf = asOkfFrontmatter(parsed.frontmatter);
	if (!okf) return null;
	return {
		okf,
		body: parsed.body,
		conceptId: options?.path ? conceptIdFromPath(options.path) : undefined,
	};
}

/**
 * Prefer OKF as document metadata: when enabled and content is an OKF concept,
 * return the body with structured `okf` separated out. Otherwise leave content unchanged.
 */
export function preferOkfDocument(
	content: string,
	enabled: boolean,
	path?: string,
): { content: string; okf?: OkfFrontmatter; conceptId?: string } {
	if (!enabled) return { content };
	const parsed = parseOkfDocument(content, { path });
	if (!parsed) return { content };
	return {
		content: parsed.body,
		okf: parsed.okf,
		conceptId: parsed.conceptId,
	};
}

/**
 * Prefer `generated.at` (OKF v0.2) then `timestamp` (OKF v0.1).
 */
export function okfTimestamp(okf: OkfFrontmatter): string | undefined {
	const generated = okf.generated;
	if (
		generated != null &&
		typeof generated === "object" &&
		!Array.isArray(generated)
	) {
		const at = (generated as OkfGenerated).at;
		if (typeof at === "string" && at.length > 0) return at;
	}
	if (typeof okf.timestamp === "string" && okf.timestamp.length > 0) {
		return okf.timestamp;
	}
	return undefined;
}
