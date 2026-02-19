import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";
import { type ShotputConfig, createConfig } from "../../src/config";
import { ParallelProcessor } from "../../src/parallelProcessor";
import { TemplateType } from "../../src/types";

describe("ParallelProcessor", () => {
	const originalFetch = global.fetch;
	const testConfig: ShotputConfig = createConfig({
		maxConcurrency: 4,
		allowHttp: true,
		allowedDomains: ["example.com", "api.example.com"],
		allowFunctions: true,
		allowedBasePaths: [process.cwd(), "/tmp"],
	});
	let processor: ParallelProcessor;

	beforeEach(() => {
		processor = new ParallelProcessor(testConfig);
	});

	afterEach(() => {
		mock.restore();
		global.fetch = originalFetch;
	});

	describe("constructor", () => {
		test("should create processor with provided config", () => {
			const config = createConfig();
			const p = new ParallelProcessor(config);
			expect(p).toBeDefined();
		});

		test("should use configuration values from the config object", () => {
			const config = createConfig({ maxConcurrency: 8, maxRetries: 5 });
			const p = new ParallelProcessor(config);
			expect(p).toBeDefined();
		});
	});

	describe("processTemplatesWithPlanning", () => {
		test("should return original content when no templates found", async () => {
			const content = "No templates here";
			const result = await processor.processTemplatesWithPlanning(
				content,
				process.cwd(),
				1000,
			);
			expect(result.content).toBe(content);
			expect(result.metadata).toHaveLength(0);
		});

		test("should process single file template", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const filePath = join(tempDir, "test.txt");
			fs.writeFileSync(filePath, "file content");

			const content = `{{${filePath}}}`;
			const result = await processor.processTemplatesWithPlanning(
				content,
				tempDir,
				1000,
			);

			expect(result.content).toContain("file content");
			expect(result.metadata).toHaveLength(1);
			expect(result.metadata[0].path).toBe(filePath);

			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		test("should process multiple templates in parallel", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const f1 = join(tempDir, "1.txt");
			const f2 = join(tempDir, "2.txt");
			fs.writeFileSync(f1, "content 1");
			fs.writeFileSync(f2, "content 2");

			const content = `{{${f1}}} {{${f2}}}`;
			const result = await processor.processTemplatesWithPlanning(
				content,
				tempDir,
				1000,
			);

			expect(result.content).toContain("content 1");
			expect(result.content).toContain("content 2");
			expect(result.metadata).toHaveLength(2);

			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		test("should respect max length constraints", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const filePath = join(tempDir, "large.txt");
			fs.writeFileSync(filePath, "A".repeat(100));

			const content = `{{${filePath}}}`;
			// Set a small max length
			const result = await processor.processTemplatesWithPlanning(
				content,
				tempDir,
				10,
			);

			// When a file is skipped due to length constraints, it's not included in metadata
			expect(result.metadata.length).toBe(0);
			// The content should not include the file content
			expect(result.content).not.toContain("A".repeat(100));

			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		test("should call progress callback during processing", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const filePath = join(tempDir, "test.txt");
			fs.writeFileSync(filePath, "content");

			const content = `{{${filePath}}}`;
			const progressUpdates: unknown[] = [];
			const onProgress = (progress: unknown) => progressUpdates.push(progress);

			await processor.processTemplatesWithPlanning(
				content,
				tempDir,
				1000,
				onProgress,
			);

			expect(progressUpdates.length).toBeGreaterThan(0);
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe("priority calculation", () => {
		test("should maintain relative order of templates in final content", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const f1 = join(tempDir, "a.txt");
			const f2 = join(tempDir, "b.txt");
			// Use unique markers that cannot appear in mkdtemp random paths
			// (A/B can appear in suffix e.g. aBc123, causing indexOf to hit the path)
			const marker1 = "===FIRST_TEMPLATE===";
			const marker2 = "===SECOND_TEMPLATE===";
			fs.writeFileSync(f1, marker1);
			fs.writeFileSync(f2, marker2);

			const content = `{{${f1}}} {{${f2}}}`;
			// Use maxConcurrency: 1 so completion order matches document order and the test is deterministic
			const orderProcessor = new ParallelProcessor(
				createConfig({ ...testConfig, maxConcurrency: 1 }),
			);
			const result = await orderProcessor.processTemplatesWithPlanning(
				content,
				tempDir,
				1000,
			);

			expect(result.content).toContain(marker1);
			expect(result.content).toContain(marker2);
			expect(result.content.indexOf(marker1)).toBeLessThan(
				result.content.indexOf(marker2),
			);

			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe("content length estimation", () => {
		test("should estimate file size correctly", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const filePath = join(tempDir, "size.txt");
			const text = "1234567890";
			fs.writeFileSync(filePath, text);

			const content = `{{${filePath}}}`;
			const result = await processor.processTemplatesWithPlanning(
				content,
				tempDir,
				1000,
			);

			expect(result.metadata[0].length).toBeGreaterThanOrEqual(text.length);

			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		test("should handle HTTP HEAD requests for content length", async () => {
			global.fetch = mock(() =>
				Promise.resolve({
					ok: true,
					headers: new Headers({ "content-length": "100" }),
					text: () => Promise.resolve("mocked content"),
				}),
			) as unknown as typeof fetch;

			const content = "{{https://example.com/data}}";
			const result = await processor.processTemplatesWithPlanning(
				content,
				process.cwd(),
				1000,
			);

			expect(result.metadata[0].type).toBe(TemplateType.Http);
		});
	});

	describe("retry logic", () => {
		test("should retry failed operations with exponential backoff", async () => {
			let attempts = 0;
			global.fetch = mock(() => {
				attempts++;
				if (attempts < 2) return Promise.reject(new Error("Network failure"));
				return Promise.resolve({
					ok: true,
					headers: new Headers({ "content-length": "10" }),
					text: () => Promise.resolve("success"),
				});
			}) as unknown as typeof fetch;

			const config = createConfig({
				...testConfig,
				maxRetries: 2,
				retryDelay: 10,
			});
			const retryProcessor = new ParallelProcessor(config);

			const content = "{{https://example.com/retry}}";
			const result = await retryProcessor.processTemplatesWithPlanning(
				content,
				process.cwd(),
				1000,
			);

			expect(attempts).toBe(2);
			expect(result.content).toContain("success");
		});
	});

	describe("error handling", () => {
		test("should handle invalid template types gracefully", async () => {
			const content = "{{unknown://something}}";
			const result = await processor.processTemplatesWithPlanning(
				content,
				process.cwd(),
				1000,
			);
			expect(result.metadata[0].error).toBeDefined();
		});

		test("should continue processing after individual template failures", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const f1 = join(tempDir, "exists.txt");
			fs.writeFileSync(f1, "i exist");

			const content = `{{${f1}}} {{${join(tempDir, "missing.txt")}}}`;
			const result = await processor.processTemplatesWithPlanning(
				content,
				tempDir,
				1000,
			);

			expect(result.content).toContain("i exist");
			expect(result.metadata).toHaveLength(2);

			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe("path resolution", () => {
		test("should resolve relative paths correctly", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			fs.writeFileSync(join(tempDir, "rel.txt"), "relative content");

			const result = await processor.processTemplatesWithPlanning(
				"{{rel.txt}}",
				tempDir,
				1000,
			);
			expect(result.content).toContain("relative content");

			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe("metadata collection", () => {
		test("should include required fields in metadata", async () => {
			const tempDir = fs.mkdtempSync(join("/tmp", "shotput-test-"));
			const filePath = join(tempDir, "meta.txt");
			fs.writeFileSync(filePath, "content");

			const content = `{{${filePath}}}`;
			const result = await processor.processTemplatesWithPlanning(
				content,
				tempDir,
				1000,
			);

			const meta = result.metadata[0];
			expect(meta.path).toBe(filePath);
			expect(meta.type).toBe(TemplateType.File);
			expect(meta.length).toBeGreaterThan(0);
			expect(meta.processingTime).toBeGreaterThanOrEqual(0);

			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});
});
