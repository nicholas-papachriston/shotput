import type { ShotputConfig } from "../config";
import { getLogger } from "../logger";
import { ParallelProcessor } from "../parallelProcessor";
import { clearStatCache } from "../template";
import { getCountFnAsync } from "../tokens";
import type { ShotputOutput } from "../types";
import { interpolation } from "./interpolation";
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
	const effectiveConfig = createEffectiveConfig(config, mergeContext);
	const contentAfterVariables = evaluateInterpolationContent(
		content,
		effectiveConfig,
		depth,
		{ rulesAlreadyEvaluated, contentFullyEvaluated },
	);
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
		const bufferedSegments: string[] = [];
		const emit = (segment: string) => bufferedSegments.push(segment);
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
				: evaluateInterpolationContent(
						processedContent,
						effectiveConfig,
						depth,
					);
		currentMetadata = mapInterpolationMetadata(parallelResult.metadata);
		const usedLength = configToUse.tokenizer
			? await getCountFnAsync(configToUse)(processedTemplate)
			: processedTemplate.length;
		finalRemainingLength = Math.max(
			0,
			configToUse.maxPromptLength - usedLength,
		);

		if (currentMetadata.length === 0) {
			bufferedSegments.push(contentAfterVariables);
		}

		if (parallelResult.pendingSuffix !== undefined) {
			const pendingSuffix = parallelResult.pendingSuffix;
			const moreMatches = processedTemplate.match(interpolationPattern);
			if (moreMatches && depth < maxDepth && finalRemainingLength > 0) {
				log.info(
					`More matches at depth ${depth}, emitting nested result as one segment`,
				);
				const pathsAdded = currentMetadata.map((m) => m.path);
				for (const p of pathsAdded) {
					expandingPaths.add(p);
				}
				const inclusionBase = resolveNestedInclusionBase(
					processedTemplate,
					currentMetadata,
					basePath,
				);
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
					controller.enqueue(nested.processedTemplate);
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
				for (const segment of bufferedSegments) {
					controller.enqueue(segment);
				}
				controller.enqueue(pendingSuffix);
			}
		} else {
			for (const segment of bufferedSegments) {
				controller.enqueue(segment);
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
