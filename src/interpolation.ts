import { isAbsolute, resolve } from "node:path";
import type { ShotputConfig } from "./config";
import { handleDirectory } from "./directory";
import { handleFile } from "./file";
import { handleFunction } from "./function";
import { handleGlob } from "./glob";
import { handleHttp } from "./http";
import { getLogger } from "./logger";
import { ParallelProcessor } from "./parallelProcessor";
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

const resolvePath = (basePath: string, filePath: string): string => {
	// Don't resolve paths for special template types
	if (!shouldResolvePath(filePath)) {
		return filePath;
	}
	return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
};

interface InterpolationResults {
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
): Promise<InterpolationResults> => {
	const matches = content.match(pattern);
	if (!matches) return { processedTemplate: content, remainingLength };

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
				content,
				basePath,
				remainingLength,
			);

		processedTemplate = processedContent;
		currentMetadata = metadata.map((m) => ({
			path: m.path,
			type: m.type,
			duration: m.processingTime,
		}));

		// Update finalRemainingLength based on the expansion of content
		finalRemainingLength = Math.max(
			0,
			remainingLength - (processedContent.length - content.length),
		);
	} else {
		// Fall back to sequential processing
		log.info(`Using sequential processing (depth ${depth}/${maxDepth})`);
		const resultMetadata = [];
		let result = content;
		for (const match of matches) {
			const startTime = Date.now();
			const rawPath = match.slice(2, -2).trim();
			const path = resolvePath(basePath, rawPath);

			try {
				const templateType = await findTemplateType(path, rawPath);

				switch (templateType) {
					case TemplateType.File: {
						const { operationResults, combinedRemainingCount } =
							await handleFile(
								config,
								result,
								path,
								match,
								currentRemainingLength,
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
					case TemplateType.Directory: {
						const { operationResults, combinedRemainingCount } =
							await handleDirectory(
								config,
								result,
								path,
								match,
								currentRemainingLength,
							);
						currentRemainingLength = combinedRemainingCount;
						result = operationResults;
						continue;
					}
					case TemplateType.Glob: {
						const { operationResults, combinedRemainingCount } =
							await handleGlob(
								config,
								result,
								path,
								match,
								currentRemainingLength,
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
					case TemplateType.Regex: {
						const { operationResults, combinedRemainingCount } =
							await handleGlob(
								config,
								result,
								path,
								match,
								currentRemainingLength,
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
					case TemplateType.S3: {
						const { operationResults, combinedRemainingCount } = await handleS3(
							config,
							result,
							path,
							match,
							currentRemainingLength,
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
					case TemplateType.Http: {
						const { operationResults, combinedRemainingCount } =
							await handleHttp(
								config,
								result,
								path,
								match,
								currentRemainingLength,
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
						const { operationResults, combinedRemainingCount } =
							await handleSkill(
								config,
								result,
								path,
								match,
								currentRemainingLength,
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
	if (processedTemplate === content) {
		return {
			processedTemplate: processedTemplate.trim(),
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
		const nestedResults = await interpolation(
			processedTemplate,
			config,
			basePath,
			depth + 1,
			finalRemainingLength,
		);

		return {
			processedTemplate: nestedResults.processedTemplate,
			resultMetadata: [
				...currentMetadata,
				...(nestedResults.resultMetadata ?? []),
			],
			remainingLength: nestedResults.remainingLength,
		};
	}

	return {
		processedTemplate: processedTemplate.trim(),
		resultMetadata: currentMetadata,
		remainingLength: finalRemainingLength,
	};
};
