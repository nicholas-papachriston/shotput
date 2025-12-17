import { Semaphore } from "./semaphore";
import type { ProcessingProgress, TemplateResult } from "./types";
import { TemplateType } from "./types";

export class ParallelProcessor {
	private semaphore: Semaphore;
	private processedTemplates: TemplateResult[] = [];
	private startTime = 0;

	constructor(maxConcurrency = 4) {
		this.semaphore = new Semaphore(maxConcurrency);
	}

	async processTemplatesParallel(
		templates: Array<{ type: TemplateType; path: string; match: string }>,
		initialContent: string,
		maxLength: number,
		onProgress?: (progress: ProcessingProgress) => void,
	): Promise<{ content: string; metadata: TemplateResult[] }> {
		this.startTime = Date.now();
		this.processedTemplates = [];

		// Update progress
		onProgress?.({
			current: 0,
			total: templates.length,
			currentTemplate: "",
			stage: "parsing",
		});

		// Process templates in parallel with semaphore
		const processingPromises = templates.map(async (template, index) => {
			await this.semaphore.acquire();

			try {
				onProgress?.({
					current: index,
					total: templates.length,
					currentTemplate: template.path,
					stage: "processing",
				});

				const result = await this.processSingleTemplate(
					template,
					initialContent,
					maxLength,
				);

				this.processedTemplates.push(result);

				this.semaphore.release();
				return result;
			} catch (error) {
				const errorResult: TemplateResult = {
					type: template.type,
					path: template.path,
					length: 0,
					truncated: false,
					processingTime: Date.now() - this.startTime,
					error: String(error),
				};

				this.processedTemplates.push(errorResult);
				this.semaphore.release();
				return errorResult;
			}
		});

		const results = await Promise.all(processingPromises);

		// Combine results (simplified approach)
		let finalContent = initialContent;
		for (const templateResult of results) {
			if (!templateResult.error && templateResult.content) {
				finalContent = templateResult.content;
			}
		}

		// Final progress update
		onProgress?.({
			current: templates.length,
			total: templates.length,
			currentTemplate: "",
			stage: "complete",
		});

		return {
			content: finalContent,
			metadata: this.processedTemplates,
		};
	}

	private async processSingleTemplate(
		template: { type: TemplateType; path: string; match: string },
		content: string,
		maxLength: number,
	): Promise<TemplateResult> {
		const startTime = Date.now();

		try {
			// Import appropriate handler
			const handler = await this.getHandler(template.type);

			const { operationResults, combinedRemainingCount } = await handler(
				content,
				template.path,
				template.match,
				maxLength,
			);

			const processingTime = Date.now() - startTime;

			return {
				type: template.type,
				path: template.path,
				length: operationResults.length,
				truncated: combinedRemainingCount === 0,
				processingTime,
				content: operationResults,
			};
		} catch (error) {
			const processingTime = Date.now() - startTime;

			return {
				type: template.type,
				path: template.path,
				length: 0,
				truncated: false,
				processingTime,
				error: String(error),
			};
		}
	}

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
			case TemplateType.Glob: {
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
			default:
				throw new Error(`Unsupported template type: ${type}`);
		}
	}
}
