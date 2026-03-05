import { dirname, join } from "node:path";
import type { ShotputConfig } from "./config";

export type CompiledJinjaRenderer = (ctx: Record<string, unknown>) => string;

const COMPILED_CACHE_CAP = 256;
const compiledTemplateCache = new Map<string, CompiledTemplate>();
const COMPILED_EXPR_CACHE_CAP = 4096;
const globalCompiledExprCache = new Map<string, CompiledExpr>();
const INCLUDE_TAG_RE = /\{%-?\s*include\s+['"]([^'"]+)['"]\s*-?%\}/g;
const MAX_INCLUDE_DEPTH = 10;

type Node =
	| { kind: "text"; value: string }
	| { kind: "output"; expr: string }
	| {
			kind: "if";
			branches: Array<{ cond: string; body: Node[] }>;
			elseBody: Node[];
	  }
	| {
			kind: "for";
			targets: string[];
			iterableExpr: string;
			body: Node[];
			elseBody: Node[];
	  }
	| { kind: "set"; name: string; expr: string }
	| {
			kind: "with";
			assignments: Array<{ name: string; expr: string }>;
			body: Node[];
	  }
	| { kind: "macro"; name: string; args: string[]; body: Node[] };

interface CompiledTemplate {
	ast: Node[];
	render: CompiledJinjaRenderer;
}

type ExprScope = Record<string, unknown>;
type CompiledExpr = (scope: ExprScope) => unknown;
type CompareOp = "==" | "!=" | ">=" | "<=" | ">" | "<";

function evictOldestIfNeeded<K, V>(cache: Map<K, V>, cap: number): void {
	if (cache.size >= cap) {
		const firstKey = cache.keys().next().value;
		if (firstKey !== undefined) cache.delete(firstKey);
	}
}

function isTruthy(value: unknown): boolean {
	if (value == null) return false;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") return value.length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

function toArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function splitTopLevel(input: string, separator: string): string[] {
	if (!input.includes(separator)) return [input.trim()];
	const out: string[] = [];
	let depthParen = 0;
	let depthBracket = 0;
	let depthBrace = 0;
	let quote: "'" | '"' | null = null;
	let start = 0;
	for (let i = 0; i < input.length; i++) {
		const c = input[i];
		if (quote !== null) {
			if (c === quote && input[i - 1] !== "\\") quote = null;
			continue;
		}
		if (c === "'" || c === '"') {
			quote = c;
			continue;
		}
		if (c === "(") depthParen++;
		else if (c === ")") depthParen--;
		else if (c === "[") depthBracket++;
		else if (c === "]") depthBracket--;
		else if (c === "{") depthBrace++;
		else if (c === "}") depthBrace--;
		const atTop =
			depthParen === 0 &&
			depthBracket === 0 &&
			depthBrace === 0 &&
			quote === null;
		if (atTop && c === separator) {
			out.push(input.slice(start, i).trim());
			start = i + 1;
		}
	}
	out.push(input.slice(start).trim());
	return out;
}

const pathSplitCache = new Map<string, string[]>();
const PATH_SPLIT_CACHE_CAP = 4096;

function getByPath(scope: ExprScope, path: string): unknown {
	let keys = pathSplitCache.get(path);
	if (keys === undefined) {
		keys = path.split(".");
		if (pathSplitCache.size >= PATH_SPLIT_CACHE_CAP) {
			const first = pathSplitCache.keys().next().value;
			if (first !== undefined) pathSplitCache.delete(first);
		}
		pathSplitCache.set(path, keys);
	}
	let current: unknown = scope;
	for (let i = 0; i < keys.length; i++) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[keys[i]];
	}
	return current;
}

function parseSimpleCompare(expr: string): {
	left: string;
	op: CompareOp;
	right: string;
} | null {
	let depthParen = 0;
	let depthBracket = 0;
	let depthBrace = 0;
	let quote: "'" | '"' | null = null;
	for (let i = 0; i < expr.length; i++) {
		const ch = expr.charCodeAt(i);
		if (quote !== null) {
			if (
				((ch === 39 && quote === "'") || (ch === 34 && quote === '"')) &&
				expr.charCodeAt(i - 1) !== 92
			)
				quote = null;
			continue;
		}
		if (ch === 39) {
			quote = "'";
			continue;
		}
		if (ch === 34) {
			quote = '"';
			continue;
		}
		if (ch === 40) depthParen++;
		else if (ch === 41) depthParen--;
		else if (ch === 91) depthBracket++;
		else if (ch === 93) depthBracket--;
		else if (ch === 123) depthBrace++;
		else if (ch === 125) depthBrace--;
		if (depthParen !== 0 || depthBracket !== 0 || depthBrace !== 0) continue;
		let op: CompareOp | null = null;
		let opLen = 0;
		if (ch === 61 && expr.charCodeAt(i + 1) === 61) {
			op = "==";
			opLen = 2;
		} else if (ch === 33 && expr.charCodeAt(i + 1) === 61) {
			op = "!=";
			opLen = 2;
		} else if (ch === 62) {
			if (expr.charCodeAt(i + 1) === 61) {
				op = ">=";
				opLen = 2;
			} else {
				op = ">";
				opLen = 1;
			}
		} else if (ch === 60) {
			if (expr.charCodeAt(i + 1) === 61) {
				op = "<=";
				opLen = 2;
			} else {
				op = "<";
				opLen = 1;
			}
		}
		if (op !== null) {
			const left = expr.slice(0, i).trim();
			const right = expr.slice(i + opLen).trim();
			if (left.length === 0 || right.length === 0) return null;
			return { left, op, right };
		}
	}
	return null;
}

function looksNumeric(expr: string): boolean {
	let i = 0;
	if (expr.charCodeAt(0) === 45) i++;
	if (i >= expr.length) return false;
	let hasDot = false;
	let hasDigit = false;
	for (; i < expr.length; i++) {
		const ch = expr.charCodeAt(i);
		if (ch >= 48 && ch <= 57) {
			hasDigit = true;
			continue;
		}
		if (ch === 46 && !hasDot) {
			hasDot = true;
			continue;
		}
		return false;
	}
	return hasDigit;
}

function compileLiteralExpr(expr: string): CompiledExpr | null {
	if (expr === "true") return () => true;
	if (expr === "false") return () => false;
	if (expr === "none" || expr === "null") return () => null;
	if (expr === "undefined") return () => undefined;
	if (looksNumeric(expr)) {
		const num = Number(expr);
		return () => num;
	}
	const first = expr.charCodeAt(0);
	const last = expr.charCodeAt(expr.length - 1);
	if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
		const unwrapped = expr.slice(1, -1);
		return () => unwrapped;
	}
	return null;
}

function isPathExpr(expr: string): boolean {
	if (expr.length === 0) return false;
	const first = expr.charCodeAt(0);
	if (
		!(first >= 65 && first <= 90) &&
		!(first >= 97 && first <= 122) &&
		first !== 95 &&
		first !== 36
	)
		return false;
	for (let i = 1; i < expr.length; i++) {
		const ch = expr.charCodeAt(i);
		if (
			(ch >= 65 && ch <= 90) ||
			(ch >= 97 && ch <= 122) ||
			(ch >= 48 && ch <= 57) ||
			ch === 95 ||
			ch === 36 ||
			ch === 46
		)
			continue;
		return false;
	}
	return true;
}

function compilePathExpr(expr: string): CompiledExpr | null {
	if (!isPathExpr(expr)) return null;
	const path = expr;
	return (scope) => getByPath(scope, path);
}

function compileCallExpr(expr: string): CompiledExpr | null {
	const call = parseCall(expr);
	if (call.name.length === 0) return null;
	if (!expr.endsWith(")")) return null;
	const calleeExpr = compilePathExpr(call.name);
	if (calleeExpr === null) return null;
	const argFns = call.args.map((arg) => compileExpr(arg));
	return (scope) => {
		const callee = calleeExpr(scope);
		if (typeof callee !== "function") return undefined;
		const argValues = argFns.map((fn) => fn(scope));
		return (callee as (...args: unknown[]) => unknown)(...argValues);
	};
}

function compareValues(left: unknown, op: CompareOp, right: unknown): boolean {
	if (op === "==") return left === right;
	if (op === "!=") return left !== right;
	if (op === ">=") return (left as never) >= (right as never);
	if (op === "<=") return (left as never) <= (right as never);
	if (op === ">") return (left as never) > (right as never);
	return (left as never) < (right as never);
}

function compileSimpleExpr(expr: string): CompiledExpr | null {
	const literal = compileLiteralExpr(expr);
	if (literal !== null) return literal;
	const callExpr = compileCallExpr(expr);
	if (callExpr !== null) return callExpr;
	const pathExpr = compilePathExpr(expr);
	if (pathExpr !== null) return pathExpr;
	const cmp = parseSimpleCompare(expr);
	if (cmp !== null) {
		const leftFn = compileExpr(cmp.left);
		const rightFn = compileExpr(cmp.right);
		return (scope) => compareValues(leftFn(scope), cmp.op, rightFn(scope));
	}
	return null;
}

function toJsExpr(expr: string): string {
	if (
		!expr.includes(" and ") &&
		!expr.includes(" or ") &&
		!expr.includes(" not ") &&
		!expr.includes(" none") &&
		!expr.includes(" true") &&
		!expr.includes(" false")
	) {
		return expr;
	}
	return expr
		.replace(/\band\b/g, "&&")
		.replace(/\bor\b/g, "||")
		.replace(/\bnot\b/g, "!")
		.replace(/\bnone\b/g, "null")
		.replace(/\btrue\b/g, "true")
		.replace(/\bfalse\b/g, "false");
}

function parseCall(part: string): { name: string; args: string[] } {
	const paren = part.indexOf("(");
	if (paren === -1 || !part.endsWith(")")) {
		return { name: part.trim(), args: [] };
	}
	const name = part.slice(0, paren).trim();
	const argStr = part.slice(paren + 1, -1).trim();
	if (argStr.length === 0) return { name, args: [] };
	if (!argStr.includes(",")) return { name, args: [argStr] };
	return { name, args: splitTopLevel(argStr, ",") };
}

function applyFilter(name: string, value: unknown, args: unknown[]): unknown {
	if (name === "trim") {
		return String(value ?? "").trim();
	}
	if (name === "upper") {
		return String(value ?? "").toUpperCase();
	}
	if (name === "lower") {
		return String(value ?? "").toLowerCase();
	}
	if (name === "default") {
		if (value == null || value === "") {
			return args[0] ?? "";
		}
		return value;
	}
	if (name === "length") {
		if (Array.isArray(value) || typeof value === "string") return value.length;
		if (value != null && typeof value === "object") {
			return Object.keys(value as Record<string, unknown>).length;
		}
		return 0;
	}
	return value;
}

function applyTest(name: string, value: unknown, args: unknown[]): boolean {
	if (name === "divisibleby") {
		const by = Number(args[0] ?? 1);
		const num = Number(value ?? 0);
		return by !== 0 && num % by === 0;
	}
	if (name === "defined") {
		return value !== undefined;
	}
	if (name === "undefined") {
		return value === undefined;
	}
	if (name === "odd") {
		return Number(value ?? 0) % 2 === 1;
	}
	if (name === "even") {
		return Number(value ?? 0) % 2 === 0;
	}
	return false;
}

function splitTopLevelKeyword(input: string, keyword: string): string[] {
	if (!input.includes(keyword)) return [input];
	const out: string[] = [];
	let depthParen = 0;
	let depthBracket = 0;
	let depthBrace = 0;
	let quote: "'" | '"' | null = null;
	let start = 0;
	const kLen = keyword.length;
	for (let i = 0; i < input.length; i++) {
		const c = input[i];
		if (quote !== null) {
			if (c === quote && input[i - 1] !== "\\") quote = null;
			continue;
		}
		if (c === "'" || c === '"') {
			quote = c;
			continue;
		}
		if (c === "(") depthParen++;
		else if (c === ")") depthParen--;
		else if (c === "[") depthBracket++;
		else if (c === "]") depthBracket--;
		else if (c === "{") depthBrace++;
		else if (c === "}") depthBrace--;
		if (
			depthParen === 0 &&
			depthBracket === 0 &&
			depthBrace === 0 &&
			input.startsWith(keyword, i)
		) {
			out.push(input.slice(start, i).trim());
			start = i + kLen;
			i += kLen - 1;
		}
	}
	out.push(input.slice(start).trim());
	return out;
}

function compileLogicalExpr(expr: string): CompiledExpr | null {
	const orParts = splitTopLevelKeyword(expr, " or ");
	if (orParts.length > 1) {
		const fns = orParts.map((p) => compileExpr(p));
		return (scope) => {
			for (const fn of fns) {
				const v = fn(scope);
				if (isTruthy(v)) return v;
			}
			return false;
		};
	}
	const andParts = splitTopLevelKeyword(expr, " and ");
	if (andParts.length > 1) {
		const fns = andParts.map((p) => compileExpr(p));
		return (scope) => {
			let last: unknown = true;
			for (const fn of fns) {
				last = fn(scope);
				if (!isTruthy(last)) return last;
			}
			return last;
		};
	}
	if (expr.startsWith("not ")) {
		const inner = compileExpr(expr.slice(4));
		return (scope) => !isTruthy(inner(scope));
	}
	return null;
}

function compileJsExpr(expr: string): CompiledExpr {
	const jsExpr = toJsExpr(expr);
	let fn: ((scopeObj: ExprScope) => unknown) | undefined;
	try {
		fn = new Function("scope", `with (scope) { return (${jsExpr}); }`) as (
			scopeObj: ExprScope,
		) => unknown;
	} catch {
		return () => undefined;
	}
	return (scope) => {
		try {
			return fn(scope);
		} catch {
			return undefined;
		}
	};
}

function compileExpr(expr: string): CompiledExpr {
	const trimmed = expr.trim();
	if (trimmed.length === 0) return () => "";

	const hasPipe = trimmed.includes("|");
	const hasIs = trimmed.includes(" is ");

	if (!hasPipe && !hasIs) {
		const simple = compileSimpleExpr(trimmed);
		if (simple !== null) return simple;
		const logical = compileLogicalExpr(trimmed);
		if (logical !== null) return logical;
		return compileJsExpr(trimmed);
	}

	if (hasIs) {
		const isMatch = trimmed.match(
			/^(.*?)\s+is\s+(not\s+)?([a-zA-Z_][a-zA-Z0-9_]*)(?:\((.*)\))?$/,
		);
		if (isMatch !== null) {
			const left = compileExpr(isMatch[1] ?? "");
			const neg = (isMatch[2] ?? "").trim().startsWith("not");
			const testName = (isMatch[3] ?? "").trim();
			const argExpr = (isMatch[4] ?? "").trim();
			const args = argExpr.length > 0 ? splitTopLevel(argExpr, ",") : [];
			const argFns = args.map((arg) => compileExpr(arg));
			return (scope) => {
				const leftValue = left(scope);
				const argValues = argFns.map((argFn) => argFn(scope));
				const result = applyTest(testName, leftValue, argValues);
				return neg ? !result : result;
			};
		}
	}

	if (hasPipe) {
		const pipeParts = splitTopLevel(trimmed, "|");
		if (pipeParts.length > 1) {
			const baseExpr = compileExpr(pipeParts[0] ?? "");
			const filters = pipeParts.slice(1).map((part) => {
				const call = parseCall(part);
				return {
					name: call.name,
					argFns: call.args.map((arg) => compileExpr(arg)),
				};
			});
			return (scope) => {
				let value = baseExpr(scope);
				for (const filter of filters) {
					const argValues = filter.argFns.map((argFn) => argFn(scope));
					value = applyFilter(filter.name, value, argValues);
				}
				return value;
			};
		}
	}

	const simple = compileSimpleExpr(trimmed);
	if (simple !== null) return simple;

	const logical = compileLogicalExpr(trimmed);
	if (logical !== null) return logical;

	return compileJsExpr(trimmed);
}

function parseAssignments(expr: string): Array<{ name: string; expr: string }> {
	const out: Array<{ name: string; expr: string }> = [];
	for (const part of splitTopLevel(expr, ",")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const name = part.slice(0, eq).trim();
		const valueExpr = part.slice(eq + 1).trim();
		if (name.length === 0 || valueExpr.length === 0) continue;
		out.push({ name, expr: valueExpr });
	}
	return out;
}

type TemplateToken =
	| { type: "text"; value: string }
	| { type: "output"; expr: string }
	| { type: "statement"; tag: string; payload: string };

const STOP_NONE = 0;
const STOP_ELIF = 1 << 0;
const STOP_ELSE = 1 << 1;
const STOP_ENDIF = 1 << 2;
const STOP_ENDFOR = 1 << 3;
const STOP_ENDWITH = 1 << 4;
const STOP_ENDMACRO = 1 << 5;

function stopBitForTag(tag: string): number {
	if (tag === "elif") return STOP_ELIF;
	if (tag === "else") return STOP_ELSE;
	if (tag === "endif") return STOP_ENDIF;
	if (tag === "endfor") return STOP_ENDFOR;
	if (tag === "endwith") return STOP_ENDWITH;
	if (tag === "endmacro") return STOP_ENDMACRO;
	return STOP_NONE;
}

function parseTagAndPayload(stmtInner: string): {
	tag: string;
	payload: string;
} {
	let i = 0;
	const sLen = stmtInner.length;
	while (i < sLen && stmtInner.charCodeAt(i) <= 32) i++;
	const start = i;
	while (i < sLen && stmtInner.charCodeAt(i) > 32) i++;
	const tag = stmtInner.slice(start, i);
	while (i < sLen && stmtInner.charCodeAt(i) <= 32) i++;
	return { tag, payload: stmtInner.slice(i) };
}

function lexTemplate(template: string): TemplateToken[] {
	const tokens: TemplateToken[] = [];
	let cursor = 0;
	let textStart = 0;
	const len = template.length;

	while (cursor < len) {
		const braceIdx = template.indexOf("{", cursor);

		if (braceIdx === -1 || braceIdx >= len - 1) {
			break;
		}

		const next = template.charCodeAt(braceIdx + 1);

		if (next !== 123 && next !== 37 && next !== 35) {
			cursor = braceIdx + 1;
			continue;
		}

		if (braceIdx > textStart) {
			tokens.push({ type: "text", value: template.slice(textStart, braceIdx) });
		}

		if (next === 35) {
			const end = template.indexOf("#}", braceIdx + 2);
			if (end === -1) {
				textStart = braceIdx;
				cursor = len;
				break;
			}
			cursor = end + 2;
			textStart = cursor;
		} else if (next === 123) {
			const end = template.indexOf("}}", braceIdx + 2);
			if (end === -1) {
				textStart = braceIdx;
				cursor = len;
				break;
			}
			tokens.push({
				type: "output",
				expr: template.slice(braceIdx + 2, end).trim(),
			});
			cursor = end + 2;
			textStart = cursor;
		} else {
			const stmtEnd = template.indexOf("%}", braceIdx + 2);
			if (stmtEnd === -1) {
				textStart = braceIdx;
				cursor = len;
				break;
			}
			const stmtInner = template.slice(braceIdx + 2, stmtEnd).trim();
			const { tag, payload } = parseTagAndPayload(stmtInner);
			if (tag === "raw") {
				const endRaw = template.indexOf("{% endraw %}", stmtEnd + 2);
				if (endRaw === -1) {
					tokens.push({ type: "text", value: template.slice(stmtEnd + 2) });
					return tokens;
				}
				tokens.push({
					type: "text",
					value: template.slice(stmtEnd + 2, endRaw),
				});
				cursor = endRaw + 12;
				textStart = cursor;
			} else {
				tokens.push({ type: "statement", tag, payload });
				cursor = stmtEnd + 2;
				textStart = cursor;
			}
		}
	}

	if (textStart < len) {
		tokens.push({ type: "text", value: template.slice(textStart) });
	}
	return tokens;
}

class Parser {
	private readonly tokens: TemplateToken[];
	private index = 0;
	private lastStopTag: string | undefined;
	private lastStopPayload: string | undefined;

	constructor(tokens: TemplateToken[]) {
		this.tokens = tokens;
	}

	parse(): Node[] {
		return this.parseNodes(STOP_NONE);
	}

	private parseNodes(stopMask: number): Node[] {
		this.lastStopTag = undefined;
		this.lastStopPayload = undefined;
		const nodes: Node[] = [];
		while (this.index < this.tokens.length) {
			const token = this.tokens[this.index];
			if (token === undefined) break;
			if (token.type === "text") {
				nodes.push({ kind: "text", value: token.value });
				this.index++;
				continue;
			}
			if (token.type === "output") {
				nodes.push({ kind: "output", expr: token.expr });
				this.index++;
				continue;
			}
			const stopBit = stopBitForTag(token.tag);
			if ((stopMask & stopBit) !== 0) {
				this.lastStopTag = token.tag;
				this.lastStopPayload = token.payload;
				this.index++;
				return nodes;
			}
			if (token.tag === "if") {
				nodes.push(this.parseIf(token.payload));
				continue;
			}
			if (token.tag === "for") {
				const parsed = this.parseFor(token.payload);
				if (parsed !== undefined) {
					nodes.push(parsed);
				}
				continue;
			}
			if (token.tag === "set") {
				const parsed = this.parseSet(token.payload);
				if (parsed !== undefined) nodes.push(parsed);
				this.index++;
				continue;
			}
			if (token.tag === "with") {
				nodes.push(this.parseWith(token.payload));
				continue;
			}
			if (token.tag === "macro") {
				nodes.push(this.parseMacro(token.payload));
				continue;
			}
			// Unsupported statement; skip.
			this.index++;
		}
		return nodes;
	}

	private parseIf(condPayload: string): Node {
		// consume opening if
		this.index++;
		const branches: Array<{ cond: string; body: Node[] }> = [];
		let elseBody: Node[] = [];
		let currentCond = condPayload;
		while (true) {
			const branchBody = this.parseNodes(STOP_ELIF | STOP_ELSE | STOP_ENDIF);
			branches.push({ cond: currentCond, body: branchBody });
			if (this.lastStopTag === "elif") {
				currentCond = this.lastStopPayload ?? "";
				continue;
			}
			if (this.lastStopTag === "else") {
				elseBody = this.parseNodes(STOP_ENDIF);
			}
			break;
		}
		return { kind: "if", branches, elseBody };
	}

	private parseFor(payload: string): Node | undefined {
		// consume opening for
		this.index++;
		const match = payload.match(/^(.*?)\s+in\s+(.*)$/);
		if (match === null) return undefined;
		const targets = splitTopLevel((match[1] ?? "").trim(), ",")
			.map((v) => v.trim())
			.filter(Boolean);
		const iterableExpr = (match[2] ?? "").trim();
		const body = this.parseNodes(STOP_ELSE | STOP_ENDFOR);
		let elseBody: Node[] = [];
		if (this.lastStopTag === "else") {
			elseBody = this.parseNodes(STOP_ENDFOR);
		}
		return {
			kind: "for",
			targets,
			iterableExpr,
			body,
			elseBody,
		};
	}

	private parseSet(payload: string): Node | undefined {
		const eq = payload.indexOf("=");
		if (eq === -1) return undefined;
		const name = payload.slice(0, eq).trim();
		const expr = payload.slice(eq + 1).trim();
		return { kind: "set", name, expr };
	}

	private parseWith(payload: string): Node {
		// consume opening with
		this.index++;
		const body = this.parseNodes(STOP_ENDWITH);
		return {
			kind: "with",
			assignments: parseAssignments(payload),
			body,
		};
	}

	private parseMacro(payload: string): Node {
		// consume opening macro
		this.index++;
		const sig = parseMacroSignature(payload);
		const body = this.parseNodes(STOP_ENDMACRO);
		return {
			kind: "macro",
			name: sig.name,
			args: sig.args,
			body,
		};
	}
}

function parseMacroSignature(payload: string): {
	name: string;
	args: string[];
} {
	const match = payload.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/);
	if (match === null) {
		return { name: payload.trim(), args: [] };
	}
	const name = (match[1] ?? "").trim();
	const argsRaw = (match[2] ?? "").trim();
	const args = argsRaw.length > 0 ? splitTopLevel(argsRaw, ",") : [];
	return { name, args: args.map((arg) => arg.trim()).filter(Boolean) };
}

function renderNodes(
	nodes: Node[],
	scope: ExprScope,
	getExpr: (expr: string) => CompiledExpr,
): string {
	let out = "";
	for (const node of nodes) {
		if (node.kind === "text") {
			out += node.value;
			continue;
		}
		if (node.kind === "output") {
			const val = getExpr(node.expr)(scope);
			out += val == null ? "" : String(val);
			continue;
		}
		if (node.kind === "set") {
			scope[node.name] = getExpr(node.expr)(scope);
			continue;
		}
		if (node.kind === "with") {
			const child = Object.create(scope) as ExprScope;
			for (const assignment of node.assignments) {
				child[assignment.name] = getExpr(assignment.expr)(child);
			}
			out += renderNodes(node.body, child, getExpr);
			continue;
		}
		if (node.kind === "macro") {
			scope[node.name] = (...args: unknown[]) => {
				const child = Object.create(scope) as ExprScope;
				for (const [idx, argName] of node.args.entries()) {
					child[argName] = args[idx];
				}
				return renderNodes(node.body, child, getExpr);
			};
			continue;
		}
		if (node.kind === "if") {
			let rendered = false;
			for (const branch of node.branches) {
				if (isTruthy(getExpr(branch.cond)(scope))) {
					out += renderNodes(branch.body, Object.create(scope), getExpr);
					rendered = true;
					break;
				}
			}
			if (!rendered) {
				out += renderNodes(node.elseBody, Object.create(scope), getExpr);
			}
			continue;
		}
		if (node.kind === "for") {
			const iterable = toArray(getExpr(node.iterableExpr)(scope));
			if (iterable.length === 0) {
				out += renderNodes(node.elseBody, Object.create(scope), getExpr);
				continue;
			}
			for (const item of iterable) {
				const child = Object.create(scope) as ExprScope;
				if (node.targets.length <= 1) {
					const key = node.targets[0];
					if (key !== undefined) child[key] = item;
				} else {
					const tuple = Array.isArray(item) ? item : [item];
					for (const [idx, key] of node.targets.entries()) {
						child[key] = tuple[idx];
					}
				}
				out += renderNodes(node.body, child, getExpr);
			}
		}
	}
	return out;
}

let aotVarCounter = 0;

function aotUniqueVar(): string {
	return `__v${aotVarCounter++}`;
}

const AOT_EXPR_MATCH_REGEX =
	/^(.*?)\s+is\s+(not\s+)?([a-zA-Z_][a-zA-Z0-9_]*)(?:\((.*)\))?$/;

function aotExpr(expr: string): string {
	const trimmed = expr.trim();

	if (trimmed.includes(" is ")) {
		const isMatch = trimmed.match(AOT_EXPR_MATCH_REGEX);
		if (isMatch !== null) {
			const leftJs = aotExpr(isMatch[1] ?? "");
			const neg = (isMatch[2] ?? "").trim().startsWith("not");
			const testName = (isMatch[3] ?? "").trim();
			const argExpr = (isMatch[4] ?? "").trim();
			const argParts = argExpr.length > 0 ? splitTopLevel(argExpr, ",") : [];
			const argsJs = argParts.map((a) => aotExpr(a)).join(",");
			const call = `__applyTest(${JSON.stringify(testName)},${leftJs},[${argsJs}])`;
			return neg ? `!${call}` : call;
		}
	}

	if (trimmed.includes("|")) {
		const pipeParts = splitTopLevel(trimmed, "|");
		if (pipeParts.length > 1) {
			let code = aotExpr(pipeParts[0] ?? "");
			for (let fi = 1; fi < pipeParts.length; fi++) {
				const call = parseCall(pipeParts[fi]);
				const argsJs = call.args.map((a) => aotExpr(a)).join(",");
				code = `__applyFilter(${JSON.stringify(call.name)},${code},[${argsJs}])`;
			}
			return code;
		}
	}

	return toJsExpr(trimmed);
}

function emitNodes(nodes: Node[], parts: string[]): void {
	for (let ni = 0; ni < nodes.length; ni++) {
		const node = nodes[ni];
		if (node.kind === "text") {
			let merged = node.value;
			while (ni + 1 < nodes.length && nodes[ni + 1].kind === "text") {
				ni++;
				merged += (nodes[ni] as { kind: "text"; value: string }).value;
			}
			parts.push(`__out+=${JSON.stringify(merged)};`);
		} else if (node.kind === "output") {
			const v = aotUniqueVar();
			parts.push(
				`{const ${v}=(${aotExpr(node.expr)});__out+=${v}==null?'':String(${v});}`,
			);
		} else if (node.kind === "set") {
			parts.push(`${node.name}=(${aotExpr(node.expr)});`);
		} else if (node.kind === "if") {
			for (let bi = 0; bi < node.branches.length; bi++) {
				const branch = node.branches[bi];
				parts.push(
					bi === 0
						? `if(__isTruthy(${aotExpr(branch.cond)})){`
						: `else if(__isTruthy(${aotExpr(branch.cond)})){`,
				);
				emitNodes(branch.body, parts);
				parts.push("}");
			}
			if (node.elseBody.length > 0) {
				parts.push("else{");
				emitNodes(node.elseBody, parts);
				parts.push("}");
			}
		} else if (node.kind === "for") {
			const iterVar = aotUniqueVar();
			const idxVar = aotUniqueVar();
			parts.push(`{const ${iterVar}=__toArray(${aotExpr(node.iterableExpr)});`);
			if (node.elseBody.length > 0) {
				parts.push(`if(${iterVar}.length===0){`);
				emitNodes(node.elseBody, parts);
				parts.push("}else{");
			}
			parts.push(
				`for(let ${idxVar}=0;${idxVar}<${iterVar}.length;${idxVar}++){`,
			);
			if (node.targets.length <= 1) {
				const key = node.targets[0];
				if (key !== undefined) {
					parts.push(`var ${key}=${iterVar}[${idxVar}];`);
				}
			} else {
				const tupleVar = aotUniqueVar();
				parts.push(
					`const ${tupleVar}=Array.isArray(${iterVar}[${idxVar}])?${iterVar}[${idxVar}]:[${iterVar}[${idxVar}]];`,
				);
				for (let ti = 0; ti < node.targets.length; ti++) {
					parts.push(`var ${node.targets[ti]}=${tupleVar}[${ti}];`);
				}
			}
			parts.push(
				`var loop={index0:${idxVar},index:${idxVar}+1,first:${idxVar}===0,last:${idxVar}===${iterVar}.length-1,length:${iterVar}.length};`,
			);
			emitNodes(node.body, parts);
			parts.push("}");
			if (node.elseBody.length > 0) {
				parts.push("}");
			}
			parts.push("}");
		} else if (node.kind === "with") {
			parts.push("{");
			for (const assignment of node.assignments) {
				parts.push(`var ${assignment.name}=(${aotExpr(assignment.expr)});`);
			}
			emitNodes(node.body, parts);
			parts.push("}");
		} else if (node.kind === "macro") {
			parts.push(
				`var ${node.name}=function(${node.args.join(",")}){var __out='';`,
			);
			emitNodes(node.body, parts);
			parts.push("return __out;};");
		}
	}
}

function compileToAot(ast: Node[]): CompiledJinjaRenderer | null {
	aotVarCounter = 0;
	const parts: string[] = ["var __out='';"];
	try {
		emitNodes(ast, parts);
	} catch {
		return null;
	}
	parts.push("return __out;");
	const code = parts.join("\n");
	try {
		const fn = new Function(
			"__isTruthy",
			"__toArray",
			"__applyFilter",
			"__applyTest",
			"scope",
			`with(scope){${code}}`,
		) as (
			it: typeof isTruthy,
			ta: typeof toArray,
			af: typeof applyFilter,
			at: typeof applyTest,
			s: ExprScope,
		) => string;
		return (ctx) => {
			const scope = Object.create(null) as ExprScope;
			for (const k in ctx) scope[k] = ctx[k];
			return fn(isTruthy, toArray, applyFilter, applyTest, scope);
		};
	} catch {
		return null;
	}
}

function compileTemplate(template: string): CompiledTemplate {
	const tokens = lexTemplate(template);
	const ast = new Parser(tokens).parse();

	const aotRender = compileToAot(ast);
	if (aotRender !== null) {
		return { ast, render: aotRender };
	}

	const compiledExprCache = new Map<string, CompiledExpr>();
	const getExpr = (expr: string): CompiledExpr => {
		const cached = compiledExprCache.get(expr);
		if (cached !== undefined) return cached;
		const globalCached = globalCompiledExprCache.get(expr);
		if (globalCached !== undefined) {
			compiledExprCache.set(expr, globalCached);
			return globalCached;
		}
		const compiled = compileExpr(expr);
		compiledExprCache.set(expr, compiled);
		evictOldestIfNeeded(globalCompiledExprCache, COMPILED_EXPR_CACHE_CAP);
		globalCompiledExprCache.set(expr, compiled);
		return compiled;
	};
	const render: CompiledJinjaRenderer = (ctx) => {
		const scope = Object.create(null) as ExprScope;
		for (const [k, v] of Object.entries(ctx)) scope[k] = v;
		return renderNodes(ast, scope, getExpr);
	};
	return { ast, render };
}

export function buildJinjaContext(
	config: ShotputConfig,
): Record<string, unknown> {
	const context = config.context ?? {};
	const params = (config as { params?: Record<string, unknown> }).params ?? {};
	const env = typeof process !== "undefined" ? process.env : {};
	return {
		context,
		params,
		env,
		...context,
	};
}

export async function resolveTemplateIncludes(
	template: string,
	templateDir: string,
	depth = 0,
): Promise<string> {
	if (depth >= MAX_INCLUDE_DEPTH || !template.includes("include")) {
		return template;
	}

	const matches: Array<{ index: number; length: number; path: string }> = [];
	const re = new RegExp(INCLUDE_TAG_RE.source, "g");
	for (;;) {
		const match = re.exec(template);
		if (match === null) break;
		const includePath = match[1];
		if (includePath === undefined || includePath.length === 0) continue;
		matches.push({
			index: match.index,
			length: match[0].length,
			path: includePath,
		});
	}

	if (matches.length === 0) return template;

	let result = template;
	for (let i = matches.length - 1; i >= 0; i--) {
		const current = matches[i];
		if (current === undefined) continue;
		const filePath = join(templateDir, current.path);
		const included = await Bun.file(filePath).text();
		const resolved = await resolveTemplateIncludes(
			included,
			dirname(filePath),
			depth + 1,
		);
		result =
			result.slice(0, current.index) +
			resolved +
			result.slice(current.index + current.length);
	}

	return result;
}

export function getCompiledJinjaRenderer(
	template: string,
): CompiledJinjaRenderer {
	const cached = compiledTemplateCache.get(template);
	if (cached !== undefined) return cached.render;
	const compiled = compileTemplate(template);
	evictOldestIfNeeded(compiledTemplateCache, COMPILED_CACHE_CAP);
	compiledTemplateCache.set(template, compiled);
	return compiled.render;
}

export async function renderJinjaTemplate(
	template: string,
	config: ShotputConfig,
	precompiled?: CompiledJinjaRenderer,
): Promise<string> {
	const ctx = buildJinjaContext(config);
	if (precompiled !== undefined) {
		return precompiled(ctx);
	}
	const resolvedTemplate = await resolveTemplateIncludes(
		template,
		config.templateDir,
	);
	return getCompiledJinjaRenderer(resolvedTemplate)(ctx);
}
