import type { ShotputConfig } from "./config";
import { interpolation } from "./interpolation";
import { interpolationPattern } from "./interpolationApply";
import { runSequentialInterpolation } from "./interpolationSequential";
import { getLogger } from "./logger";
import { ParallelProcessor } from "./parallelProcessor";
import { evaluateRules } from "./rules";
import { clearStatCache } from "./template";
import { getCountFnAsync } from "./tokens";
import type { ShotputOutput } from "./types";
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
 * Uses parallel path when enableContentLengthPlanning && maxConcurrency > 1, else sequential.
 * For "more matches" recursion emits the nested result as one segment.
 * Literal substitution is not applied to the stream; literalMap/literalMapPromise exposed for client-side substituteLiterals (sequential path only).
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
	const contentAfterRules = evaluateRules(content, effectiveConfig);
	const contentAfterVariables = substituteVariables(
		contentAfterRules,
		effectiveConfig,
	);
	const matches = contentAfterVariables.match(interpolationPattern);
	const resolvedLiteralBox =
		literalBox ??
		(depth === 0 ? { literals: new Map<string, string>() } : undefined);
	const configToUse = effectiveConfig;

	if (!matches) {
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
	const useParallel =
		config.enableContentLengthPlanning && config.maxConcurrency > 1;
	const matchesArr = matches;

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

		if (useParallel) {
			log.info(
				`Streaming parallel (depth ${depth}/${maxDepth}) with content length planning`,
			);
			const processor = new ParallelProcessor(configToUse);
			const parallelResult = await processor.processTemplatesWithPlanning(
				contentAfterVariables,
				basePath,
				remainingLength,
				undefined,
				expandingPaths,
				emit,
			);
			const processedContent = parallelResult.content;
			const processedTemplate = substituteVariables(
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

			// When parallel had 0 tasks (e.g. all placeholders are String like section markers), it returns without calling emit; emit full content.
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
					try {
						const nested = await interpolation(
							processedTemplate,
							config,
							basePath,
							depth + 1,
							finalRemainingLength,
							expandingPaths,
							resolvedLiteralBox,
						);
						emit(nested.processedTemplate);
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
		} else {
			log.info(`Streaming sequential (depth ${depth}/${maxDepth})`);
			// Buffer segments so we can emit either buffer+suffix or single nested result when there are more matches
			const sequentialBuffer: string[] = [];
			const sequentialEmit = (segment: string) =>
				sequentialBuffer.push(segment);
			const sequentialResult = await runSequentialInterpolation(
				contentAfterVariables,
				config,
				basePath,
				depth,
				remainingLength,
				expandingPaths,
				resolvedLiteralBox,
				configToUse,
				matchesArr,
				(cont, inclusionBase, d, remLen, expPaths, litBox, mergeCtx) =>
					interpolation(
						cont,
						configToUse,
						inclusionBase,
						d,
						remLen,
						expPaths,
						litBox,
						mergeCtx,
					),
				sequentialEmit,
			);

			currentMetadata = sequentialResult.resultMetadata;
			finalRemainingLength = sequentialResult.finalRemainingLength;

			if (sequentialResult.pendingSuffix !== undefined) {
				const result = sequentialResult.result;
				const moreMatches = result.match(interpolationPattern);
				if (moreMatches && depth < maxDepth && finalRemainingLength > 0) {
					log.info(
						`More matches at depth ${depth}, emitting nested result as one segment`,
					);
					const pathsAdded = currentMetadata.map((m) => m.path);
					for (const p of pathsAdded) {
						expandingPaths.add(p);
					}
					try {
						const nested = await interpolation(
							result,
							config,
							basePath,
							depth + 1,
							finalRemainingLength,
							expandingPaths,
							resolvedLiteralBox,
						);
						emit(nested.processedTemplate);
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
					for (const seg of sequentialBuffer) emit(seg);
					emit(sequentialResult.pendingSuffix);
				}
			} else {
				for (const seg of sequentialBuffer) emit(seg);
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
						resolveLiteralMap(
							useParallel ? undefined : resolvedLiteralBox?.literals,
						);
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
