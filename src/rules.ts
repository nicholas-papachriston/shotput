import type { ShotputConfig } from "./config";
import { getLogger } from "./logger";
import {
	EACH_CLOSE,
	ELSE_MARKER,
	IF_CLOSE,
	findElseAtDepth,
	findMatchingClose,
	findMatchingEachClose,
	findNextBlock,
} from "./ruleBlocks";
import {
	type RuleContext,
	evaluateCondition,
	getArrayFromExpr,
} from "./ruleConditions";
import { substituteVariables } from "./variables";

const log = getLogger("rules");

export type { RuleContext } from "./ruleConditions";

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
			const consequent =
				elseIndex === -1 ? blockContent : blockContent.slice(0, elseIndex);
			const alternate =
				elseIndex === -1
					? ""
					: blockContent.slice(elseIndex + ELSE_MARKER.length);
			const chosen = evaluateCondition(expr, ctx, engine)
				? consequent
				: alternate;
			const ifSegments = [
				result.slice(0, openStart),
				chosen,
				result.slice(closeIndex + IF_CLOSE.length),
			];
			result = ifSegments.join("");
			continue;
		}

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
		const eachSegments = [
			result.slice(0, openStart),
			chunks.join(""),
			result.slice(closeIndex + EACH_CLOSE.length),
		];
		result = eachSegments.join("");
	}
	return result;
}
