import type { ShotputConfig } from "./config";
import { getLogger } from "./logger";
import type { TemplateTask } from "./parallelPlan";
import { getMatchingPlugin } from "./plugins";
import type { Semaphore } from "./semaphore";
import type { ProcessingProgress } from "./types";
import { TemplateType } from "./types";

/** When tokenizer is set, planning uses token estimates; convert bytes to tokens with this. */
const CHARS_PER_TOKEN = 4;

const log = getLogger("contentLengthPlanning");

/**
 * Attempt to get content length without fetching full content.
 */
export async function estimateContentLength(
	config: ShotputConfig,
	task: TemplateTask,
): Promise<number> {
	try {
		switch (task.type) {
			case TemplateType.File: {
				const file = Bun.file(task.path);
				return file.size;
			}

			case TemplateType.Format: {
				const colon = task.path.indexOf(":");
				const filePath = colon >= 0 ? task.path.slice(colon + 1) : task.path;
				const file = Bun.file(filePath);
				return file.size;
			}

			case TemplateType.Http: {
				const response = await fetch(task.path, {
					method: "HEAD",
					signal: AbortSignal.timeout(config.httpTimeout),
				});
				const contentLength = response.headers.get("content-length");
				return contentLength ? Number.parseInt(contentLength, 10) : 0;
			}

			case TemplateType.S3: {
				return 0;
			}

			case TemplateType.Custom: {
				const plugin = getMatchingPlugin(config, task.path);
				if (plugin?.estimateLength) {
					return await plugin.estimateLength(task.path, config);
				}
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
 * Detect content lengths for all templates in parallel.
 */
export async function detectContentLengths(
	config: ShotputConfig,
	tasks: TemplateTask[],
	semaphore: Semaphore,
	onProgress?: (progress: ProcessingProgress) => void,
): Promise<TemplateTask[]> {
	if (!config.enableContentLengthPlanning) {
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
		await semaphore.acquire();

		try {
			const estimatedLength = await estimateContentLength(config, task);
			task.estimatedLength = estimatedLength;

			onProgress?.({
				current: index + 1,
				total: tasks.length,
				currentTemplate: task.path,
				stage: "parsing",
			});

			return task;
		} finally {
			semaphore.release();
		}
	});

	const tasksWithLengths = await Promise.all(estimationPromises);

	if (config.tokenizer) {
		for (const task of tasksWithLengths) {
			const bytes = task.estimatedLength ?? 0;
			task.estimatedLength = Math.ceil(bytes / CHARS_PER_TOKEN);
		}
	}

	const totalEstimatedLength = tasksWithLengths.reduce(
		(sum, task) => sum + (task.estimatedLength ?? 0),
		0,
	);
	const unit = config.tokenizer ? "tokens" : "bytes";
	log.info(
		`Total estimated content length: ${totalEstimatedLength} ${unit}, max allowed: ${config.maxPromptLength}`,
	);

	return tasksWithLengths;
}

/**
 * Trim tasks based on content length and priority.
 */
export function trimTasksByLength(
	config: ShotputConfig,
	tasks: TemplateTask[],
	maxLength: number,
): TemplateTask[] {
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
		} else if (config.compressor) {
			const budget = Math.max(0, maxLength - accumulatedLength);
			task.needsCompression = true;
			task.compressionBudget = budget;
			selectedTasks.push(task);
			accumulatedLength = maxLength;
			log.info(
				`Marked ${task.path} for semantic compression (budget: ${budget})`,
			);
		} else {
			log.warn(
				`Skipping ${task.path} due to length constraints (accumulated: ${accumulatedLength}, estimated: ${estimatedLength}, max: ${maxLength})`,
			);
		}
	}

	selectedTasks.sort((a, b) => a.originalIndex - b.originalIndex);

	log.info(
		`Trimmed to ${selectedTasks.length} templates (from ${tasks.length})`,
	);
	return selectedTasks;
}
