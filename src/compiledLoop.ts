import type { ShotputConfig } from "./config";
import { ELSE_MARKER, type ParsedBlock, parseAllBlocks } from "./ruleBlocks";
import {
	type RuleContext,
	evaluateCondition,
	getArrayFromExpr,
} from "./ruleConditions";
import { getVariableValue } from "./variables";

export type LoopVarKey =
	| "item.name"
	| "item.value"
	| "index"
	| "item"
	| "first"
	| "last";

export type Segment =
	| { kind: "literal"; value: string }
	| { kind: "loopVar"; key: LoopVarKey }
	| { kind: "variable"; path: string }
	| {
			kind: "conditional";
			expr: string;
			consequent: Segment[];
			alternate: Segment[];
			engine: "js" | "safe";
	  }
	| { kind: "each"; expr: string; body: Segment[] };

/** Regex for variable/loop placeholders only (no block open/close). */
const VAR_LOOP_PLACEHOLDER =
	/\{\{\s*(context\.__loop\.(item\.name|item\.value|index|item|first|last)|context\.[^}]*|params\.[^}]*|env\.[^}]*)\s*\}\}/g;

function getTopLevelBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
	const out: ParsedBlock[] = [];
	const stack: ParsedBlock[] = [];
	for (const block of blocks) {
		while (stack.length > 0) {
			const prev = stack[stack.length - 1];
			const prevCloseEnd = prev.closeIndex + prev.closeTagLength;
			if (prevCloseEnd <= block.openStart) stack.pop();
			else break;
		}
		if (stack.length === 0) out.push(block);
		stack.push(block);
	}
	return out;
}

function parseLiteralRange(
	content: string,
	start: number,
	end: number,
): Segment[] {
	const slice = content.slice(start, end);
	const segments: Segment[] = [];
	VAR_LOOP_PLACEHOLDER.lastIndex = 0;
	let lastEnd = 0;
	let m: RegExpExecArray | null = VAR_LOOP_PLACEHOLDER.exec(slice);
	while (m !== null) {
		if (m.index > lastEnd) {
			segments.push({ kind: "literal", value: slice.slice(lastEnd, m.index) });
		}
		const inner = (m[1] ?? "").trim();
		const loopKind = m[2];
		if (loopKind !== undefined) {
			segments.push({
				kind: "loopVar",
				key: loopKind as LoopVarKey,
			});
		} else {
			segments.push({ kind: "variable", path: inner });
		}
		lastEnd = m.index + m[0].length;
		m = VAR_LOOP_PLACEHOLDER.exec(slice);
	}
	if (lastEnd < slice.length) {
		segments.push({ kind: "literal", value: slice.slice(lastEnd) });
	}
	return segments;
}

export interface CompileLoopOptions {
	engine: "js" | "safe";
	preParsedBlocks?: ParsedBlock[] | null;
}

/**
 * Compile a loop body (or any content with blocks and placeholders) into a Segment[]
 * for fast render without per-iteration regex or evaluateRules recursion.
 */
export function compileLoopBody(
	content: string,
	options: CompileLoopOptions,
): Segment[] {
	const { engine, preParsedBlocks } = options;
	const blocks = preParsedBlocks ?? parseAllBlocks(content);
	if (blocks.length === 0) {
		return parseLiteralRange(content, 0, content.length);
	}
	const topLevel = getTopLevelBlocks(blocks);
	const segments: Segment[] = [];
	let pos = 0;
	for (const block of topLevel) {
		if (pos < block.openStart) {
			segments.push(...parseLiteralRange(content, pos, block.openStart));
		}
		const blockContent = content.slice(block.openEnd, block.closeIndex);
		const blockContentBlocks = parseAllBlocks(blockContent);
		if (block.kind === "if") {
			const elseIdx = block.elseIndex;
			const consequentContent =
				elseIdx === -1 ? blockContent : blockContent.slice(0, elseIdx);
			const alternateContent =
				elseIdx === -1 ? "" : blockContent.slice(elseIdx + ELSE_MARKER.length);
			segments.push({
				kind: "conditional",
				expr: block.expr,
				consequent: compileLoopBody(consequentContent, {
					engine,
					preParsedBlocks: parseAllBlocks(consequentContent),
				}),
				alternate: compileLoopBody(alternateContent, {
					engine,
					preParsedBlocks: parseAllBlocks(alternateContent),
				}),
				engine,
			});
		} else {
			segments.push({
				kind: "each",
				expr: block.expr,
				body: compileLoopBody(blockContent, {
					engine,
					preParsedBlocks: blockContentBlocks,
				}),
			});
		}
		pos = block.closeIndex + block.closeTagLength;
	}
	if (pos < content.length) {
		segments.push(...parseLiteralRange(content, pos, content.length));
	}
	return segments;
}

export interface LoopState {
	item: unknown;
	index: number;
	first: boolean;
	last: boolean;
}

/**
 * Replace conditionals whose expr does not reference __loop with their chosen branch
 * (evaluated once). Reduces per-iteration work when conditions are loop-invariant.
 */
function hoistStaticInSegments(
	segments: Segment[],
	ctx: RuleContext,
	config: ShotputConfig,
	engine: "js" | "safe",
): Segment[] {
	const out: Segment[] = [];
	for (const seg of segments) {
		if (seg.kind === "conditional") {
			const isStatic = !seg.expr.includes("__loop");
			if (isStatic) {
				const chosen = evaluateCondition(seg.expr, ctx, seg.engine)
					? seg.consequent
					: seg.alternate;
				out.push(...hoistStaticInSegments(chosen, ctx, config, engine));
			} else {
				out.push({
					...seg,
					consequent: hoistStaticInSegments(
						seg.consequent,
						ctx,
						config,
						seg.engine,
					),
					alternate: hoistStaticInSegments(
						seg.alternate,
						ctx,
						config,
						seg.engine,
					),
				});
			}
		} else if (seg.kind === "each") {
			out.push({
				...seg,
				body: hoistStaticInSegments(seg.body, ctx, config, engine),
			});
		} else {
			out.push(seg);
		}
	}
	return out;
}

function resolveLoopVar(key: LoopVarKey, state: LoopState): string {
	const { item, index, first, last } = state;
	const itemObj =
		item != null && typeof item === "object"
			? (item as Record<string, unknown>)
			: {};
	switch (key) {
		case "item.name":
			return itemObj["name"] != null ? String(itemObj["name"]) : "";
		case "item.value":
			return itemObj["value"] != null ? String(itemObj["value"]) : "";
		case "index":
			return String(index);
		case "item":
			return item != null ? String(item) : "";
		case "first":
			return String(first);
		case "last":
			return String(last);
		default:
			return "";
	}
}

/**
 * Render compiled segments to a string. Mutates ctx.context["__loop"] during each-blocks;
 * caller can save/restore if needed.
 */
export function renderSegments(
	segments: Segment[],
	config: ShotputConfig,
	ctx: RuleContext,
	loopState?: LoopState,
): string {
	const parts: string[] = [];
	const context = ctx.context ?? {};
	const engine =
		(config as { expressionEngine?: "js" | "safe" }).expressionEngine ?? "js";
	for (const seg of segments) {
		if (seg.kind === "literal") {
			parts.push(seg.value);
		} else if (seg.kind === "loopVar") {
			parts.push(
				loopState !== undefined ? resolveLoopVar(seg.key, loopState) : "",
			);
		} else if (seg.kind === "variable") {
			parts.push(getVariableValue(seg.path, config));
		} else if (seg.kind === "conditional") {
			const chosen = evaluateCondition(seg.expr, ctx, seg.engine)
				? seg.consequent
				: seg.alternate;
			parts.push(renderSegments(chosen, config, ctx, loopState));
		} else {
			const arr = getArrayFromExpr(seg.expr, ctx);
			const chunks: string[] = [];
			const state: LoopState = {
				item: undefined,
				index: 0,
				first: false,
				last: false,
			};
			const prevLoop = context["__loop"];
			context["__loop"] = state;
			const bodyOpt = hoistStaticInSegments(seg.body, ctx, config, engine);
			try {
				for (let i = 0; i < arr.length; i++) {
					state.item = arr[i];
					state.index = i;
					state.first = i === 0;
					state.last = i === arr.length - 1;
					chunks.push(renderSegments(bodyOpt, config, ctx, state));
				}
			} finally {
				context["__loop"] = prevLoop;
			}
			parts.push(chunks.join(""));
		}
	}
	return parts.join("");
}
