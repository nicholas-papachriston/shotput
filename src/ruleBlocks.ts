export const IF_CLOSE = "{{/if}}";
export const ELSE_MARKER = "{{else}}";
export const EACH_CLOSE = "{{/each}}";

/** New regex per call so concurrent callers do not share lastIndex. */
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
export function findNextBlock(
	content: string,
):
	| { kind: "if"; match: RegExpExecArray }
	| { kind: "each"; match: RegExpExecArray }
	| null {
	const ifRegex = createIfOpenRegex();
	const eachRegex = createEachOpenRegex();
	const ifMatch = ifRegex.exec(content);
	const eachMatch = eachRegex.exec(content);
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
