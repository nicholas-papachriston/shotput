/**
 * Full in-memory interpolation. Used for nested runs (from interpolationStream) and by tests.
 * Top-level pipeline uses interpolationStream + consumeStreamToString.
 */
import type { ShotputConfig } from "./config";
import {
	getInterpolationMatchesWithIndices,
	inclusionBasePathFor,
	interpolationPattern,
} from "./interpolationApply";
import { getLogger } from "./logger";
import { ParallelProcessor } from "./parallelProcessor";
import { evaluateRules } from "./rules";
import { clearStatCache } from "./template";
import { getCountFnAsync } from "./tokens";
import type { TemplateType } from "./types";
import { substituteVariables } from "./variables";

const log = getLogger("interpolation");

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

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
	const effectiveConfig = mergeContext
		? {
				...config,
				context: { ...(config.context ?? {}), ...mergeContext },
			}
		: config;
	const contentAfterRules = evaluateRules(content, effectiveConfig);
	const contentAfterVariables = substituteVariables(
		contentAfterRules,
		effectiveConfig,
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
				content,
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
			: substituteVariables(
					evaluateRules(processedContent, effectiveConfig),
					effectiveConfig,
				);
	currentMetadata = metadata.map((m) => ({
		path: m.path,
		type: m.type,
		duration: m.processingTime,
	}));

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
		const firstFull = moreMatches[0];
		const innerPath =
			typeof firstFull === "string" ? firstFull.slice(2, -2).trim() : "";
		const pathIsFileRelative =
			innerPath.startsWith("./") ||
			innerPath.startsWith("../") ||
			!innerPath.includes("/");
		const inclusionBase =
			currentMetadata.length === 1 && pathIsFileRelative
				? inclusionBasePathFor(
						currentMetadata[0].type as TemplateType,
						currentMetadata[0].path,
						basePath,
					)
				: basePath;
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
