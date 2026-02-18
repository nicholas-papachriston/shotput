import type { ShotputConfig } from "./config";
import {
	detectContentLengths,
	trimTasksByLength,
} from "./contentLengthPlanning";
import { getHandler } from "./handlers";
import { getPostResolveSourceHooks, runPostResolveSourceHooks } from "./hooks";
import { getLogger } from "./logger";
import { type TemplateTask, planTemplates } from "./parallelPlan";
import { Semaphore } from "./semaphore";
import { getCountFn } from "./tokens";
import type { ProcessingProgress, TemplateResult } from "./types";

const log = getLogger("parallelProcessor");

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

		const countFn = getCountFn(this.config);
		const lengthOf = (text: string) =>
			this.config.tokenizer ? countFn(text) : text.length;

		if (task.isCycle) {
			const replacement = `[Cycle detected: ${task.path}]`;
			const len = lengthOf(replacement);
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

			const replacement = operationResults;

			const isError =
				replacement.startsWith("[Error") ||
				replacement.startsWith("[Security Error");

			const len = lengthOf(replacement);

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

	async processTemplatesWithPlanning(
		content: string,
		basePath: string,
		maxLength: number,
		onProgress?: (progress: ProcessingProgress) => void,
		expandingPaths?: Set<string>,
	): Promise<{ content: string; metadata: TemplateResult[] }> {
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
			return { content, metadata: [] };
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
			? trimTasksByLength(tasksWithLengths, maxLength)
			: tasksWithLengths;

		log.info(
			`Step 4: Processing ${selectedTasks.length} templates in parallel...`,
		);

		const processingPromises = selectedTasks.map(async (task, index) => {
			await this.semaphore.acquire();

			try {
				onProgress?.({
					current: index,
					total: selectedTasks.length,
					currentTemplate: task.path,
					stage: "processing",
				});

				const result = await this.processSingleTemplate(task, maxLength);

				return result;
			} finally {
				this.semaphore.release();
			}
		});

		const results = await Promise.all(processingPromises);

		results.sort((a, b) => a.task.matchIndex - b.task.matchIndex);

		const parts: { start: number; end: number; replacement: string }[] = [];
		let remainingLength = maxLength;

		for (const { task, processed, result } of results) {
			this.processedTemplates.push(result);

			const start = task.matchIndex;
			const end = task.matchIndex + task.match.length;

			if (!result.error && processed) {
				let replacement = processed.replacement;
				const postSourceHooks = getPostResolveSourceHooks(this.config);
				if (postSourceHooks.length > 0) {
					const sourceResult = {
						type: result.type,
						path: result.path,
						content: replacement,
						remainingLength: remainingLength - processed.length,
						metadata: result,
					};
					const afterHook = await runPostResolveSourceHooks(
						sourceResult,
						postSourceHooks,
					);
					replacement = afterHook.content;
				}
				parts.push({ start, end, replacement });
				remainingLength -= processed.length;
			} else if (result.error) {
				const errorMsg = result.error.startsWith("[")
					? result.error
					: `[Error reading ${task.path}]`;
				parts.push({ start, end, replacement: errorMsg });
			}
		}

		let resultContent = content;
		for (let i = parts.length - 1; i >= 0; i--) {
			const { start, end, replacement } = parts[i];
			resultContent =
				resultContent.slice(0, start) + replacement + resultContent.slice(end);
		}

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
		};
	}
}
