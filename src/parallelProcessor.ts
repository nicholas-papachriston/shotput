import type { ShotputConfig } from "./config";
import {
	detectContentLengths,
	trimTasksByLength,
} from "./contentLengthPlanning";
import { getPostResolveSourceHooks, runPostResolveSourceHooks } from "./hooks";
import { getLogger } from "./logger";
import { type TemplateTask, planTemplates } from "./parallelPlan";
import { Semaphore } from "./semaphore";
import { getHandler } from "./sources/handlers";
import { getMatchingPlugin } from "./sources/plugins";
import { getCountFnAsync } from "./tokens";
import type { ProcessingProgress, TemplateResult } from "./types";
import { TemplateType } from "./types";

const LITERAL_PLACEHOLDER_PREFIX = "__SHOTPUT_LITERAL_";

const RULE_VAR_MARKERS = [
	"{{#",
	"{{/",
	"{{else",
	"{{context.",
	"{{params.",
	"{{env.",
] as const;

const log = getLogger("parallelProcessor");

export type SegmentSink = (segment: string) => void;

interface ProcessedContent {
	match: string;
	replacement: string;
	length: number;
}

interface RetryConfig {
	maxRetries: number;
	initialDelay: number;
	backoffMultiplier: number;
}

interface TaskProcessOutcome {
	task: TemplateTask;
	processed: ProcessedContent | null;
	result: TemplateResult;
}

interface ReplacementPart {
	start: number;
	end: number;
	replacement: string;
}

function replacementNeedsRulesAndVars(replacement: string): boolean {
	if (!replacement.includes("{{")) return false;
	for (const marker of RULE_VAR_MARKERS) {
		if (replacement.includes(marker)) return true;
	}
	return false;
}

function formatTaskError(error: string, path: string): string {
	if (error.startsWith("[")) return error;
	return `[Error reading ${path}]`;
}

function fallbackReplacement(
	task: TemplateTask,
	processed: ProcessedContent | null,
	result: TemplateResult,
): string {
	if (result.error) return formatTaskError(result.error, task.path);
	return processed?.replacement ?? "";
}

function stitchContent(content: string, parts: ReplacementPart[]): string {
	const segments: string[] = [];
	let lastEnd = 0;
	for (const part of parts) {
		segments.push(content.slice(lastEnd, part.start));
		segments.push(part.replacement);
		lastEnd = part.end;
	}
	segments.push(content.slice(lastEnd));
	return segments.join("");
}

export class ParallelProcessor {
	private semaphore: Semaphore;
	private processedTemplates: TemplateResult[] = [];
	private startTime = 0;
	private retryConfig: RetryConfig;
	private config: ShotputConfig;

	constructor(config: ShotputConfig) {
		this.config = config;
		this.semaphore = new Semaphore(config.maxConcurrency);
		this.retryConfig = {
			maxRetries: config.maxRetries,
			initialDelay: config.retryDelay,
			backoffMultiplier: config.retryBackoffMultiplier,
		};
	}

	private async retryWithBackoff<T>(
		operation: () => Promise<T>,
		taskPath: string,
		attempt = 0,
	): Promise<T> {
		try {
			return await operation();
		} catch (error) {
			if (attempt >= this.retryConfig.maxRetries) {
				log.error(`Failed after ${attempt} retries for ${taskPath}: ${error}`);
				throw error;
			}

			const delay =
				this.retryConfig.initialDelay *
				this.retryConfig.backoffMultiplier ** attempt;
			log.info(
				`Retry attempt ${attempt + 1}/${this.retryConfig.maxRetries} for ${taskPath} after ${delay}ms`,
			);

			await new Promise((resolve) => setTimeout(resolve, delay));
			return this.retryWithBackoff(operation, taskPath, attempt + 1);
		}
	}

	private async processSingleTemplate(
		task: TemplateTask,
		remainingLength: number,
	): Promise<{
		task: TemplateTask;
		processed: ProcessedContent | null;
		result: TemplateResult;
	}> {
		const startTime = Date.now();

		const countFnAsync = getCountFnAsync(this.config);
		const lengthOf = async (text: string): Promise<number> =>
			this.config.tokenizer ? await countFnAsync(text) : text.length;

		if (task.isCycle) {
			const replacement = `[Cycle detected: ${task.path}]`;
			const len = await lengthOf(replacement);
			return {
				task,
				processed: { match: task.match, replacement, length: len },
				result: {
					type: task.type,
					path: task.path,
					length: len,
					truncated: false,
					processingTime: Date.now() - startTime,
					content: replacement,
				},
			};
		}

		const operation = async () => {
			const handler = getHandler(task.type);
			const result = await handler(
				this.config,
				task.match,
				task.path,
				task.match,
				remainingLength,
				task.basePath ?? process.cwd(),
			);
			const operationResults = result.operationResults;
			const combinedRemainingCount = result.combinedRemainingCount;

			let replacement = operationResults;

			if (task.needsCompression && this.config.compressor) {
				const budget = task.compressionBudget ?? 0;
				const unit = this.config.tokenizer ? "tokens" : "chars";
				replacement = await Promise.resolve(
					this.config.compressor(replacement, { maxBudget: budget, unit }),
				);
			}

			const isError =
				replacement.startsWith("[Error") ||
				replacement.startsWith("[Security Error");

			const len = await lengthOf(replacement);

			return {
				task,
				processed: {
					match: task.match,
					replacement,
					length: len,
				},
				result: {
					type: task.type,
					path: task.path,
					length: len,
					truncated: combinedRemainingCount === 0,
					processingTime: Date.now() - startTime,
					content: replacement,
					error: isError ? replacement : undefined,
					okf: result.okf,
					okfDocuments: result.okfDocuments,
				},
			};
		};

		try {
			return await this.retryWithBackoff(operation, task.path);
		} catch (error) {
			return {
				task,
				processed: null,
				result: {
					type: task.type,
					path: task.path,
					length: 0,
					truncated: false,
					processingTime: Date.now() - startTime,
					error: String(error),
				},
			};
		}
	}

	private async prepareTaskReplacement(
		task: TemplateTask,
		templateResult: TemplateResult,
		processed: ProcessedContent,
		maxLength: number,
		literalBox?: { literals: Map<string, string> },
	): Promise<string> {
		let replacement = processed.replacement;
		if (task.type === TemplateType.Custom && literalBox) {
			const plugin = getMatchingPlugin(this.config, task.path);
			if (plugin && !plugin.canContainTemplates && replacement) {
				const key = `${LITERAL_PLACEHOLDER_PREFIX}${literalBox.literals.size}__`;
				literalBox.literals.set(key, replacement);
				replacement = key;
			}
		}
		const postSourceHooks = getPostResolveSourceHooks(this.config);
		if (postSourceHooks.length > 0) {
			const sourceResult = {
				type: templateResult.type,
				path: templateResult.path,
				content: replacement,
				remainingLength: maxLength - processed.length,
				metadata: templateResult,
			};
			const afterHook = await runPostResolveSourceHooks(
				sourceResult,
				postSourceHooks,
			);
			replacement = afterHook.content;
		}
		return replacement;
	}

	private settleTaskOutcomes(
		settledResults: PromiseSettledResult<TaskProcessOutcome>[],
		selectedTasks: TemplateTask[],
	): { results: TaskProcessOutcome[]; hasError: boolean } {
		const results: TaskProcessOutcome[] = [];
		let hasError = false;
		for (let i = 0; i < settledResults.length; i++) {
			const settled = settledResults[i];
			if (settled?.status === "fulfilled") {
				results.push(settled.value);
				continue;
			}
			const task = selectedTasks[i];
			if (task === undefined) continue;
			hasError = true;
			results.push({
				task,
				processed: null,
				result: {
					type: task.type,
					path: task.path,
					length: 0,
					truncated: false,
					processingTime: Date.now() - this.startTime,
					error: `[Error reading ${task.path}]`,
				},
			});
		}
		return { results, hasError };
	}

	private collectReplacementParts(
		results: TaskProcessOutcome[],
		hookedReplacements: Map<number, string>,
	): { parts: ReplacementPart[]; replacementsNeedRulesAndVars: boolean } {
		const parts: ReplacementPart[] = [];
		let replacementsNeedRulesAndVars = false;
		for (const { task, processed, result } of results) {
			this.processedTemplates.push(result);
			const hooked = hookedReplacements.get(task.matchIndex);
			const replacement =
				hooked ?? fallbackReplacement(task, processed, result);
			if ((!result.error && processed) || result.error) {
				parts.push({
					start: task.matchIndex,
					end: task.matchIndex + task.match.length,
					replacement,
				});
				if (replacementNeedsRulesAndVars(replacement)) {
					replacementsNeedRulesAndVars = true;
				}
			}
		}
		return { parts, replacementsNeedRulesAndVars };
	}

	private async runParallelTasks(
		selectedTasks: TemplateTask[],
		content: string,
		maxLength: number,
		onProgress: ((progress: ProcessingProgress) => void) | undefined,
		emit: SegmentSink | undefined,
		literalBox: { literals: Map<string, string> } | undefined,
	): Promise<{
		hookedReplacements: Map<number, string>;
		lastEmittedEnd: number;
		hasError: boolean;
		results: TaskProcessOutcome[];
	}> {
		const orderedParts = selectedTasks.map((task) => ({
			start: task.matchIndex,
			end: task.matchIndex + task.match.length,
		}));
		orderedParts.sort((a, b) => a.start - b.start);
		const completed = new Map<number, { end: number; replacement: string }>();
		const hookedReplacements = new Map<number, string>();
		let lastEmittedEnd = 0;
		let hasError = false;
		let nextDrainIndex = 0;

		const tryDrain = (): void => {
			while (nextDrainIndex < orderedParts.length) {
				const part = orderedParts[nextDrainIndex];
				if (part.start < lastEmittedEnd) {
					nextDrainIndex++;
					continue;
				}
				const done = completed.get(part.start);
				if (!done) break;
				if (emit && !hasError) {
					emit(content.slice(lastEmittedEnd, part.start));
					emit(done.replacement);
				}
				lastEmittedEnd = part.end;
				completed.delete(part.start);
				nextDrainIndex++;
			}
		};

		const processingPromises = selectedTasks.map(async (task, index) => {
			await this.semaphore.acquire();

			try {
				onProgress?.({
					current: index,
					total: selectedTasks.length,
					currentTemplate: task.path,
					stage: "processing",
				});

				const perTaskBudget = Math.max(
					0,
					Math.floor(maxLength / Math.max(1, selectedTasks.length)),
				);
				const result = await this.processSingleTemplate(task, perTaskBudget);
				const processed = result.processed;

				if (!hasError) {
					const templateResult = result.result;
					let replacement: string;
					if (!templateResult.error && processed) {
						replacement = await this.prepareTaskReplacement(
							task,
							templateResult,
							processed,
							maxLength,
							literalBox,
						);
						hookedReplacements.set(task.matchIndex, replacement);
					} else if (templateResult.error) {
						replacement = formatTaskError(templateResult.error, task.path);
						hookedReplacements.set(task.matchIndex, replacement);
					} else {
						replacement = "";
					}

					const end = task.matchIndex + task.match.length;
					completed.set(task.matchIndex, { end, replacement });
					tryDrain();
				}
				return result;
			} catch (err) {
				hasError = true;
				throw err;
			} finally {
				this.semaphore.release();
			}
		});

		const settledResults = await Promise.allSettled(processingPromises);
		const settled = this.settleTaskOutcomes(settledResults, selectedTasks);
		if (settled.hasError) hasError = true;

		if (emit && !hasError) {
			tryDrain();
		}

		return {
			hookedReplacements,
			lastEmittedEnd,
			hasError,
			results: settled.results,
		};
	}

	async processTemplatesWithPlanning(
		content: string,
		basePath: string,
		maxLength: number,
		onProgress?: (progress: ProcessingProgress) => void,
		expandingPaths?: Set<string>,
		emit?: SegmentSink,
		literalBox?: { literals: Map<string, string> },
	): Promise<{
		content: string;
		metadata: TemplateResult[];
		replacementsNeedRulesAndVars: boolean;
		pendingSuffix?: string;
	}> {
		this.startTime = Date.now();
		this.processedTemplates = [];

		log.info("Step 1: Planning templates...");
		const plannedTasks = await planTemplates(
			content,
			basePath,
			this.config,
			expandingPaths,
		);

		if (plannedTasks.length === 0) {
			return { content, metadata: [], replacementsNeedRulesAndVars: false };
		}

		log.info("Step 2: Detecting content lengths...");
		const tasksWithLengths = await detectContentLengths(
			this.config,
			plannedTasks,
			this.semaphore,
			onProgress,
		);

		log.info("Step 3: Trimming by content length...");
		const selectedTasks = this.config.enableContentLengthPlanning
			? trimTasksByLength(this.config, tasksWithLengths, maxLength)
			: tasksWithLengths;

		log.info(
			`Step 4: Processing ${selectedTasks.length} templates in parallel...`,
		);

		const parallel = await this.runParallelTasks(
			selectedTasks,
			content,
			maxLength,
			onProgress,
			emit,
			literalBox,
		);
		parallel.results.sort((a, b) => a.task.matchIndex - b.task.matchIndex);

		const { parts, replacementsNeedRulesAndVars } =
			this.collectReplacementParts(
				parallel.results,
				parallel.hookedReplacements,
			);
		const resultContent = stitchContent(content, parts);
		const pendingSuffix = emit
			? content.slice(parallel.lastEmittedEnd)
			: undefined;

		onProgress?.({
			current: selectedTasks.length,
			total: selectedTasks.length,
			currentTemplate: "",
			stage: "complete",
		});

		log.info(
			`Processing complete in ${Date.now() - this.startTime}ms (${this.processedTemplates.length} templates)`,
		);

		return {
			content: resultContent,
			metadata: this.processedTemplates,
			replacementsNeedRulesAndVars,
			...(pendingSuffix !== undefined && { pendingSuffix }),
		};
	}
}
