import { isAbsolute, resolve } from "node:path";
import { CONFIG } from "./config";
import { getLogger } from "./logger";
import { Semaphore } from "./semaphore";
import { findTemplateType } from "./template";
import type { ProcessingProgress, TemplateResult } from "./types";
import { TemplateType } from "./types";

const log = getLogger("parallelProcessor");

interface TemplateTask {
	type: TemplateType;
	path: string;
	match: string;
	originalIndex: number;
	estimatedLength?: number;
	priority: number;
}

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

	constructor(maxConcurrency = 4, retryConfig?: Partial<RetryConfig>) {
		this.semaphore = new Semaphore(maxConcurrency);
		this.retryConfig = {
			maxRetries: retryConfig?.maxRetries ?? CONFIG.maxRetries ?? 3,
			initialDelay: retryConfig?.initialDelay ?? CONFIG.retryDelay ?? 1000,
			backoffMultiplier:
				retryConfig?.backoffMultiplier ?? CONFIG.retryBackoffMultiplier ?? 2,
		};
	}

	/**
	 * Parse template content to extract all template patterns
	 */
	private async planTemplates(
		content: string,
		basePath: string,
	): Promise<TemplateTask[]> {
		const pattern = /\{\{([^}]+)\}\}/g;
		const matches = content.match(pattern);

		if (!matches) {
			return [];
		}

		const tasks: TemplateTask[] = [];

		for (let i = 0; i < matches.length; i++) {
			const match = matches[i];
			const rawPath = match.slice(2, -2).trim();
			const path = this.resolvePath(basePath, rawPath);

			try {
				const templateType = await findTemplateType(path);

				tasks.push({
					type: templateType,
					path,
					match,
					originalIndex: i,
					priority: this.calculatePriority(templateType, i),
				});
			} catch (error) {
				log.warn(`Failed to determine template type for ${path}: ${error}`);
				tasks.push({
					type: TemplateType.String,
					path,
					match,
					originalIndex: i,
					priority: 999,
				});
			}
		}

		log.info(`Planned ${tasks.length} templates for processing`);
		return tasks;
	}

	/**
	 * Calculate priority for template processing
	 * Lower numbers = higher priority (processed first)
	 */
	private calculatePriority(type: TemplateType, index: number): number {
		// Priority based on template type
		const typePriority: Record<TemplateType, number> = {
			[TemplateType.String]: 100,
			[TemplateType.File]: 10,
			[TemplateType.Directory]: 50,
			[TemplateType.Glob]: 40,
			[TemplateType.Regex]: 40,
			[TemplateType.S3]: 30,
			[TemplateType.Http]: 20,
			[TemplateType.Function]: 60,
			[TemplateType.Skill]: 70,
		};

		// Maintain original order within same type
		return (typePriority[type] ?? 100) + index * 0.01;
	}

	/**
	 * Attempt to get content length without fetching full content
	 */
	private async estimateContentLength(task: TemplateTask): Promise<number> {
		try {
			switch (task.type) {
				case TemplateType.File: {
					const file = Bun.file(task.path);
					return file.size;
				}

				case TemplateType.Http: {
					const response = await fetch(task.path, {
						method: "HEAD",
						signal: AbortSignal.timeout(CONFIG.httpTimeout ?? 30000),
					});
					const contentLength = response.headers.get("content-length");
					return contentLength ? Number.parseInt(contentLength, 10) : 0;
				}

				case TemplateType.S3: {
					// For S3, we'd need to make a HEAD request
					// This is a simplified estimation
					return 0;
				}

				default:
					return 0;
			}
		} catch (error) {
			log.info(`Could not estimate content length for ${task.path}: ${error}`);
			return 0;
		}
	}

	/**
	 * Detect content lengths for all templates in parallel
	 */
	private async detectContentLengths(
		tasks: TemplateTask[],
		onProgress?: (progress: ProcessingProgress) => void,
	): Promise<TemplateTask[]> {
		if (!CONFIG.enableContentLengthPlanning) {
			return tasks;
		}

		log.info("Detecting content lengths for planning...");

		onProgress?.({
			current: 0,
			total: tasks.length,
			currentTemplate: "",
			stage: "parsing",
		});

		const estimationPromises = tasks.map(async (task, index) => {
			await this.semaphore.acquire();

			try {
				const estimatedLength = await this.estimateContentLength(task);
				task.estimatedLength = estimatedLength;

				onProgress?.({
					current: index + 1,
					total: tasks.length,
					currentTemplate: task.path,
					stage: "parsing",
				});

				return task;
			} finally {
				this.semaphore.release();
			}
		});

		const tasksWithLengths = await Promise.all(estimationPromises);

		// Log planning summary
		const totalEstimatedLength = tasksWithLengths.reduce(
			(sum, task) => sum + (task.estimatedLength ?? 0),
			0,
		);
		log.info(
			`Total estimated content length: ${totalEstimatedLength} bytes, max allowed: ${CONFIG.maxPromptLength}`,
		);

		return tasksWithLengths;
	}

	/**
	 * Trim tasks based on content length and priority
	 */
	private trimTasksByLength(
		tasks: TemplateTask[],
		maxLength: number,
	): TemplateTask[] {
		// Sort by priority (lower = higher priority)
		const sortedTasks = [...tasks].sort((a, b) => a.priority - b.priority);

		let accumulatedLength = 0;
		const selectedTasks: TemplateTask[] = [];

		for (const task of sortedTasks) {
			const estimatedLength = task.estimatedLength ?? 0;

			if (
				accumulatedLength + estimatedLength <= maxLength ||
				estimatedLength === 0
			) {
				selectedTasks.push(task);
				accumulatedLength += estimatedLength;
			} else {
				log.warn(
					`Skipping ${task.path} due to length constraints (accumulated: ${accumulatedLength}, estimated: ${estimatedLength}, max: ${maxLength})`,
				);
			}
		}

		// Restore original order
		selectedTasks.sort((a, b) => a.originalIndex - b.originalIndex);

		log.info(
			`Trimmed to ${selectedTasks.length} templates (from ${tasks.length})`,
		);
		return selectedTasks;
	}

	/**
	 * Retry a failed operation with exponential backoff
	 */
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

	/**
	 * Process a single template with retry logic
	 */
	private async processSingleTemplate(
		task: TemplateTask,
		remainingLength: number,
	): Promise<{
		task: TemplateTask;
		processed: ProcessedContent | null;
		result: TemplateResult;
	}> {
		const startTime = Date.now();

		const operation = async () => {
			const handler = await this.getHandler(task.type);

			// Pass only the match as content so we can extract just the replacement
			const { operationResults, combinedRemainingCount } = await handler(
				task.match,
				task.path,
				task.match,
				remainingLength,
			);

			// The operationResults should be just the replacement content
			// since we passed only the match as the input
			const replacement = operationResults;

			// Detect if the handler returned an error message instead of throwing
			// Handlers typically return [Error: ...] or [Security Error: ...]
			const isError =
				replacement.startsWith("[Error") ||
				replacement.startsWith("[Security Error");

			return {
				task,
				processed: {
					match: task.match,
					replacement,
					length: replacement.length,
				},
				result: {
					type: task.type,
					path: task.path,
					length: replacement.length,
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

	/**
	 * Main parallel processing with planning and retry logic
	 */
	async processTemplatesWithPlanning(
		content: string,
		basePath: string,
		maxLength: number,
		onProgress?: (progress: ProcessingProgress) => void,
	): Promise<{ content: string; metadata: TemplateResult[] }> {
		this.startTime = Date.now();
		this.processedTemplates = [];

		// Step 1: Planning - parse all templates
		log.info("Step 1: Planning templates...");
		const plannedTasks = await this.planTemplates(content, basePath);

		if (plannedTasks.length === 0) {
			return { content, metadata: [] };
		}

		// Step 2: Content length detection
		log.info("Step 2: Detecting content lengths...");
		const tasksWithLengths = await this.detectContentLengths(
			plannedTasks,
			onProgress,
		);

		// Step 3: Trim based on content length
		log.info("Step 3: Trimming by content length...");
		const selectedTasks = CONFIG.enableContentLengthPlanning
			? this.trimTasksByLength(tasksWithLengths, maxLength)
			: tasksWithLengths;

		// Step 4: Process in parallel
		log.info(
			`Step 4: Processing ${selectedTasks.length} templates in parallel...`,
		);

		// Fetch content in parallel for performance
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

		// Replace templates sequentially in original order for correctness
		let resultContent = content;
		let remainingLength = maxLength;

		for (const { task, processed, result } of results) {
			this.processedTemplates.push(result);

			if (!result.error && processed) {
				// Replace the template match in the current content
				resultContent = resultContent.replace(
					processed.match,
					processed.replacement,
				);
				remainingLength -= processed.length;
			} else if (result.error) {
				// Handle failed templates by replacing with error message
				// Use the error message from the result if it's already formatted
				const errorMsg = result.error.startsWith("[")
					? result.error
					: `[Error reading ${task.path}]`;
				resultContent = resultContent.replace(task.match, errorMsg);
			}
		}

		// Final progress update
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

	/**
	 * Resolve path with special prefix handling
	 */
	private resolvePath(basePath: string, filePath: string): string {
		const SPECIAL_PREFIXES = [
			"skill:",
			"function:",
			"http://",
			"https://",
			"s3://",
		];

		const shouldResolve = !SPECIAL_PREFIXES.some((prefix) =>
			filePath.startsWith(prefix),
		);

		if (!shouldResolve) {
			return filePath;
		}

		return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
	}

	/**
	 * Get the appropriate handler for a template type
	 */
	private async getHandler(type: TemplateType) {
		switch (type) {
			case TemplateType.File: {
				const handler = await import("./file");
				return handler.handleFile;
			}
			case TemplateType.Directory: {
				const handler = await import("./directory");
				return handler.handleDirectory;
			}
			case TemplateType.Glob:
			case TemplateType.Regex: {
				const handler = await import("./glob");
				return handler.handleGlob;
			}
			case TemplateType.S3: {
				const handler = await import("./s3");
				return handler.handleS3;
			}
			case TemplateType.Http: {
				const handler = await import("./http");
				return handler.handleHttp;
			}
			case TemplateType.Function: {
				const handler = await import("./function");
				return handler.handleFunction;
			}
			case TemplateType.Skill: {
				const handler = await import("./skill");
				return handler.handleSkill;
			}
			default:
				throw new Error(`Unsupported template type: ${type}`);
		}
	}
}
