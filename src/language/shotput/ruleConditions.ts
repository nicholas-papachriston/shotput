import { getLogger } from "../../logger";

const log = getLogger("ruleConditions");

export interface RuleContext {
	context: Record<string, unknown>;
	env: NodeJS.ProcessEnv;
	params?: Record<string, unknown>;
}

const conditionFnCache = new Map<
	string,
	(
		context: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
		params: Record<string, unknown>,
	) => boolean
>();
const CONDITION_FN_CACHE_CAP = 20_000;

const FLAGS_PATH_REGEX = /^context\.flags\.(\w+)$/;
const flagsKeyCache = new Map<string, string | null>();
const FLAGS_KEY_CACHE_CAP = 20_000;

export function evaluateConditionJs(expr: string, ctx: RuleContext): boolean {
	const trimmed = expr.trim();
	let flagsKey = flagsKeyCache.get(trimmed);
	if (flagsKey === undefined) {
		const flagsMatch = FLAGS_PATH_REGEX.exec(trimmed);
		flagsKey = flagsMatch ? (flagsMatch[1] ?? null) : null;
		if (flagsKeyCache.size >= FLAGS_KEY_CACHE_CAP) {
			const first = flagsKeyCache.keys().next().value;
			if (first !== undefined) flagsKeyCache.delete(first);
		}
		flagsKeyCache.set(trimmed, flagsKey);
	}
	if (flagsKey !== null) {
		const flags = ctx.context?.["flags"];
		const val =
			flags != null && typeof flags === "object"
				? (flags as Record<string, unknown>)[flagsKey]
				: undefined;
		return Boolean(val);
	}

	try {
		let fn = conditionFnCache.get(trimmed);
		if (!fn) {
			fn = new Function(
				"context",
				"env",
				"params",
				`return Boolean(${trimmed})`,
			) as (
				context: Record<string, unknown>,
				env: NodeJS.ProcessEnv,
				params: Record<string, unknown>,
			) => boolean;
			if (conditionFnCache.size >= CONDITION_FN_CACHE_CAP) {
				const first = conditionFnCache.keys().next().value;
				if (first !== undefined) conditionFnCache.delete(first);
			}
			conditionFnCache.set(trimmed, fn);
		}
		return fn(ctx.context, ctx.env, ctx.params ?? {});
	} catch (err) {
		log.warn(`Rule condition evaluation failed for "${expr}": ${err}`);
		return false;
	}
}

function getSafeValue(path: string, ctx: RuleContext): unknown {
	if (path.startsWith("context.")) {
		const keyPath = path.slice(8).trim();
		const keys = getValuePathKeys(keyPath);
		let current: unknown = ctx.context;
		for (const key of keys) {
			if (current == null || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[key];
		}
		return current;
	}
	if (path.startsWith("env.")) {
		const keyPath = path.slice(4).trim();
		const keys = getValuePathKeys(keyPath);
		let current: unknown = ctx.env;
		for (const key of keys) {
			if (current == null || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[key];
		}
		return current;
	}
	if (path.startsWith("params.")) {
		const keyPath = path.slice(7).trim();
		const keys = getValuePathKeys(keyPath);
		let current: unknown = ctx.params;
		for (const key of keys) {
			if (current == null || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[key];
		}
		return current;
	}
	if (path === "true") return true;
	if (path === "false") return false;
	if (/^-?\d+$/.test(path)) return Number.parseInt(path, 10);
	if (
		(path.startsWith('"') && path.endsWith('"')) ||
		(path.startsWith("'") && path.endsWith("'"))
	) {
		return path.slice(1, -1);
	}
	return undefined;
}

const VALUE_PATH_KEYS_CAP = 20_000;
const valuePathKeysCache = new Map<string, string[]>();

function getValuePathKeys(path: string): string[] {
	let keys = valuePathKeysCache.get(path);
	if (!keys) {
		if (valuePathKeysCache.size >= VALUE_PATH_KEYS_CAP) {
			const first = valuePathKeysCache.keys().next().value;
			if (first !== undefined) valuePathKeysCache.delete(first);
		}
		keys = path.split(".");
		valuePathKeysCache.set(path, keys);
	}
	return keys;
}

/** Resolve dot path (e.g. context.foo.bar) to a value for {{#each}}. */
export function getValueByPath(path: string, ctx: RuleContext): unknown {
	const trimmed = path.trim();
	if (trimmed.startsWith("context.")) {
		const keyPath = trimmed.slice(8).trim();
		const keys = getValuePathKeys(keyPath);
		let current: unknown = ctx.context;
		for (const k of keys) {
			if (current == null || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[k];
		}
		return current;
	}
	if (trimmed.startsWith("params.")) {
		const keyPath = trimmed.slice(7).trim();
		const keys = getValuePathKeys(keyPath);
		let current: unknown = ctx.params;
		for (const k of keys) {
			if (current == null || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[k];
		}
		return current;
	}
	return getSafeValue(trimmed, ctx);
}

/** Resolve expression to an array for {{#each}}. Non-array values become single-element or empty. */
export function getArrayFromExpr(expr: string, ctx: RuleContext): unknown[] {
	const value = getValueByPath(expr, ctx);
	if (Array.isArray(value)) return value;
	if (value != null) return [value];
	return [];
}

export function evaluateConditionSafe(
	_expr: string,
	ctx: RuleContext,
): boolean {
	const expr = _expr.trim();
	if (!expr) return false;

	const evaluateSimple = (segment: string): boolean => {
		const parts = segment.trim().split(/\s+(==|!=)\s+/);
		if (parts.length === 1) {
			const value = getSafeValue(segment.trim(), ctx);
			return Boolean(value);
		}
		if (parts.length === 3) {
			const [left, op, right] = parts;
			const l = getSafeValue(left.trim(), ctx);
			const r = getSafeValue(right.trim(), ctx);
			if (op === "==") return l === r;
			if (op === "!=") return l !== r;
		}
		log.warn(`Unsupported safe condition segment "${segment}" in "${expr}"`);
		return false;
	};

	const orSegments = expr.split(/\s+\|\|\s+/);
	for (const orSegment of orSegments) {
		const andSegments = orSegment.split(/\s+&&\s+/);
		let andResult = true;
		for (const andSegment of andSegments) {
			andResult = andResult && evaluateSimple(andSegment);
			if (!andResult) break;
		}
		if (andResult) return true;
	}
	return false;
}

export function evaluateCondition(
	expr: string,
	ctx: RuleContext,
	engine: "js" | "safe",
): boolean {
	return engine === "safe"
		? evaluateConditionSafe(expr, ctx)
		: evaluateConditionJs(expr, ctx);
}
