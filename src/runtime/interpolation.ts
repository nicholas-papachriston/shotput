/**
 * Full in-memory interpolation. Used for nested runs (from interpolationStream) and by tests.
 * Top-level pipeline uses interpolationStream + consumeStreamToString.
 */
import type { ShotputConfig } from "../config";
import { getLogger } from "../logger";
import { ParallelProcessor } from "../parallelProcessor";
import { clearStatCache } from "../template";
import { getCountFnAsync } from "../tokens";
import {
	getInterpolationMatchesWithIndices,
	interpolationPattern,
} from "./interpolationApply";
import {
	createEffectiveConfig,
	evaluateInterpolationContent,
	mapInterpolationMetadata,
	resolveNestedInclusionBase,
} from "./interpolationCore";

const log = getLogger("interpolation");

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const SUBSTITUTE_LITERALS_REGEX_CACHE_CAP = 10_000;

/** Cache compiled regex for substituteLiterals keyed by sorted keys (same keys => reuse regex). */
const substituteLiteralsRegexCache = new Map<string, RegExp>();

function substituteLiterals(
	content: string,
	literals: Map<string, string>,
): string {
	if (literals.size === 0) return content;
	const keys = [...literals.keys()].sort((a, b) => b.length - a.length);
	const cacheKey = JSON.stringify(keys);
	let regex = substituteLiteralsRegexCache.get(cacheKey);
	if (!regex) {
		if (
			substituteLiteralsRegexCache.size >= SUBSTITUTE_LITERALS_REGEX_CACHE_CAP
		) {
			const oldestKey = substituteLiteralsRegexCache.keys().next().value;
			if (oldestKey !== undefined) {
				substituteLiteralsRegexCache.delete(oldestKey);
			}
		}
		const escaped = keys.map((k) => k.replace(REGEX_ESCAPE, "\\$&"));
		regex = new RegExp(escaped.join("|"), "g");
		substituteLiteralsRegexCache.set(cacheKey, regex);
	}
	return content.replace(regex, (match) => literals.get(match) ?? match);
}

export interface InterpolationResults {
	processedTemplate: string;
	resultMetadata?: Array<{ path: string; type: string; duration: number }>;
	remainingLength: number;
}

export const interpolation = async (
	content: string,
	config: ShotputConfig,
	basePath: string = process.cwd(),
	depth = 0,
	remainingLength: number = config.maxPromptLength,
	expandingPaths: Set<string> = new Set(),
	literalBox?: { literals: Map<string, string> },
	mergeContext?: Record<string, unknown>,
): Promise<InterpolationResults> => {
	if (depth === 0) {
		clearStatCache();
	}
	const effectiveConfig = createEffectiveConfig(config, mergeContext);
	const contentAfterVariables = evaluateInterpolationContent(
		content,
		effectiveConfig,
		depth,
	);
	const matchEntries = getInterpolationMatchesWithIndices(
		contentAfterVariables,
	);
	const resolvedLiteralBox =
		literalBox ??
		(depth === 0 ? { literals: new Map<string, string>() } : undefined);

	if (matchEntries.length === 0) {
		const out = { processedTemplate: contentAfterVariables, remainingLength };
		if (depth === 0 && resolvedLiteralBox?.literals.size) {
			out.processedTemplate = substituteLiterals(
				contentAfterVariables,
				resolvedLiteralBox.literals,
			);
		}
		return out;
	}

	const maxDepth = config.maxNestingDepth;

	let processedTemplate: string;
	let currentMetadata: Array<{ path: string; type: string; duration: number }> =
		[];
	let finalRemainingLength = remainingLength;

	log.info(`Processing (depth ${depth}/${maxDepth})`);
	const processor = new ParallelProcessor(config);
	const {
		content: processedContent,
		metadata,
		replacementsNeedRulesAndVars,
	} = await processor.processTemplatesWithPlanning(
		contentAfterVariables,
		basePath,
		remainingLength,
		undefined,
		expandingPaths,
		undefined,
		resolvedLiteralBox,
	);

	processedTemplate =
		replacementsNeedRulesAndVars === false
			? processedContent
			: evaluateInterpolationContent(processedContent, effectiveConfig, depth);
	currentMetadata = mapInterpolationMetadata(metadata);

	const usedLength = config.tokenizer
		? await getCountFnAsync(config)(processedTemplate)
		: processedTemplate.length;
	finalRemainingLength = Math.max(0, config.maxPromptLength - usedLength);

	if (processedTemplate === contentAfterVariables) {
		let out = processedTemplate.trim();
		if (depth === 0 && resolvedLiteralBox?.literals.size) {
			out = substituteLiterals(out, resolvedLiteralBox.literals);
		}
		return {
			processedTemplate: out,
			resultMetadata: currentMetadata,
			remainingLength: finalRemainingLength,
		};
	}

	const moreMatches = processedTemplate.match(interpolationPattern);
	if (moreMatches && depth < maxDepth && finalRemainingLength > 0) {
		log.info(
			`Found nested templates, recursing to depth ${depth + 1}/${maxDepth}`,
		);
		for (const m of currentMetadata) {
			expandingPaths.add(m.path);
		}
		// Use inclusion base only when nested paths are file-relative (./x, ../x, bare).
		// Project-relative paths (e.g. test/fixtures/x) use basePath (cwd).
		const inclusionBase = resolveNestedInclusionBase(
			processedTemplate,
			currentMetadata,
			basePath,
		);
		try {
			const nestedResults = await interpolation(
				processedTemplate,
				config,
				inclusionBase,
				depth + 1,
				finalRemainingLength,
				expandingPaths,
				resolvedLiteralBox,
			);

			let out = nestedResults.processedTemplate;
			if (depth === 0 && resolvedLiteralBox?.literals.size) {
				out = substituteLiterals(out, resolvedLiteralBox.literals);
			}
			return {
				processedTemplate: out,
				resultMetadata: [
					...currentMetadata,
					...(nestedResults.resultMetadata ?? []),
				],
				remainingLength: nestedResults.remainingLength,
			};
		} finally {
			for (const m of currentMetadata) {
				expandingPaths.delete(m.path);
			}
		}
	}

	let out = processedTemplate.trim();
	if (depth === 0 && resolvedLiteralBox?.literals.size) {
		out = substituteLiterals(out, resolvedLiteralBox.literals);
	}
	return {
		processedTemplate: out,
		resultMetadata: currentMetadata,
		remainingLength: finalRemainingLength,
	};
};
