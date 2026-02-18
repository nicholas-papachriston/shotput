import type { ShotputConfig } from "./config";
import { handleCustomSource } from "./custom";
import { getHandler } from "./handlers";
import type {
	ApplyInterpolationResult,
	InterpolationResultMeta,
} from "./interpolationApply";
import {
	type HandlerResultForApply,
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
	matches: RegExpMatchArray,
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
	let lastEnd = 0;

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

	let totalEmittedLength = 0;
	let lastEndInResult = 0;

	for (const match of matches) {
		const matchIndex = content.indexOf(match, lastEnd);
		if (matchIndex < 0) continue;
		const matchIndexInResult = result.indexOf(match, lastEndInResult);
		if (matchIndexInResult < 0) continue;

		if (emit) {
			const prefix = content.slice(lastEnd, matchIndex);
			emit(prefix);
			totalEmittedLength += prefix.length;
		}

		const startTime = Date.now();
		const rawPath = match.slice(2, -2).trim();
		let path = resolveTemplatePath(basePath, rawPath, configToUse);

		try {
			const templateType = await findTemplateType(path, rawPath, configToUse);
			if (templateType === TemplateType.String) {
				if (emit) {
					emit(match);
					totalEmittedLength += match.length;
				}
				lastEndInResult = matchIndexInResult + match.length;
				lastEnd = matchIndex + match.length;
				continue;
			}
			if (templateType === TemplateType.Custom) {
				path = rawPath;
			}
			if (expandingPaths.has(path)) {
				log.warn(`Cycle detected for path: ${path}`);
				const cycleMessage = `${CYCLE_MESSAGE_PREFIX}${path}]`;
				result = result.replace(match, cycleMessage);
				if (emit) {
					emit(cycleMessage);
					totalEmittedLength += cycleMessage.length;
					lastEndInResult = matchIndexInResult + cycleMessage.length;
				} else {
					lastEndInResult = matchIndexInResult + match.length;
				}
				lastEnd = matchIndex + match.length;
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
						);
						if (emit) {
							const replLen =
								applied.result.length - result.length + match.length;
							const replacement = applied.result.slice(
								matchIndexInResult,
								matchIndexInResult + replLen,
							);
							emit(replacement);
							totalEmittedLength += replacement.length;
							lastEndInResult = matchIndexInResult + replLen;
						} else {
							lastEndInResult = matchIndexInResult + match.length;
						}
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						lastEnd = matchIndex + match.length;
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
						if (emit) {
							const replLen =
								operationResults.length - result.length + match.length;
							const replacement = operationResults.slice(
								matchIndexInResult,
								matchIndexInResult + replLen,
							);
							emit(replacement);
							totalEmittedLength += replacement.length;
							lastEndInResult = matchIndexInResult + replLen;
						} else {
							lastEndInResult = matchIndexInResult + match.length;
						}
						currentRemainingLength = combinedRemainingCount;
						result = operationResults;
						resultMetadata.push({
							path,
							type: templateType,
							duration: Date.now() - startTime,
						});
						lastEnd = matchIndex + match.length;
						continue;
					}
					case TemplateType.Custom: {
						const plugin = getMatchingPlugin(configToUse, path);
						if (!plugin) {
							log.warn(`No custom plugin matched for path: ${path}`);
							const errMsg = `[Error reading ${path}]`;
							result = result.replace(match, errMsg);
							if (emit) {
								emit(errMsg);
								totalEmittedLength += errMsg.length;
								lastEndInResult = matchIndexInResult + errMsg.length;
							} else {
								lastEndInResult = matchIndexInResult + match.length;
							}
							lastEnd = matchIndex + match.length;
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
							);
							if (emit) {
								const replLen =
									applied.result.length - result.length + match.length;
								const replacement = applied.result.slice(
									matchIndexInResult,
									matchIndexInResult + replLen,
								);
								emit(replacement);
								totalEmittedLength += replacement.length;
								lastEndInResult = matchIndexInResult + replLen;
							} else {
								lastEndInResult = matchIndexInResult + match.length;
							}
							result = applied.result;
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
								result = result.replace(match, key);
								if (emit) {
									emit(key);
									totalEmittedLength += key.length;
									lastEndInResult = matchIndexInResult + key.length;
								} else {
									lastEndInResult = matchIndexInResult + match.length;
								}
							} else {
								if (emit) {
									const replLen =
										handlerResult.operationResults.length -
										result.length +
										match.length;
									const replacement = handlerResult.operationResults.slice(
										matchIndexInResult,
										matchIndexInResult + replLen,
									);
									emit(replacement);
									totalEmittedLength += replacement.length;
									lastEndInResult = matchIndexInResult + replLen;
								} else {
									lastEndInResult = matchIndexInResult + match.length;
								}
								result = handlerResult.operationResults;
							}
							currentRemainingLength = handlerResult.combinedRemainingCount;
							resultMetadata.push({
								path,
								type: templateType,
								duration: Date.now() - startTime,
							});
						}
						lastEnd = matchIndex + match.length;
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
							totalEmittedLength += match.length;
						}
						lastEndInResult = matchIndexInResult + match.length;
						lastEnd = matchIndex + match.length;
						continue;
					}
				}
			} finally {
				expandingPaths.delete(path);
			}
		} catch (err) {
			log.error(`Failed to read path ${path}: ${err}`);
			const errMsg = `[Error reading ${path}]`;
			result = result.replace(match, errMsg);
			if (emit) {
				emit(errMsg);
				totalEmittedLength += errMsg.length;
				lastEndInResult = matchIndexInResult + errMsg.length;
			} else {
				lastEndInResult = matchIndexInResult + match.length;
			}
			lastEnd = matchIndex + match.length;
		}
	}

	const suffix =
		emit && result.length > totalEmittedLength
			? result.slice(totalEmittedLength)
			: undefined;

	return {
		result,
		resultMetadata,
		finalRemainingLength: currentRemainingLength,
		...(suffix !== undefined && { pendingSuffix: suffix }),
	};
}
