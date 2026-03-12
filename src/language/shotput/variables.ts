import type { ShotputConfig } from "../../config";

const CACHE_CAP = 20_000;

const pathKeysCache = new Map<string, string[]>();
const variableResolverCache = new Map<
	string,
	{ type: "context" | "params" | "env"; keyPath: string }
>();

function evictOldestIfNeeded<K, V>(cache: Map<K, V>, cap: number): void {
	if (cache.size >= cap) {
		const firstKey = cache.keys().next().value;
		if (firstKey !== undefined) cache.delete(firstKey);
	}
}

function getPathKeys(path: string): string[] {
	let keys = pathKeysCache.get(path);
	if (!keys) {
		evictOldestIfNeeded(pathKeysCache, CACHE_CAP);
		keys = path.split(".");
		pathKeysCache.set(path, keys);
	}
	return keys;
}

/** Resolve a dot path (e.g. "foo.bar.baz") into an object. Returns undefined if any segment is missing. */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
	const keys = getPathKeys(path);
	let current: unknown = obj;
	for (const k of keys) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[k];
	}
	return current;
}

/**
 * Resolve a variable path (context.xxx, params.xxx, env.xxx) to a string value.
 * Used for {{context.x}}, {{params.x}}, {{env.X}} substitution in template body.
 * Uses a resolver cache to avoid repeated prefix parsing for repeated paths.
 */
export function getVariableValue(path: string, config: ShotputConfig): string {
	const trimmed = path.trim();
	if (!trimmed) return "";

	let resolved = variableResolverCache.get(trimmed);
	if (!resolved) {
		if (trimmed.startsWith("context.")) {
			resolved = { type: "context", keyPath: trimmed.slice(8).trim() };
		} else if (trimmed.startsWith("params.")) {
			resolved = { type: "params", keyPath: trimmed.slice(7).trim() };
		} else if (trimmed.startsWith("env.")) {
			resolved = { type: "env", keyPath: trimmed.slice(4).trim() };
		} else {
			return "";
		}
		evictOldestIfNeeded(variableResolverCache, CACHE_CAP);
		variableResolverCache.set(trimmed, resolved);
	}

	if (resolved.type === "context") {
		const ctx = config.context ?? {};
		const value = getByPath(ctx as Record<string, unknown>, resolved.keyPath);
		return value != null ? String(value) : "";
	}
	if (resolved.type === "params") {
		const params = (config as { params?: Record<string, unknown> }).params;
		if (!params) return "";
		const value = getByPath(params, resolved.keyPath);
		return value != null ? String(value) : "";
	}
	const env = typeof process !== "undefined" ? process.env : {};
	const value = env[resolved.keyPath];
	return value != null ? String(value) : "";
}

/** Match {{context.xxx}}, {{params.xxx}}, {{env.xxx}} (full placeholder only). */
const VARIABLE_PLACEHOLDER =
	/\{\{\s*(context\.[^}]*|params\.[^}]*|env\.[^}]*)\s*\}\}/g;

/** Single regex for all __loop placeholders; most specific patterns first. */
const LOOP_PLACEHOLDER =
	/\{\{\s*context\.__loop\.(item\.name|item\.value|index|item|first|last)\s*\}\}/g;

export function substituteLoopItemVariables(
	content: string,
	item: unknown,
	index: number,
	loopState?: { first?: boolean; last?: boolean },
): string {
	if (!content.includes("context.__loop")) return content;
	const itemObj =
		item != null && typeof item === "object"
			? (item as Record<string, unknown>)
			: {};
	const nameVal = itemObj["name"] != null ? String(itemObj["name"]) : "";
	const valueVal = itemObj["value"] != null ? String(itemObj["value"]) : "";
	const itemVal = item != null ? String(item) : "";
	const indexVal = String(index);
	return content.replace(LOOP_PLACEHOLDER, (_, kind: string) => {
		if (kind === "item.name") return nameVal;
		if (kind === "item.value") return valueVal;
		if (kind === "index") return indexVal;
		if (kind === "first") return String(loopState?.first ?? false);
		if (kind === "last") return String(loopState?.last ?? false);
		return itemVal;
	});
}

/**
 * Single-pass substitution for both loop placeholders ({{context.__loop.*}})
 * and variable placeholders ({{context.x}}, {{params.x}}, {{env.x}}).
 * Reduces two replace passes to one for each each-block iteration.
 */
const COMBINED_LOOP_VAR_PLACEHOLDER =
	/\{\{\s*(context\.__loop\.(item\.name|item\.value|index|item|first|last)|context\.[^}]*|params\.[^}]*|env\.[^}]*)\s*\}\}/g;

/**
 * When knownHasPlaceholders is true, skips the per-call includes() scan (use when
 * the same content is substituted many times, e.g. loop body; caller should scan once).
 */
export function substituteLoopVariables(
	content: string,
	item: unknown,
	index: number,
	config: ShotputConfig,
	knownHasPlaceholders?: boolean,
): string {
	if (!knownHasPlaceholders) {
		const hasLoop = content.includes("context.__loop");
		const hasVar =
			content.includes("context.") ||
			content.includes("params.") ||
			content.includes("env.");
		if (!hasLoop && !hasVar) return content;
	}

	const itemObj =
		item != null && typeof item === "object"
			? (item as Record<string, unknown>)
			: {};
	const nameVal = itemObj["name"] != null ? String(itemObj["name"]) : "";
	const valueVal = itemObj["value"] != null ? String(itemObj["value"]) : "";
	const itemVal = item != null ? String(item) : "";
	const indexVal = String(index);

	const loopState = config.context?.["__loop"] as
		| { first?: boolean; last?: boolean }
		| undefined;

	return content.replace(
		COMBINED_LOOP_VAR_PLACEHOLDER,
		(_match: string, inner: string, loopKind?: string) => {
			if (loopKind !== undefined) {
				if (loopKind === "item.name") return nameVal;
				if (loopKind === "item.value") return valueVal;
				if (loopKind === "index") return indexVal;
				if (loopKind === "item") return itemVal;
				if (loopKind === "first") return String(loopState?.first ?? false);
				if (loopKind === "last") return String(loopState?.last ?? false);
			}
			return getVariableValue(inner, config);
		},
	);
}

/**
 * Substitute variable placeholders in template body.
 * Replaces {{context.x}}, {{params.x}}, {{env.X}} with resolved string values (or "" if missing).
 * Run after evaluateRules so that rules and variable substitution use the same namespaces.
 */
export function substituteVariables(
	content: string,
	config: ShotputConfig,
): string {
	return content.replace(VARIABLE_PLACEHOLDER, (_, inner: string) =>
		getVariableValue(inner, config),
	);
}
