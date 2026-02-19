import { dirname } from "node:path";
import type { ShotputConfig } from "./config";
import { getPostResolveSourceHooks, runPostResolveSourceHooks } from "./hooks";
import { evaluateRules } from "./rules";
import { TemplateType } from "./types";

export const interpolationPattern = /\{\{([^}]+)\}\}/g;

export interface MatchWithIndices {
	match: string;
	start: number;
	end: number;
}

/** One pass over content to get all {{...}} matches with start/end. Avoids repeated indexOf in hot path. */
export function getInterpolationMatchesWithIndices(
	content: string,
): MatchWithIndices[] {
	const re = new RegExp(interpolationPattern.source, "g");
	const out: MatchWithIndices[] = [];
	for (;;) {
		const e = re.exec(content);
		if (e === null) break;
		out.push({
			match: e[0],
			start: e.index,
			end: e.index + e[0].length,
		});
	}
	return out;
}

export type InterpolationResultMeta = {
	path: string;
	type: string;
	duration: number;
};

export interface ApplyInterpolationResult {
	processedTemplate: string;
	remainingLength: number;
	resultMetadata?: InterpolationResultMeta[];
}

export function inclusionBasePathFor(
	type: TemplateType,
	p: string,
	basePath: string,
): string {
	if (
		type === TemplateType.File ||
		type === TemplateType.Glob ||
		type === TemplateType.Regex
	) {
		return dirname(p);
	}
	if (type === TemplateType.Format) {
		const colon = p.indexOf(":");
		const filePath = colon >= 0 ? p.slice(colon + 1) : p;
		return dirname(filePath);
	}
	if (type === TemplateType.Directory) return p;
	return basePath;
}

export interface HandlerResultForApply {
	operationResults: string;
	combinedRemainingCount: number;
	replacement?: string;
	mergeContext?: Record<string, unknown>;
}

function replaceAt(
	str: string,
	start: number,
	end: number,
	replacement: string,
): string {
	return str.slice(0, start) + replacement + str.slice(end);
}

export async function applyReplacement(
	handlerResult: HandlerResultForApply,
	m: string,
	p: string,
	templateType: TemplateType,
	currentResult: string,
	remLength: number,
	start: number,
	config: ShotputConfig,
	depth: number,
	maxDepth: number,
	basePath: string,
	expandingPaths: Set<string>,
	resolvedLiteralBox: { literals: Map<string, string> } | undefined,
	runInterpolation: (
		content: string,
		inclusionBase: string,
		depth: number,
		remLength: number,
		expandingPaths: Set<string>,
		literalBox: { literals: Map<string, string> } | undefined,
		mergeContext: Record<string, unknown> | undefined,
	) => Promise<ApplyInterpolationResult>,
	matchIndices?: { start: number; end: number },
): Promise<{
	result: string;
	remainingLength: number;
	metadata: InterpolationResultMeta[];
}> {
	const entry: InterpolationResultMeta = {
		path: p,
		type: templateType,
		duration: Date.now() - start,
	};
	const doReplace = (content: string, repl: string) =>
		matchIndices != null
			? replaceAt(content, matchIndices.start, matchIndices.end, repl)
			: content.replace(m, repl);
	let replacement = handlerResult.replacement;
	let effectiveHandlerResult = handlerResult;
	const postSourceHooks = getPostResolveSourceHooks(config);
	if (postSourceHooks.length > 0 && replacement != null) {
		const sourceResult = {
			type: templateType,
			path: p,
			content: replacement,
			remainingLength: remLength,
			metadata: {
				type: templateType,
				path: p,
				length: replacement.length,
				truncated: false,
				processingTime: Date.now() - start,
			},
		};
		const afterHook = await runPostResolveSourceHooks(
			sourceResult,
			postSourceHooks,
		);
		replacement = afterHook.content;
		effectiveHandlerResult = {
			...handlerResult,
			replacement,
			operationResults: doReplace(currentResult, replacement),
		};
	}
	const afterRules = replacement ? evaluateRules(replacement, config) : "";
	if (
		afterRules.match(interpolationPattern) &&
		depth < maxDepth &&
		remLength > 0
	) {
		const inclusionBase = inclusionBasePathFor(templateType, p, basePath);
		const nested = await runInterpolation(
			afterRules,
			inclusionBase,
			depth + 1,
			remLength,
			expandingPaths,
			resolvedLiteralBox ?? undefined,
			handlerResult.mergeContext,
		);
		return {
			result: doReplace(currentResult, nested.processedTemplate),
			remainingLength: nested.remainingLength,
			metadata: [entry, ...(nested.resultMetadata ?? [])],
		};
	}
	const finalContent = afterRules.length > 0 ? afterRules : (replacement ?? "");
	const resultStr =
		replacement != null
			? doReplace(currentResult, finalContent)
			: effectiveHandlerResult.operationResults;
	return {
		result: resultStr,
		remainingLength: effectiveHandlerResult.combinedRemainingCount,
		metadata: [entry],
	};
}
