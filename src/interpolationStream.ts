import type { ShotputConfig } from "./config";
import { interpolation } from "./interpolation";
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
import type { ShotputOutput } from "./types";
import type { TemplateType } from "./types";
import { substituteVariables } from "./variables";

const log = getLogger("interpolationStream");

export interface InterpolationStreamResult {
	stream: ReadableStream<string>;
	metadata: Promise<ShotputOutput["metadata"]>;
	literalMap?: Map<string, string>;
	literalMapPromise?: Promise<Map<string, string> | undefined>;
}

/**
 * Interpolation that yields segments in document order as each placeholder is resolved.
 * Uses ParallelProcessor (parallel flow with ordered drain). maxConcurrency=1 uses same flow via semaphore.
 * For "more matches" recursion emits the nested result as one segment.
 * Literal substitution is not applied to the stream; literalMap/literalMapPromise exposed for client-side substituteLiterals.
 * When rulesAlreadyEvaluated is true and depth is 0, skips evaluateRules (avoids redundant call when content comes from runStreamingInternal).
 * When contentFullyEvaluated is true and depth is 0, skips both evaluateRules and substituteVariables (e.g. compiled template path).
 */
export function interpolationStream(
	content: string,
	config: ShotputConfig,
	basePath: string = process.cwd(),
	depth = 0,
	remainingLength: number = config.maxPromptLength,
	expandingPaths: Set<string> = new Set(),
	literalBox?: { literals: Map<string, string> },
	mergeContext?: Record<string, unknown>,
	rulesAlreadyEvaluated = false,
	contentFullyEvaluated = false,
): InterpolationStreamResult {
	if (depth === 0) {
		clearStatCache();
	}
	const effectiveConfig = mergeContext
		? {
				...config,
				context: { ...(config.context ?? {}), ...mergeContext },
			}
		: config;
	const contentAfterRules =
		contentFullyEvaluated && depth === 0
			? content
			: rulesAlreadyEvaluated && depth === 0
				? content
				: evaluateRules(content, effectiveConfig);
	const contentAfterVariables =
		contentFullyEvaluated && depth === 0
			? content
			: substituteVariables(contentAfterRules, effectiveConfig);
	const matchEntries = getInterpolationMatchesWithIndices(
		contentAfterVariables,
	);
	const resolvedLiteralBox =
		literalBox ??
		(depth === 0 ? { literals: new Map<string, string>() } : undefined);
	const configToUse = effectiveConfig;

	if (matchEntries.length === 0) {
		const stream = new ReadableStream<string>({
			start(controller) {
				controller.enqueue(contentAfterVariables);
				controller.close();
			},
		});
		const metadata: ShotputOutput["metadata"] = {
			duration: 0,
			resultMetadata: [],
		};
		return {
			stream,
			metadata: Promise.resolve(metadata),
			literalMap: resolvedLiteralBox?.literals,
		};
	}

	const startTime = Date.now();
	let resolveMetadata!: (m: ShotputOutput["metadata"]) => void;
	let rejectMetadata!: (err: unknown) => void;
	const metadataPromise = new Promise<ShotputOutput["metadata"]>(
		(resolve, reject) => {
			resolveMetadata = resolve;
			rejectMetadata = reject;
		},
	);
	let resolveLiteralMap!: (m: Map<string, string> | undefined) => void;
	const literalMapPromise = new Promise<Map<string, string> | undefined>(
		(resolve) => {
			resolveLiteralMap = resolve;
		},
	);

	const maxDepth = config.maxNestingDepth;

	async function innerRun(
		controller: ReadableStreamDefaultController<string>,
	): Promise<{
		currentMetadata: Array<{
			path: string;
			type: string;
			duration: number;
		}>;
	}> {
		const emit = (segment: string) => controller.enqueue(segment);
		let currentMetadata: Array<{
			path: string;
			type: string;
			duration: number;
		}>;
		let finalRemainingLength: number;

		log.info(`Streaming (depth ${depth}/${maxDepth})`);
		const processor = new ParallelProcessor(configToUse);
		const parallelResult = await processor.processTemplatesWithPlanning(
			contentAfterVariables,
			basePath,
			remainingLength,
			undefined,
			expandingPaths,
			emit,
			resolvedLiteralBox,
		);
		const processedContent = parallelResult.content;
		const processedTemplate =
			parallelResult.replacementsNeedRulesAndVars === false
				? processedContent
				: substituteVariables(
						evaluateRules(processedContent, effectiveConfig),
						effectiveConfig,
					);
		currentMetadata = parallelResult.metadata.map((m) => ({
			path: m.path,
			type: m.type,
			duration: m.processingTime,
		}));
		const usedLength = configToUse.tokenizer
			? await getCountFnAsync(configToUse)(processedTemplate)
			: processedTemplate.length;
		finalRemainingLength = Math.max(
			0,
			configToUse.maxPromptLength - usedLength,
		);

		if (currentMetadata.length === 0) {
			emit(contentAfterVariables);
		}

		if (parallelResult.pendingSuffix !== undefined) {
			const moreMatches = processedTemplate.match(interpolationPattern);
			if (moreMatches && depth < maxDepth && finalRemainingLength > 0) {
				log.info(
					`More matches at depth ${depth}, emitting nested result as one segment`,
				);
				const pathsAdded = currentMetadata.map((m) => m.path);
				for (const p of pathsAdded) {
					expandingPaths.add(p);
				}
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
					const nested = await interpolation(
						processedTemplate,
						config,
						inclusionBase,
						depth + 1,
						finalRemainingLength,
						expandingPaths,
						resolvedLiteralBox,
					);
					// Processor already emitted prefix + replacement; emit only the suffix part (transformed by nested interpolation)
					const suffixStart =
						parallelResult.content.length -
						(parallelResult.pendingSuffix?.length ?? 0);
					emit(nested.processedTemplate.slice(suffixStart));
					currentMetadata = [
						...currentMetadata,
						...(nested.resultMetadata ?? []),
					];
					finalRemainingLength = nested.remainingLength;
				} finally {
					for (const p of pathsAdded) {
						expandingPaths.delete(p);
					}
				}
			} else {
				emit(parallelResult.pendingSuffix);
			}
		}

		return { currentMetadata };
	}

	return {
		stream: new ReadableStream<string>({
			start(controller) {
				innerRun(controller)
					.then(({ currentMetadata }) => {
						resolveMetadata({
							duration: Date.now() - startTime,
							resultMetadata: currentMetadata.map((m) => ({
								path: m.path,
								type: m.type,
								duration: m.duration,
							})),
						});
						resolveLiteralMap(resolvedLiteralBox?.literals);
						controller.close();
					})
					.catch((err) => {
						rejectMetadata(err);
						resolveLiteralMap(undefined);
						controller.error(err);
					});
			},
		}),
		metadata: metadataPromise,
		literalMap: undefined,
		literalMapPromise,
	};
}
