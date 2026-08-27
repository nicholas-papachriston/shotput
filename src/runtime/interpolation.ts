/**
 * Full in-memory interpolation. Used for nested runs (from interpolationStream) and by tests.
 * Top-level pipeline uses interpolationStream + consumeStreamToString.
 */
import type { ShotputConfig } from "../config";
import { getLogger } from "../logger";
import { ParallelProcessor } from "../parallelProcessor";
import { clearStatCache } from "../template";
import { getCountFnAsync } from "../tokens";
import type { ResultMetadataEntry } from "../types";
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
	resultMetadata?: ResultMetadataEntry[];
	remainingLength: number;
}

type LiteralBox = { literals: Map<string, string> };

function applyRootLiterals(
	text: string,
	depth: number,
	literalBox: LiteralBox | undefined,
): string {
	if (depth !== 0) return text;
	if (literalBox === undefined) return text;
	if (literalBox.literals.size === 0) return text;
	return substituteLiterals(text, literalBox.literals);
}

function emptyMatchResult(
	contentAfterVariables: string,
	remainingLength: number,
	depth: number,
	literalBox: LiteralBox | undefined,
): InterpolationResults {
	return {
		processedTemplate: applyRootLiterals(
			contentAfterVariables,
			depth,
			literalBox,
		),
		remainingLength,
	};
}

function resolveLiteralBox(
	literalBox: LiteralBox | undefined,
	depth: number,
): LiteralBox | undefined {
	if (literalBox !== undefined) return literalBox;
	if (depth === 0) return { literals: new Map<string, string>() };
	return undefined;
}

async function interpolateNested(
	processedTemplate: string,
	config: ShotputConfig,
	currentMetadata: ResultMetadataEntry[],
	basePath: string,
	depth: number,
	finalRemainingLength: number,
	expandingPaths: Set<string>,
	resolvedLiteralBox: LiteralBox | undefined,
): Promise<InterpolationResults> {
	log.info(
		`Found nested templates, recursing to depth ${depth + 1}/${config.maxNestingDepth}`,
	);
	for (const entry of currentMetadata) {
		expandingPaths.add(entry.path);
	}
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
		return {
			processedTemplate: applyRootLiterals(
				nestedResults.processedTemplate,
				depth,
				resolvedLiteralBox,
			),
			resultMetadata: [
				...currentMetadata,
				...(nestedResults.resultMetadata ?? []),
			],
			remainingLength: nestedResults.remainingLength,
		};
	} finally {
		for (const entry of currentMetadata) {
			expandingPaths.delete(entry.path);
		}
	}
}

export const interpolation = async (
	content: string,
	config: ShotputConfig,
	basePath: string = process.cwd(),
	depth = 0,
	remainingLength: number = config.maxPromptLength,
	expandingPaths: Set<string> = new Set(),
	literalBox?: LiteralBox,
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
	const resolvedLiteralBox = resolveLiteralBox(literalBox, depth);

	if (matchEntries.length === 0) {
		return emptyMatchResult(
			contentAfterVariables,
			remainingLength,
			depth,
			resolvedLiteralBox,
		);
	}

	const maxDepth = config.maxNestingDepth;

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

	const processedTemplate =
		replacementsNeedRulesAndVars === false
			? processedContent
			: evaluateInterpolationContent(processedContent, effectiveConfig, depth);
	const currentMetadata = mapInterpolationMetadata(metadata);

	const usedLength = config.tokenizer
		? await getCountFnAsync(config)(processedTemplate)
		: processedTemplate.length;
	const finalRemainingLength = Math.max(0, config.maxPromptLength - usedLength);

	if (processedTemplate === contentAfterVariables) {
		return {
			processedTemplate: applyRootLiterals(
				processedTemplate.trim(),
				depth,
				resolvedLiteralBox,
			),
			resultMetadata: currentMetadata,
			remainingLength: finalRemainingLength,
		};
	}

	const moreMatches = processedTemplate.match(interpolationPattern);
	if (moreMatches && depth < maxDepth && finalRemainingLength > 0) {
		return interpolateNested(
			processedTemplate,
			config,
			currentMetadata,
			basePath,
			depth,
			finalRemainingLength,
			expandingPaths,
			resolvedLiteralBox,
		);
	}

	return {
		processedTemplate: applyRootLiterals(
			processedTemplate.trim(),
			depth,
			resolvedLiteralBox,
		),
		resultMetadata: currentMetadata,
		remainingLength: finalRemainingLength,
	};
};
