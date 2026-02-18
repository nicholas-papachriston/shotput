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
}

/**
 * Interpolation that yields segments in document order as each placeholder is resolved.
 * Uses parallel path when enableContentLengthPlanning && maxConcurrency > 1, else sequential.
 * For "more matches" recursion emits the nested result as one segment.
 * Literal substitution is not applied to the stream; literalMap is exposed for client-side substituteLiterals (sequential path only).
 */
export async function interpolationStream(
	content: string,
	config: ShotputConfig,
	basePath: string = process.cwd(),
	depth = 0,
	remainingLength: number = config.maxPromptLength,
	expandingPaths: Set<string> = new Set(),
	literalBox?: { literals: Map<string, string> },
	mergeContext?: Record<string, unknown>,
): Promise<InterpolationStreamResult> {
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

	const segments: string[] = [];
	const emit = (segment: string) => segments.push(segment);
	const maxDepth = config.maxNestingDepth;
	const useParallel =
		config.enableContentLengthPlanning && config.maxConcurrency > 1;

	let currentMetadata: Array<{ path: string; type: string; duration: number }>;
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
					segments.push(nested.processedTemplate);
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
				segments.push(parallelResult.pendingSuffix);
			}
		}
	} else {
		log.info(`Streaming sequential (depth ${depth}/${maxDepth})`);
		const sequentialResult = await runSequentialInterpolation(
			contentAfterVariables,
			config,
			basePath,
			depth,
			remainingLength,
			expandingPaths,
			resolvedLiteralBox,
			configToUse,
			matches,
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
			emit,
		);

		const result = sequentialResult.result;
		currentMetadata = sequentialResult.resultMetadata;
		finalRemainingLength = sequentialResult.finalRemainingLength;

		if (sequentialResult.pendingSuffix !== undefined) {
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
					segments.push(nested.processedTemplate);
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
				segments.push(sequentialResult.pendingSuffix);
			}
		}
	}

	const startTime = Date.now();
	const stream = new ReadableStream<string>({
		start(controller) {
			for (const seg of segments) {
				controller.enqueue(seg);
			}
			controller.close();
		},
	});
	const metadata: Promise<ShotputOutput["metadata"]> = Promise.resolve({
		duration: Date.now() - startTime,
		resultMetadata: currentMetadata.map((m) => ({
			path: m.path,
			type: m.type,
			duration: m.duration,
		})),
	});

	return {
		stream,
		metadata,
		literalMap: useParallel ? undefined : resolvedLiteralBox?.literals,
	};
}
