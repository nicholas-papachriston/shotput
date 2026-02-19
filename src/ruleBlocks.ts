export const IF_CLOSE = "{{/if}}";
export const ELSE_MARKER = "{{else}}";
export const EACH_CLOSE = "{{/each}}";

/** Single combined regex for if/each - one exec() instead of two, no allocation per call. */
const BLOCK_OPEN_REGEX = /\{\{#(if|each)\s+(.+?)\}\}/g;

/** New regex per call for backwards compatibility; prefer findNextBlock. */
export const createIfOpenRegex = () => /\{\{#if\s+(.+?)\}\}/g;
export const createEachOpenRegex = () => /\{\{#each\s+(.+?)\}\}/g;

/**
 * Find the matching {{/if}} for the {{#if}} at startIndex, accounting for nested blocks.
 */
export function findMatchingClose(content: string, startIndex: number): number {
	let depth = 1;
	let pos = startIndex;
	while (depth > 0) {
		const nextOpen = content.indexOf("{{#if", pos);
		const nextClose = content.indexOf(IF_CLOSE, pos);
		if (nextClose === -1) return -1;
		if (nextOpen !== -1 && nextOpen < nextClose) {
			depth++;
			pos = nextOpen + 1;
		} else {
			depth--;
			if (depth === 0) return nextClose;
			pos = nextClose + IF_CLOSE.length;
		}
	}
	return -1;
}

/**
 * Find the matching {{/each}} for the {{#each}} at startIndex, accounting for nested {{#each}}.
 */
export function findMatchingEachClose(
	content: string,
	startIndex: number,
): number {
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
export function findElseAtDepth(blockContent: string): number {
	if (!blockContent.includes(ELSE_MARKER)) return -1;
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

export interface ParsedBlock {
	kind: "if" | "each";
	expr: string;
	openStart: number;
	openEnd: number;
	closeIndex: number;
	closeTagLength: number;
	elseIndex: number;
}

const PARSE_CACHE_CAP = 100;
const parseCache = new Map<string, ParsedBlock[]>();

function parseAllBlocksUncached(content: string): ParsedBlock[] {
	const blocks: ParsedBlock[] = [];
	BLOCK_OPEN_REGEX.lastIndex = 0;
	let m: RegExpExecArray | null = BLOCK_OPEN_REGEX.exec(content);
	while (m !== null) {
		const kind = m[1] as "if" | "each";
		const expr = (m[2] ?? "").trim();
		const openStart = m.index;
		const openEnd = m.index + m[0].length;
		const closeTag = kind === "if" ? IF_CLOSE : EACH_CLOSE;
		const closeTagLength = closeTag.length;
		const findClose = kind === "if" ? findMatchingClose : findMatchingEachClose;
		const closeIndex = findClose(content, openEnd);
		if (closeIndex === -1) break;
		const blockContent = content.slice(openEnd, closeIndex);
		const elseIndex = kind === "if" ? findElseAtDepth(blockContent) : -1;
		blocks.push({
			kind,
			expr,
			openStart,
			openEnd,
			closeIndex,
			closeTagLength,
			elseIndex,
		});
		m = BLOCK_OPEN_REGEX.exec(content);
	}
	return blocks;
}

/**
 * Parse all {{#if}} and {{#each}} blocks in one pass. Returns blocks in document order.
 * Results are cached by template string (FIFO, cap 100) for repeated renders.
 */
export function parseAllBlocks(content: string): ParsedBlock[] {
	let cached = parseCache.get(content);
	if (cached !== undefined) return cached;
	cached = parseAllBlocksUncached(content);
	if (parseCache.size >= PARSE_CACHE_CAP) {
		const firstKey = parseCache.keys().next().value;
		if (firstKey !== undefined) parseCache.delete(firstKey);
	}
	parseCache.set(content, cached);
	return cached;
}

/**
 * Find the next {{#if}} or {{#each}} in content and return which one and its match.
 * Uses single combined regex to avoid two exec() passes and RegExp allocations.
 */
export function findNextBlock(
	content: string,
):
	| { kind: "if"; match: RegExpExecArray }
	| { kind: "each"; match: RegExpExecArray }
	| null {
	BLOCK_OPEN_REGEX.lastIndex = 0;
	const m = BLOCK_OPEN_REGEX.exec(content);
	if (!m) return null;
	const kind = m[1] as "if" | "each";
	const expr = m[2] ?? "";
	// match[1] must be the expression for rules.ts compatibility
	const fakeExecArray = [m[0], expr] as unknown as RegExpExecArray;
	(fakeExecArray as { index: number; input: string }).index = m.index;
	(fakeExecArray as { index: number; input: string }).input = content;
	return { kind, match: fakeExecArray };
}
