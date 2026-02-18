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
): Promise<{
	result: string;
	resultMetadata: InterpolationResultMeta[];
	finalRemainingLength: number;
}> {
	const maxDepth = config.maxNestingDepth;
	const resultMetadata: InterpolationResultMeta[] = [];
	let result = content;
	let currentRemainingLength = remainingLength;

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

	for (const match of matches) {
		const startTime = Date.now();
		const rawPath = match.slice(2, -2).trim();
		let path = resolveTemplatePath(basePath, rawPath, configToUse);

		try {
			const templateType = await findTemplateType(path, rawPath, configToUse);
			if (templateType === TemplateType.String) {
				continue;
			}
			if (templateType === TemplateType.Custom) {
				path = rawPath;
			}
			if (expandingPaths.has(path)) {
				log.warn(`Cycle detected for path: ${path}`);
				result = result.replace(match, `${CYCLE_MESSAGE_PREFIX}${path}]`);
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
						result = applied.result;
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
						currentRemainingLength = combinedRemainingCount;
						result = operationResults;
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
							result = result.replace(match, `[Error reading ${path}]`);
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
							} else {
								result = handlerResult.operationResults;
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
						continue;
					}
				}
			} finally {
				expandingPaths.delete(path);
			}
		} catch (err) {
			log.error(`Failed to read path ${path}: ${err}`);
			result = result.replace(match, `[Error reading ${path}]`);
		}
	}

	return {
		result,
		resultMetadata,
		finalRemainingLength: currentRemainingLength,
	};
}
