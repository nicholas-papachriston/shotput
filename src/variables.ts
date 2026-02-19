import type { ShotputConfig } from "./config";

const pathKeysCache = new Map<string, string[]>();

function getPathKeys(path: string): string[] {
	let keys = pathKeysCache.get(path);
	if (!keys) {
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
 */
export function getVariableValue(path: string, config: ShotputConfig): string {
	const trimmed = path.trim();
	if (!trimmed) return "";

	if (trimmed.startsWith("context.")) {
		const keyPath = trimmed.slice(8).trim();
		const ctx = config.context ?? {};
		const value = getByPath(ctx as Record<string, unknown>, keyPath);
		return value != null ? String(value) : "";
	}
	if (trimmed.startsWith("params.")) {
		const params = (config as { params?: Record<string, unknown> }).params;
		if (!params) return "";
		const keyPath = trimmed.slice(7).trim();
		const value = getByPath(params, keyPath);
		return value != null ? String(value) : "";
	}
	if (trimmed.startsWith("env.")) {
		const key = trimmed.slice(4).trim();
		const env = typeof process !== "undefined" ? process.env : {};
		const value = env[key];
		return value != null ? String(value) : "";
	}

	return "";
}

/** Match {{context.xxx}}, {{params.xxx}}, {{env.xxx}} (full placeholder only). */
const VARIABLE_PLACEHOLDER =
	/\{\{\s*(context\.[^}]*|params\.[^}]*|env\.[^}]*)\s*\}\}/g;

/** Fast path: replace __loop vars with direct lookup. Use before substituteVariables in each iterations. */
const LOOP_INDEX_PLACEHOLDER = /\{\{\s*context\.__loop\.index\s*\}\}/g;
const LOOP_ITEM_NAME_PLACEHOLDER = /\{\{\s*context\.__loop\.item\.name\s*\}\}/g;
const LOOP_ITEM_VALUE_PLACEHOLDER =
	/\{\{\s*context\.__loop\.item\.value\s*\}\}/g;
const LOOP_ITEM_PLACEHOLDER = /\{\{\s*context\.__loop\.item\s*\}\}/g;

export function substituteLoopItemVariables(
	content: string,
	item: unknown,
	index: number,
): string {
	const itemObj =
		item != null && typeof item === "object"
			? (item as Record<string, unknown>)
			: {};
	const nameVal = itemObj["name"] != null ? String(itemObj["name"]) : "";
	const valueVal = itemObj["value"] != null ? String(itemObj["value"]) : "";
	return content
		.replace(LOOP_INDEX_PLACEHOLDER, String(index))
		.replace(LOOP_ITEM_NAME_PLACEHOLDER, nameVal)
		.replace(LOOP_ITEM_VALUE_PLACEHOLDER, valueVal)
		.replace(LOOP_ITEM_PLACEHOLDER, item != null ? String(item) : "");
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
