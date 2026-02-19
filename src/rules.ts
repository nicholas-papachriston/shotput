import type { ShotputConfig } from "./config";
import { ELSE_MARKER, type ParsedBlock, parseAllBlocks } from "./ruleBlocks";
import {
	type RuleContext,
	evaluateCondition,
	getArrayFromExpr,
} from "./ruleConditions";
import { substituteLoopVariables } from "./variables";

export type { RuleContext } from "./ruleConditions";

const topLevelBlocksCache = new WeakMap<ParsedBlock[], ParsedBlock[]>();

/** O(n) top-level blocks: not contained by any outer block with closeEnd > openStart. */
function getTopLevelBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
	const cached = topLevelBlocksCache.get(blocks);
	if (cached !== undefined) return cached;
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
	topLevelBlocksCache.set(blocks, out);
	return out;
}

/**
 * Evaluate {{#if condition}}...{{else}}...{{/if}} and {{#each expr}}...{{/each}} blocks.
 * For each, exposes context.__loop = { item, index } so rules and variable substitution can read them.
 * Builds output via segments + single join; processes top-level blocks in O(n).
 * When recursing with identical blockContent, pass preParsedBlocks to avoid repeated parse cache lookups.
 */
export function evaluateRules(
	content: string,
	config: ShotputConfig,
	preParsedBlocks?: ParsedBlock[] | null,
): string {
	if (!content.includes("{{#")) return content;

	const context = config.context ?? {};
	const env = typeof process !== "undefined" ? process.env : {};
	const params = (config as { params?: Record<string, unknown> }).params;
	const engine = config.expressionEngine ?? "js";
	const ctx: RuleContext = { context, env, params };

	const blocks = preParsedBlocks ?? parseAllBlocks(content);
	if (blocks.length === 0) {
		// No blocks; caller handles variable substitution via substituteLoopVariables
		return content;
	}

	const topLevelBlocks = getTopLevelBlocks(blocks);
	const segments: string[] = [];
	let pos = 0;

	for (const block of topLevelBlocks) {
		const blockContent = content.slice(block.openEnd, block.closeIndex);

		segments.push(content.slice(pos, block.openStart));

		if (block.kind === "if") {
			const elseIdx = block.elseIndex;
			const consequent =
				elseIdx === -1 ? blockContent : blockContent.slice(0, elseIdx);
			const alternate =
				elseIdx === -1 ? "" : blockContent.slice(elseIdx + ELSE_MARKER.length);
			const chosen = evaluateCondition(block.expr, ctx, engine)
				? consequent
				: alternate;
			const evaluatedChosen = evaluateRules(chosen, config, undefined);
			segments.push(evaluatedChosen);
		} else {
			const arr = getArrayFromExpr(block.expr, ctx);
			const chunks: string[] = [];
			const loopState: {
				item: unknown;
				index: number;
				first: boolean;
				last: boolean;
			} = {
				item: undefined,
				index: 0,
				first: false,
				last: false,
			};
			const loopContext = Object.create(context) as Record<string, unknown>;
			loopContext["__loop"] = loopState;
			const loopConfig = Object.create(config) as ShotputConfig;
			loopConfig.context = loopContext;
			const blockContentBlocks = parseAllBlocks(blockContent);
			for (let i = 0; i < arr.length; i++) {
				loopState.item = arr[i];
				loopState.index = i;
				loopState.first = i === 0;
				loopState.last = i === arr.length - 1;
				const evaluated = evaluateRules(
					blockContent,
					loopConfig,
					blockContentBlocks,
				);
				const substituted = substituteLoopVariables(
					evaluated,
					arr[i],
					i,
					loopConfig,
				);
				chunks.push(substituted);
			}
			segments.push(chunks.join(""));
		}

		pos = block.closeIndex + block.closeTagLength;
	}

	segments.push(content.slice(pos));
	return segments.join("");
}
