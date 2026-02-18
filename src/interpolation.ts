import { dirname, isAbsolute, resolve } from "node:path";
import type { ShotputConfig } from "./config";
import { handleCustomSource } from "./custom";
import { handleDirectory } from "./directory";
import { handleFile } from "./file";
import { handleFunction } from "./function";
import { handleGlob } from "./glob";
import { getPostResolveSourceHooks, runPostResolveSourceHooks } from "./hooks";
import { handleHttp } from "./http";
import { getLogger } from "./logger";
import { ParallelProcessor } from "./parallelProcessor";
import { getMatchingPlugin } from "./plugins";
import { evaluateRules } from "./rules";
import { handleS3 } from "./s3";
import { handleSkill } from "./skill";
import { findTemplateType } from "./template";
import { TemplateType } from "./types";

const log = getLogger("interpolation");

const pattern = /\{\{([^}]+)\}\}/g;

// Prefixes that should NOT have path resolution applied
const SPECIAL_PREFIXES = [
	"skill:",
	"TemplateType.Function:",
	"http://",
	"https://",
	"s3://",
];

const shouldResolvePath = (filePath: string): boolean => {
	return !SPECIAL_PREFIXES.some((prefix) => filePath.startsWith(prefix));
};

const resolvePath = (
	basePath: string,
	filePath: string,
	config: ShotputConfig,
): string => {
	// Don't resolve paths for special template types
	if (!shouldResolvePath(filePath)) {
		return filePath;
	}
	// Custom source paths: if a plugin matches, use path as-is
	if (getMatchingPlugin(config, filePath)) {
		return filePath;
	}
	return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
};

interface InterpolationResults {
	processedTemplate: string;
	resultMetadata?: Array<{ path: string; type: string; duration: number }>;
	remainingLength: number;
}

const CYCLE_MESSAGE_PREFIX = "[Cycle detected: ";

const LITERAL_PLACEHOLDER_PREFIX = "__SHOTPUT_LITERAL_";

function substituteLiterals(
	content: string,
	literals: Map<string, string>,
): string {
	let result = content;
	for (const [key, value] of literals) {
		result = result.replaceAll(key, value);
	}
	return result;
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
	const effectiveConfig = mergeContext
		? {
				...config,
				context: { ...(config.context ?? {}), ...mergeContext },
			}
		: config;
	const contentAfterRules = evaluateRules(content, effectiveConfig);
	const matches = contentAfterRules.match(pattern);
	const resolvedLiteralBox =
		literalBox ??
		(depth === 0 ? { literals: new Map<string, string>() } : undefined);

	const configToUse = effectiveConfig;

	if (!matches) {
		const out = { processedTemplate: contentAfterRules, remainingLength };
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
	let currentRemainingLength = remainingLength;

	// Use parallel processing if enabled and content length planning is on
	if (config.enableContentLengthPlanning && config.maxConcurrency > 1) {
		log.info(
			`Using parallel processing (depth ${depth}/${maxDepth}) with content length planning`,
		);
		const processor = new ParallelProcessor(config);
		const { content: processedContent, metadata } =
			await processor.processTemplatesWithPlanning(
				contentAfterRules,
				basePath,
				remainingLength,
				undefined,
				expandingPaths,
			);

		processedTemplate = evaluateRules(processedContent, config);
		currentMetadata = metadata.map((m) => ({
			path: m.path,
			type: m.type,
			duration: m.processingTime,
		}));

		// Remaining budget = characters left until maxPromptLength
		finalRemainingLength = Math.max(
			0,
			config.maxPromptLength - processedTemplate.length,
		);
	} else {
		// Fall back to sequential processing
		log.info(`Using sequential processing (depth ${depth}/${maxDepth})`);
		const resultMetadata: Array<{
			path: string;
			type: string;
			duration: number;
		}> = [];
		let result = contentAfterRules;

		const inclusionBasePathFor = (type: TemplateType, p: string): string => {
			if (
				type === TemplateType.File ||
				type === TemplateType.Glob ||
				type === TemplateType.Regex
			) {
				return dirname(p);
			}
			if (type === TemplateType.Directory) return p;
			return basePath;
		};

		const applyReplacement = async (
			handlerResult: {
				operationResults: string;
				combinedRemainingCount: number;
				replacement?: string;
				mergeContext?: Record<string, unknown>;
			},
			m: string,
			p: string,
			templateType: TemplateType,
			currentResult: string,
			remLength: number,
			start: number,
		) => {
			const entry = {
				path: p,
				type: templateType,
				duration: Date.now() - start,
			};
			let replacement = handlerResult.replacement;
			let effectiveHandlerResult = handlerResult;
			const postSourceHooks = getPostResolveSourceHooks(configToUse);
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
					operationResults: currentResult.replace(m, replacement),
				};
			}
			const afterRules = replacement
				? evaluateRules(replacement, configToUse)
				: "";
			if (afterRules.match(pattern) && depth < maxDepth && remLength > 0) {
				const inclusionBase = inclusionBasePathFor(templateType, p);
				const nestedExpanding = new Set(expandingPaths);
				nestedExpanding.add(p);
				const nested = await interpolation(
					afterRules,
					configToUse,
					inclusionBase,
					depth + 1,
					remLength,
					nestedExpanding,
					resolvedLiteralBox,
					handlerResult.mergeContext,
				);
				return {
					result: currentResult.replace(m, nested.processedTemplate),
					remainingLength: nested.remainingLength,
					metadata: [entry, ...(nested.resultMetadata ?? [])],
				};
			}
			const finalContent =
				afterRules.length > 0 ? afterRules : (replacement ?? "");
			const resultStr =
				replacement != null
					? currentResult.replace(m, finalContent)
					: effectiveHandlerResult.operationResults;
			return {
				result: resultStr,
				remainingLength: effectiveHandlerResult.combinedRemainingCount,
				metadata: [entry],
			};
		};

		for (const match of matches) {
			const startTime = Date.now();
			const rawPath = match.slice(2, -2).trim();
			let path = resolvePath(basePath, rawPath, configToUse);

			if (expandingPaths.has(path)) {
				log.warn(`Cycle detected for path: ${path}`);
				result = result.replace(match, `${CYCLE_MESSAGE_PREFIX}${path}]`);
				continue;
			}

			expandingPaths.add(path);
			try {
				const templateType = await findTemplateType(path, rawPath, configToUse);
				if (templateType === TemplateType.Custom) {
					path = rawPath;
				}

				switch (templateType) {
					case TemplateType.File: {
						const handlerResult = await handleFile(
							config,
							result,
							path,
							match,
							currentRemainingLength,
						);
						const applied = await applyReplacement(
							handlerResult,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
						);
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						continue;
					}
					case TemplateType.Directory: {
						const handlerResult = await handleDirectory(
							config,
							result,
							path,
							match,
							currentRemainingLength,
						);
						const applied = await applyReplacement(
							handlerResult,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
						);
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						continue;
					}
					case TemplateType.Glob: {
						const handlerResult = await handleGlob(
							config,
							result,
							path,
							match,
							currentRemainingLength,
						);
						const applied = await applyReplacement(
							handlerResult,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
						);
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						continue;
					}
					case TemplateType.Regex: {
						const handlerResult = await handleGlob(
							config,
							result,
							path,
							match,
							currentRemainingLength,
						);
						const applied = await applyReplacement(
							handlerResult,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
						);
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						continue;
					}
					case TemplateType.S3: {
						const handlerResult = await handleS3(
							config,
							result,
							path,
							match,
							currentRemainingLength,
						);
						const applied = await applyReplacement(
							handlerResult,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
						);
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						continue;
					}
					case TemplateType.Http: {
						const handlerResult = await handleHttp(
							config,
							result,
							path,
							match,
							currentRemainingLength,
						);
						const applied = await applyReplacement(
							handlerResult,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
						);
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
						continue;
					}
					case TemplateType.Function: {
						const { operationResults, combinedRemainingCount } =
							await handleFunction(
								config,
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
					case TemplateType.Skill: {
						const handlerResult = await handleSkill(
							config,
							result,
							path,
							match,
							currentRemainingLength,
						);
						const applied = await applyReplacement(
							handlerResult,
							match,
							path,
							templateType,
							result,
							currentRemainingLength,
							startTime,
						);
						result = applied.result;
						currentRemainingLength = applied.remainingLength;
						resultMetadata.push(...applied.metadata);
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
							handlerResult.replacement?.match(pattern) &&
							depth < maxDepth &&
							currentRemainingLength > 0
						) {
							const applied = await applyReplacement(
								handlerResult,
								match,
								path,
								templateType,
								result,
								currentRemainingLength,
								startTime,
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
			} catch (err) {
				log.error(`Failed to read path ${path}: ${err}`);
				result = result.replace(match, `[Error reading ${path}]`);
			}
		}

		processedTemplate = result;
		currentMetadata = resultMetadata;
		finalRemainingLength = currentRemainingLength;
	}

	// Optimization: if nothing changed in this pass, skip recursion
	if (processedTemplate === contentAfterRules) {
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

	// Check if there are more templates to process and we haven't reached max depth
	const moreMatches = processedTemplate.match(pattern);
	if (moreMatches && depth < maxDepth && finalRemainingLength > 0) {
		log.info(
			`Found nested templates, recursing to depth ${depth + 1}/${maxDepth}`,
		);
		const nestedExpanding = new Set(expandingPaths);
		for (const m of currentMetadata) {
			nestedExpanding.add(m.path);
		}
		const nestedResults = await interpolation(
			processedTemplate,
			config,
			basePath,
			depth + 1,
			finalRemainingLength,
			nestedExpanding,
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
