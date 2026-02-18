import type { ShotputConfig } from "./config";
import { getLogger } from "./logger";
import { substituteVariables } from "./variables";

const log = getLogger("rules");

const IF_CLOSE = "{{/if}}";
const ELSE_MARKER = "{{else}}";
const EACH_CLOSE = "{{/each}}";
/** New regex per call so concurrent evaluateRules() do not share lastIndex. */
const createIfOpenRegex = () => /\{\{#if\s+(.+?)\}\}/g;
const createEachOpenRegex = () => /\{\{#each\s+(.+?)\}\}/g;

const conditionFnCache = new Map<
	string,
	(
		context: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
		params: Record<string, unknown>,
	) => boolean
>();

export interface RuleContext {
	context: Record<string, unknown>;
	env: NodeJS.ProcessEnv;
	params?: Record<string, unknown>;
}

function evaluateConditionJs(expr: string, ctx: RuleContext): boolean {
	try {
		let fn = conditionFnCache.get(expr);
		if (!fn) {
			fn = new Function(
				"context",
				"env",
				"params",
				`return Boolean(${expr})`,
			) as (
				context: Record<string, unknown>,
				env: NodeJS.ProcessEnv,
				params: Record<string, unknown>,
			) => boolean;
			conditionFnCache.set(expr, fn);
		}
		return fn(ctx.context, ctx.env, ctx.params ?? {});
	} catch (err) {
		log.warn(`Rule condition evaluation failed for "${expr}": ${err}`);
		return false;
	}
}

function evaluateConditionSafe(_expr: string, ctx: RuleContext): boolean {
	// Minimal safe evaluator: only truthiness of context.key, env.KEY, params.key
	// and simple ==, !=, &&, ||. No method calls or complex expressions.
	const expr = _expr.trim();
	if (!expr) return false;
	const parts = expr.split(/\s+(==|!=|&&|\|\|)\s+/);
	if (parts.length === 1) {
		const v = getSafeValue(expr.trim(), ctx);
		return Boolean(v);
	}
	// Simple binary: a op b
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
function getValueByPath(path: string, ctx: RuleContext): unknown {
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
function getArrayFromExpr(expr: string, ctx: RuleContext): unknown[] {
	const value = getValueByPath(expr, ctx);
	if (Array.isArray(value)) return value;
	if (value != null) return [value];
	return [];
}

function evaluateCondition(
	expr: string,
	ctx: RuleContext,
	engine: "js" | "safe",
): boolean {
	return engine === "safe"
		? evaluateConditionSafe(expr, ctx)
		: evaluateConditionJs(expr, ctx);
}

/**
 * Find the matching {{/if}} for the {{#if}} at startIndex, accounting for nested blocks.
 */
function findMatchingClose(content: string, startIndex: number): number {
	const closeStr = "{{/if}}";
	let depth = 1;
	let pos = startIndex;
	while (depth > 0) {
		const nextOpen = content.indexOf("{{#if", pos);
		const nextClose = content.indexOf(closeStr, pos);
		if (nextClose === -1) return -1;
		if (nextOpen !== -1 && nextOpen < nextClose) {
			depth++;
			pos = nextOpen + 1;
		} else {
			depth--;
			if (depth === 0) return nextClose;
			pos = nextClose + closeStr.length;
		}
	}
	return -1;
}

/**
 * Find the matching {{/each}} for the {{#each}} at startIndex, accounting for nested {{#each}}.
 */
function findMatchingEachClose(content: string, startIndex: number): number {
	let depth = 1;
	let pos = startIndex;
	while (depth > 0) {
		const nextEachOpen = content.indexOf("{{#each", pos);
		const nextEachClose = content.indexOf(EACH_CLOSE, pos);
		if (nextEachClose === -1) return -1;
		if (nextEachOpen !== -1 && nextEachOpen < nextEachClose) {
			depth++;
			pos = nextEachOpen + 1;
		} else {
			depth--;
			if (depth === 0) return nextEachClose;
			pos = nextEachClose + EACH_CLOSE.length;
		}
	}
	return -1;
}

/**
 * Find the {{else}} that belongs to the same block (at depth 1 within blockContent).
 * Returns -1 if no else at this level.
 */
function findElseAtDepth(blockContent: string): number {
	let depth = 0;
	let pos = 0;
	while (pos < blockContent.length) {
		const nextIf = blockContent.indexOf("{{#if", pos);
		const nextElse = blockContent.indexOf(ELSE_MARKER, pos);
		const nextClose = blockContent.indexOf(IF_CLOSE, pos);
		const next = [nextIf, nextElse, nextClose]
			.filter((i) => i !== -1)
			.sort((a, b) => a - b)[0];
		if (next === undefined) return -1;
		if (next === nextIf) {
			depth++;
			pos = nextIf + 1;
		} else if (next === nextClose) {
			if (depth === 0) return -1;
			depth--;
			pos = nextClose + IF_CLOSE.length;
		} else {
			if (depth === 0) return nextElse;
			pos = nextElse + ELSE_MARKER.length;
		}
	}
	return -1;
}

/**
 * Find the next {{#if}} or {{#each}} in content and return which one and its match.
 */
function findNextBlock(
	content: string,
):
	| { kind: "if"; match: RegExpExecArray }
	| { kind: "each"; match: RegExpExecArray }
	| null {
	const ifRegex = createIfOpenRegex();
	const eachRegex = createEachOpenRegex();
	let ifMatch: RegExpExecArray | null = null;
	let eachMatch: RegExpExecArray | null = null;
	ifRegex.lastIndex = 0;
	eachRegex.lastIndex = 0;
	ifMatch = ifRegex.exec(content);
	eachMatch = eachRegex.exec(content);
	if (!ifMatch && !eachMatch) return null;
	if (ifMatch && !eachMatch) return { kind: "if", match: ifMatch };
	if (eachMatch && !ifMatch) return { kind: "each", match: eachMatch };
	if (ifMatch && eachMatch) {
		return ifMatch.index <= eachMatch.index
			? { kind: "if", match: ifMatch }
			: { kind: "each", match: eachMatch };
	}
	return null;
}

/**
 * Evaluate {{#if condition}}...{{else}}...{{/if}} and {{#each expr}}...{{/each}} blocks.
 * For each, exposes context.__loop = { item, index } so rules and variable substitution can read them.
 * Runs as a pre-pass before interpolation.
 */
export function evaluateRules(content: string, config: ShotputConfig): string {
	const context = config.context ?? {};
	const env = typeof process !== "undefined" ? process.env : {};
	const params = (config as { params?: Record<string, unknown> }).params;
	const engine = config.expressionEngine ?? "js";
	const ctx: RuleContext = { context, env, params };

	let result = content;
	while (true) {
		const block = findNextBlock(result);
		if (!block) break;

		if (block.kind === "if") {
			const match = block.match;
			const expr = match[1].trim();
			const openStart = match.index;
			const openEnd = match.index + match[0].length;
			const closeIndex = findMatchingClose(result, openEnd);
			if (closeIndex === -1) {
				log.warn(`Unclosed {{#if}} block at index ${openStart}`);
				break;
			}
			const blockContent = result.slice(openEnd, closeIndex);
			const elseIndex = findElseAtDepth(blockContent);
			let consequent: string;
			let alternate: string;
			if (elseIndex === -1) {
				consequent = blockContent;
				alternate = "";
			} else {
				consequent = blockContent.slice(0, elseIndex);
				alternate = blockContent.slice(elseIndex + ELSE_MARKER.length);
			}
			const chosen = evaluateCondition(expr, ctx, engine)
				? consequent
				: alternate;
			result =
				result.slice(0, openStart) +
				chosen +
				result.slice(closeIndex + IF_CLOSE.length);
			continue;
		}

		// {{#each expr}}
		const match = block.match;
		const expr = match[1].trim();
		const openStart = match.index;
		const openEnd = match.index + match[0].length;
		const closeIndex = findMatchingEachClose(result, openEnd);
		if (closeIndex === -1) {
			log.warn(`Unclosed {{#each}} block at index ${openStart}`);
			break;
		}
		const blockContent = result.slice(openEnd, closeIndex);
		const arr = getArrayFromExpr(expr, ctx);
		const chunks: string[] = [];
		for (let i = 0; i < arr.length; i++) {
			const mergedContext = {
				...context,
				__loop: { item: arr[i], index: i },
			};
			const mergedConfig = { ...config, context: mergedContext };
			const evaluated = evaluateRules(blockContent, mergedConfig);
			const substituted = substituteVariables(evaluated, mergedConfig);
			chunks.push(substituted);
		}
		result =
			result.slice(0, openStart) +
			chunks.join("") +
			result.slice(closeIndex + EACH_CLOSE.length);
	}
	return result;
}
