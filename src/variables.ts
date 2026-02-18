import type { ShotputConfig } from "./config";

/** Resolve a dot path (e.g. "foo.bar.baz") into an object. Returns undefined if any segment is missing. */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
	const keys = path.split(".");
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
