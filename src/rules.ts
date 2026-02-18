import type { ShotputConfig } from "./config";
import { getLogger } from "./logger";

const log = getLogger("rules");

const IF_CLOSE = "{{/if}}";
const ELSE_MARKER = "{{else}}";

export interface RuleContext {
	context: Record<string, unknown>;
	env: NodeJS.ProcessEnv;
	params?: Record<string, unknown>;
}

function evaluateConditionJs(expr: string, ctx: RuleContext): boolean {
	try {
		const fn = new Function(
			"context",
			"env",
			"params",
			`return Boolean(${expr})`,
		);
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
 * Evaluate {{#if condition}}...{{else}}...{{/if}} blocks and return the template with
 * blocks replaced by the chosen branch. Runs as a pre-pass before interpolation.
 */
export function evaluateRules(content: string, config: ShotputConfig): string {
	const context = config.context ?? {};
	const env = typeof process !== "undefined" ? process.env : {};
	const params = (config as { params?: Record<string, unknown> }).params;
	const engine = config.expressionEngine ?? "js";
	const ctx: RuleContext = { context, env, params };

	let result = content;
	const ifOpenRegex = /\{\{#if\s+(.+?)\}\}/g;
	let match: RegExpExecArray | null;
	while (true) {
		ifOpenRegex.lastIndex = 0;
		match = ifOpenRegex.exec(result);
		if (!match) break;
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
		const fullBlock = result.slice(openStart, closeIndex + IF_CLOSE.length);
		result = result.replace(fullBlock, chosen);
	}
	return result;
}
