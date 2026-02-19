import { getLogger } from "./logger";

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

const FLAGS_PATH_REGEX = /^context\.flags\.(\w+)$/;

export function evaluateConditionJs(expr: string, ctx: RuleContext): boolean {
	const trimmed = expr.trim();
	const flagsMatch = FLAGS_PATH_REGEX.exec(trimmed);
	if (flagsMatch) {
		const key = flagsMatch[1];
		const flags = ctx.context?.["flags"];
		const val =
			flags != null && typeof flags === "object"
				? (flags as Record<string, unknown>)[key]
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
		const key = path.slice(8).trim();
		return ctx.context[key];
	}
	if (path.startsWith("env.")) {
		const key = path.slice(4).trim();
		return ctx.env[key];
	}
	if (path.startsWith("params.")) {
		const key = path.slice(7).trim();
		return ctx.params?.[key];
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

/** Resolve dot path (e.g. context.foo.bar) to a value for {{#each}}. */
export function getValueByPath(path: string, ctx: RuleContext): unknown {
	const trimmed = path.trim();
	if (trimmed.startsWith("context.")) {
		const keyPath = trimmed.slice(8).trim();
		const keys = keyPath.split(".");
		let current: unknown = ctx.context;
		for (const k of keys) {
			if (current == null || typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[k];
		}
		return current;
	}
	if (trimmed.startsWith("params.")) {
		const keyPath = trimmed.slice(7).trim();
		const keys = keyPath.split(".");
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
	const parts = expr.split(/\s+(==|!=|&&|\|\|)\s+/);
	if (parts.length === 1) {
		const v = getSafeValue(expr.trim(), ctx);
		return Boolean(v);
	}
	if (parts.length === 3) {
		const [left, op, right] = parts;
		const l = getSafeValue(left.trim(), ctx);
		const r = getSafeValue(right.trim(), ctx);
		if (op === "==") return l === r;
		if (op === "!=") return l !== r;
		if (op === "&&") return Boolean(l) && Boolean(r);
		if (op === "||") return Boolean(l) || Boolean(r);
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
