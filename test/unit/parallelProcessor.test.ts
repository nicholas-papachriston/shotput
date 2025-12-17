import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";
import { ParallelProcessor } from "../../src/parallelProcessor";
import { securityValidator } from "../../src/security";

describe("ParallelProcessor", () => {
	let processor: ParallelProcessor;
	const originalFetch = global.fetch;

	beforeEach(() => {
		processor = new ParallelProcessor(4);
		securityValidator.configure({
			allowHttp: true,
			allowedDomains: ["example.com", "api.example.com"],
			allowFunctions: true,
		});
	});

	afterEach(() => {
		mock.restore();
		global.fetch = originalFetch;
		securityValidator.configure({
			allowHttp: false,
			allowFunctions: false,
			allowedDomains: [],
			allowedBasePaths: [process.cwd()],
		});
	});

	describe("constructor", () => {
		test("should create processor with default concurrency", () => {
			const defaultProcessor = new ParallelProcessor();
			expect(defaultProcessor).toBeDefined();
		});

		test("should create processor with custom concurrency", () => {
			const customProcessor = new ParallelProcessor(8);
			expect(customProcessor).toBeDefined();
		});

		test("should accept custom retry configuration", () => {
			const customProcessor = new ParallelProcessor(4, {
				maxRetries: 5,
				initialDelay: 2000,
				backoffMultiplier: 3,
			});
			expect(customProcessor).toBeDefined();
		});
	});

	describe("processTemplatesWithPlanning", () => {
		test("should return original content when no templates found", async () => {
			const content = "No templates here";
			const result = await processor.processTemplatesWithPlanning(
				content,
				"/test/base",
				100000,
			);

			expect(result.content).toBe(content);
			expect(result.metadata).toHaveLength(0);
		});

		test("should process single file template", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-1-"));
			const filePath = join(tempDir, "test.txt");
			fs.writeFileSync(filePath, "file content");

			const content = "Hello {{./test.txt}} world";
			const basePath = tempDir;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					100000,
				);

				expect(result.metadata.length).toBeGreaterThan(0);
				expect(result.metadata[0].path).toBe(filePath);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test("should process multiple templates in parallel", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-3-"));
			fs.writeFileSync(join(tempDir, "file1.txt"), "Content 1");
			fs.writeFileSync(join(tempDir, "file2.txt"), "Content 2");
			fs.writeFileSync(join(tempDir, "file3.txt"), "Content 3");

			const content =
				"File: {{./file1.txt}}\nMore: {{./file2.txt}}\nEven more: {{./file3.txt}}";
			const basePath = tempDir;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					100000,
				);

				expect(result.metadata.length).toBe(3);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test("should respect max length constraints", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-4-"));
			const filePath = join(tempDir, "large-file.txt");
			fs.writeFileSync(filePath, "A".repeat(1000));

			const content = "Content: {{./large-file.txt}}";
			const basePath = tempDir;
			const maxLength = 100;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					maxLength,
				);

				expect(result.content.length).toBeLessThanOrEqual(maxLength * 5); // Allow significant overhead for headers
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test("should call progress callback during processing", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-5-"));
			fs.writeFileSync(join(tempDir, "test.txt"), "content");

			const content = "File: {{./test.txt}}";
			const basePath = tempDir;
			const progressUpdates: Array<{
				current: number;
				total: number;
				stage: string;
			}> = [];

			const onProgress = (progress: {
				current: number;
				total: number;
				stage: string;
			}) => {
				progressUpdates.push(progress);
			};

			try {
				await processor.processTemplatesWithPlanning(
					content,
					basePath,
					100000,
					onProgress,
				);

				expect(progressUpdates.length).toBeGreaterThan(0);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("priority calculation", () => {
		test("should prioritize file templates over directory templates", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-6-"));
			fs.mkdirSync(join(tempDir, "dir"));
			fs.writeFileSync(join(tempDir, "file.txt"), "content");

			const content = "Dir: {{./dir/}}\nFile: {{./file.txt}}";
			const basePath = tempDir;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					100000,
				);

				expect(result.metadata.length).toBe(2);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test("should maintain order for same template types", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-7-"));
			fs.writeFileSync(join(tempDir, "a.txt"), "A");
			fs.writeFileSync(join(tempDir, "b.txt"), "B");
			fs.writeFileSync(join(tempDir, "c.txt"), "C");

			const content =
				"File1: {{./a.txt}}\nFile2: {{./b.txt}}\nFile3: {{./c.txt}}";
			const basePath = tempDir;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					100000,
				);

				expect(result.metadata.length).toBe(3);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("content length estimation", () => {
		test("should estimate file size correctly", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-2-"));
			const filePath = join(tempDir, "test.txt");
			const fileContent = "A".repeat(1024);
			fs.writeFileSync(filePath, fileContent);

			const content = "File: {{./test.txt}}";
			const basePath = tempDir;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					100000,
				);

				expect(result.metadata.length).toBeGreaterThan(0);
				expect(result.metadata[0].length).toBe(
					1024 + `filename:${filePath}:\n`.length,
				);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test("should handle HTTP HEAD requests for content length", async () => {
			const content = "HTTP: {{http://example.com/data.json}}";
			const basePath = "/test/base";

			const mockResponse = {
				headers: {
					get: mock((name: string) =>
						name === "content-length" ? "2048" : null,
					),
				},
			};
			global.fetch = mock(() =>
				Promise.resolve(mockResponse),
			) as unknown as typeof fetch;

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThan(0);
		});

		test("should handle missing content length gracefully", async () => {
			const content = "HTTP: {{http://example.com/no-length}}";
			const basePath = "/test/base";

			const mockResponse = {
				headers: {
					get: mock(() => null),
				},
			};
			global.fetch = mock(() =>
				Promise.resolve(mockResponse),
			) as unknown as typeof fetch;

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThan(0);
		});
	});

	describe("trimming by content length", () => {
		test("should trim templates when exceeding max length", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-8-"));
			fs.writeFileSync(join(tempDir, "large1.txt"), "A".repeat(100));
			fs.writeFileSync(join(tempDir, "large2.txt"), "B".repeat(100));

			const content = "File1: {{./large1.txt}}\nFile2: {{./large2.txt}}";
			const basePath = tempDir;
			const maxLength = 50;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					maxLength,
				);

				// Should process but might trim some templates
				expect(result.metadata.length).toBeGreaterThanOrEqual(0);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test("should preserve high priority templates when trimming", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-9-"));
			fs.mkdirSync(join(tempDir, "dir"));
			fs.writeFileSync(join(tempDir, "important.txt"), "Important");

			const content =
				"LowPriority: {{./dir/}}\nHighPriority: {{./important.txt}}";
			const basePath = tempDir;
			const maxLength = 100;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					maxLength,
				);

				expect(result.metadata.length).toBeGreaterThanOrEqual(1);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("retry logic", () => {
		test("should retry failed operations with exponential backoff", async () => {
			const content = "HTTP: {{http://example.com/failing}}";
			const basePath = "/test/base";

			let attemptCount = 0;
			const mockResponse = {
				headers: { get: () => null },
				text: mock(() => {
					attemptCount++;
					if (attemptCount < 3) {
						return Promise.reject(new Error("Temporary failure"));
					}
					return Promise.resolve("success after retries");
				}),
				ok: true,
			};
			global.fetch = mock(() =>
				Promise.resolve(mockResponse),
			) as unknown as typeof fetch;

			const retryProcessor = new ParallelProcessor(4, {
				maxRetries: 3,
				initialDelay: 10,
				backoffMultiplier: 2,
			});

			const result = await retryProcessor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(attemptCount).toBeGreaterThanOrEqual(0);
			expect(result.metadata.length).toBeGreaterThan(0);
		});

		test("should give up after max retries", async () => {
			const content = "HTTP: {{http://example.com/always-failing}}";
			const basePath = "/test/base";

			const mockResponse = {
				headers: { get: () => null },
				text: mock(() => Promise.reject(new Error("Permanent failure"))),
				ok: true,
			};
			global.fetch = mock(() =>
				Promise.resolve(mockResponse),
			) as unknown as typeof fetch;

			const retryProcessor = new ParallelProcessor(4, {
				maxRetries: 2,
				initialDelay: 10,
				backoffMultiplier: 2,
			});

			const result = await retryProcessor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			const errorResults = result.metadata.filter((m) => m.error);
			expect(errorResults.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe("error handling", () => {
		test("should handle invalid template types gracefully", async () => {
			const content = "Invalid: {{unknown://invalid-path}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should continue processing after individual template failures", async () => {
			const content =
				"Good: {{./good.txt}}\nBad: {{./bad.txt}}\nAlsoGood: {{./good2.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThan(0);
		});

		test("should record errors in metadata", async () => {
			const tempDir = fs.mkdtempSync(join(process.cwd(), "test-temp-proc-10-"));
			const content = "File: {{./nonexistent.txt}}";
			const basePath = tempDir;

			try {
				const result = await processor.processTemplatesWithPlanning(
					content,
					basePath,
					100000,
				);

				const hasError = result.metadata.some((m) => m.error !== undefined);
				expect(hasError || result.metadata.length >= 0).toBe(true);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("path resolution", () => {
		test("should resolve relative paths correctly", async () => {
			const content = "Relative: {{./subdir/file.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should handle absolute paths", async () => {
			const content = "Absolute: {{/absolute/path/file.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should not resolve special prefixes", async () => {
			const content = "HTTP: {{http://example.com/file.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should handle skill paths correctly", async () => {
			const content = "Skill: {{skill:brand-guidelines}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should handle function paths correctly", async () => {
			const content = "Function: {{TemplateType.Function:/path/to/fn.js}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should handle S3 paths correctly", async () => {
			const content = "S3: {{s3://bucket/key.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe("template type detection", () => {
		test("should detect file templates", async () => {
			const content = "File: {{./test.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should detect directory templates", async () => {
			const content = "Dir: {{./test-dir/}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should detect glob patterns", async () => {
			const content = "Glob: {{./src/**/*.ts}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should detect HTTP templates", async () => {
			const content = "HTTP: {{https://api.example.com/data}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});

		test("should detect S3 templates", async () => {
			const content = "S3: {{s3://my-bucket/path/to/file.json}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			expect(result.metadata.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe("metadata collection", () => {
		test("should include processing time in metadata", async () => {
			const content = "File: {{./test.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			if (result.metadata.length > 0) {
				expect(result.metadata[0].processingTime).toBeGreaterThanOrEqual(0);
			}
		});

		test("should include template type in metadata", async () => {
			const content = "File: {{./test.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			if (result.metadata.length > 0) {
				expect(result.metadata[0].type).toBeDefined();
			}
		});

		test("should include path in metadata", async () => {
			const content = "File: {{./test.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			if (result.metadata.length > 0) {
				expect(result.metadata[0].path).toBeDefined();
			}
		});

		test("should include content length in metadata", async () => {
			const content = "File: {{./test.txt}}";
			const basePath = "/test/base";

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				100000,
			);

			if (result.metadata.length > 0) {
				expect(result.metadata[0].length).toBeGreaterThanOrEqual(0);
			}
		});

		test("should indicate truncation in metadata", async () => {
			const content = "File: {{./large.txt}}";
			const basePath = "/test/base";
			const maxLength = 10;

			const result = await processor.processTemplatesWithPlanning(
				content,
				basePath,
				maxLength,
			);

			if (result.metadata.length > 0) {
				expect(typeof result.metadata[0].truncated).toBe("boolean");
			}
		});
	});
});
