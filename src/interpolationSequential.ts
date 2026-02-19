import type { ShotputConfig } from "./config";
import { handleCustomSource } from "./custom";
import { getHandler } from "./handlers";
import type {
	ApplyInterpolationResult,
	InterpolationResultMeta,
} from "./interpolationApply";
import {
	type HandlerResultForApply,
	type MatchWithIndices,
	applyReplacement,
	interpolationPattern,
} from "./interpolationApply";
import { getLogger } from "./logger";
import { resolveTemplatePath } from "./pathResolve";
import { getMatchingPlugin } from "./plugins";
import { findTemplateType } from "./template";
import { TemplateType } from "./types";

const log = getLogger("interpolationSequential");

const CYCLE_MESSAGE_PREFIX = "[Cycle detected: ";
const LITERAL_PLACEHOLDER_PREFIX = "__SHOTPUT_LITERAL_";

export type RunSequentialInterpolationFn = (
	content: string,
	basePath: string,
	depth: number,
	remainingLength: number,
	expandingPaths: Set<string>,
	literalBox: { literals: Map<string, string> } | undefined,
	mergeContext: Record<string, unknown> | undefined,
) => Promise<ApplyInterpolationResult>;

export type SegmentSink = (segment: string) => void;

export async function runSequentialInterpolation(
	content: string,
	config: ShotputConfig,
	basePath: string,
	depth: number,
	remainingLength: number,
	expandingPaths: Set<string>,
	resolvedLiteralBox: { literals: Map<string, string> } | undefined,
	configToUse: ShotputConfig,
	matchEntries: MatchWithIndices[],
	interpolationFn: RunSequentialInterpolationFn,
	emit?: SegmentSink,
): Promise<{
	result: string;
	resultMetadata: InterpolationResultMeta[];
	finalRemainingLength: number;
	/** When emit was used: suffix not yet emitted; caller emits it or nested result. */
	pendingSuffix?: string;
}> {
	const maxDepth = config.maxNestingDepth;
	const resultMetadata: InterpolationResultMeta[] = [];
	let result = content;
	let currentRemainingLength = remainingLength;
	let offset = 0;
	let lastEmittedInResult = 0;

	const runInterpolationForApply = (
		cont: string,
		inclusionBase: string,
		dep: number,
		remLength: number,
		expPaths: Set<string>,
		litBox: { literals: Map<string, string> } | undefined,
		mergeContext: Record<string, unknown> | undefined,
	) =>
		interpolationFn(
			cont,
			inclusionBase,
			dep,
			remLength,
			expPaths,
			litBox,
			mergeContext,
		);

	function replaceAt(
		str: string,
		startInResult: number,
		endInResult: number,
		replacement: string,
	): string {
		return str.slice(0, startInResult) + replacement + str.slice(endInResult);
	}

	for (const { match, start, end } of matchEntries) {
		let startInResult = start + offset;
		let endInResult = end + offset;
		if (
			startInResult < 0 ||
			endInResult > result.length ||
			result.slice(startInResult, endInResult) !== match
		) {
			const idx = result.indexOf(match);
			if (idx < 0) continue;
			startInResult = idx;
			endInResult = idx + match.length;
		}

		if (emit) {
			const prefix = result.slice(lastEmittedInResult, startInResult);
			emit(prefix);
			lastEmittedInResult = startInResult;
		}

		const startTime = Date.now();
		const rawPath = match.slice(2, -2).trim();
		let path = resolveTemplatePath(basePath, rawPath, configToUse);

		try {
			const templateType = await findTemplateType(path, rawPath, configToUse);
			if (templateType === TemplateType.String) {
				if (emit) {
					emit(match);
					lastEmittedInResult = startInResult + match.length;
				}
				continue;
			}
			if (templateType === TemplateType.Custom) {
				path = rawPath;
			}
			if (expandingPaths.has(path)) {
				log.warn(`Cycle detected for path: ${path}`);
				const cycleMessage = `${CYCLE_MESSAGE_PREFIX}${path}]`;
				result = replaceAt(result, startInResult, endInResult, cycleMessage);
				offset += cycleMessage.length - match.length;
				if (emit) {
					emit(cycleMessage);
					lastEmittedInResult = startInResult + cycleMessage.length;
				}
				continue;
			}
			expandingPaths.add(path);
			try {
				switch (templateType) {
					case TemplateType.File:
					case TemplateType.Directory:
					case TemplateType.Glob:
					case TemplateType.Regex:
					case TemplateType.S3:
					case TemplateType.Http:
					case TemplateType.Skill: {
						const handler = getHandler(templateType);
						const handlerResult = await handler(
							configToUse,
							result,
							path,
							match,
							currentRemainingLength,
							basePath,
						);
						const applied = await applyReplacement(
							handlerResult as HandlerResultForApply,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
							configToUse,
							depth,
							maxDepth,
							basePath,
							expandingPaths,
							resolvedLiteralBox,
							runInterpolationForApply,
							{ start: startInResult, end: endInResult },
						);
						const replacement = applied.result.slice(
							startInResult,
							startInResult +
								(applied.result.length - result.length + match.length),
						);
						result = applied.result;
						offset += applied.result.length - result.length;
						if (emit) {
							emit(replacement);
							lastEmittedInResult = startInResult + replacement.length;
						}
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						continue;
					}
					case TemplateType.Function: {
						const handler = getHandler(templateType);
						const { operationResults, combinedRemainingCount } = await handler(
							configToUse,
							result,
							path,
							match,
							currentRemainingLength,
							basePath,
						);
						const replacement = operationResults.slice(
							startInResult,
							startInResult +
								(operationResults.length - result.length + match.length),
						);
						result = operationResults;
						offset += operationResults.length - result.length;
						if (emit) {
							emit(replacement);
							lastEmittedInResult = startInResult + replacement.length;
						}
						currentRemainingLength = combinedRemainingCount;
						resultMetadata.push({
							path,
							type: templateType,
							duration: Date.now() - startTime,
						});
						continue;
					}
					case TemplateType.Custom: {
						const plugin = getMatchingPlugin(configToUse, path);
						if (!plugin) {
							log.warn(`No custom plugin matched for path: ${path}`);
							const errMsg = `[Error reading ${path}]`;
							result = replaceAt(result, startInResult, endInResult, errMsg);
							offset += errMsg.length - match.length;
							if (emit) {
								emit(errMsg);
								lastEmittedInResult = startInResult + errMsg.length;
							}
							continue;
						}
						const handlerResult = await handleCustomSource(
							plugin,
							configToUse,
							result,
							path,
							match,
							currentRemainingLength,
							basePath,
						);
						if (
							plugin.canContainTemplates &&
							handlerResult.replacement?.match(interpolationPattern) &&
							depth < maxDepth &&
							currentRemainingLength > 0
						) {
							const applied = await applyReplacement(
								handlerResult as HandlerResultForApply,
								match,
								path,
								templateType,
								result,
								currentRemainingLength,
								startTime,
								configToUse,
								depth,
								maxDepth,
								basePath,
								expandingPaths,
								resolvedLiteralBox,
								runInterpolationForApply,
								{ start: startInResult, end: endInResult },
							);
							const replacement = applied.result.slice(
								startInResult,
								startInResult +
									(applied.result.length - result.length + match.length),
							);
							result = applied.result;
							offset += applied.result.length - result.length;
							if (emit) {
								emit(replacement);
								lastEmittedInResult = startInResult + replacement.length;
							}
							currentRemainingLength = applied.remainingLength;
							resultMetadata.push(...applied.metadata);
						} else {
							if (
								!plugin.canContainTemplates &&
								handlerResult.replacement &&
								resolvedLiteralBox
							) {
								const key = `${LITERAL_PLACEHOLDER_PREFIX}${resolvedLiteralBox.literals.size}__`;
								resolvedLiteralBox.literals.set(key, handlerResult.replacement);
								result = replaceAt(result, startInResult, endInResult, key);
								offset += key.length - match.length;
								if (emit) {
									emit(key);
									lastEmittedInResult = startInResult + key.length;
								}
							} else {
								const replacement = handlerResult.operationResults.slice(
									startInResult,
									startInResult +
										(handlerResult.operationResults.length -
											result.length +
											match.length),
								);
								result = handlerResult.operationResults;
								offset += handlerResult.operationResults.length - result.length;
								if (emit) {
									emit(replacement);
									lastEmittedInResult = startInResult + replacement.length;
								}
							}
							currentRemainingLength = handlerResult.combinedRemainingCount;
							resultMetadata.push({
								path,
								type: templateType,
								duration: Date.now() - startTime,
							});
						}
						continue;
					}
					default: {
						log.warn(
							`Unknown template type: ${templateType} for path: ${path}`,
						);
						resultMetadata.push({
							path,
							type: templateType,
							duration: Date.now() - startTime,
						});
						if (emit) {
							emit(match);
							lastEmittedInResult = startInResult + match.length;
						}
						continue;
					}
				}
			} finally {
				expandingPaths.delete(path);
			}
		} catch (err) {
			log.error(`Failed to read path ${path}: ${err}`);
			const errMsg = `[Error reading ${path}]`;
			result = replaceAt(result, startInResult, endInResult, errMsg);
			offset += errMsg.length - match.length;
			if (emit) {
				emit(errMsg);
				lastEmittedInResult = startInResult + errMsg.length;
			}
		}
	}

	const suffix =
		emit && result.length > lastEmittedInResult
			? result.slice(lastEmittedInResult)
			: undefined;

	return {
		result,
		resultMetadata,
		finalRemainingLength: currentRemainingLength,
		...(suffix !== undefined && { pendingSuffix: suffix }),
	};
}
