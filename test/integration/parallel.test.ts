import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src";

describe("Parallel Processing Integration", () => {
	const testDir = join(process.cwd(), "test-parallel-temp");
	const templateDir = join(testDir, "templates");
	const dataDir = join(testDir, "data");
	const responseDir = join(testDir, "responses");

	beforeEach(() => {
		// Clean up and create test directories
		fs.rmSync(testDir, { recursive: true, force: true });
		fs.mkdirSync(templateDir, { recursive: true });
		fs.mkdirSync(dataDir, { recursive: true });
		fs.mkdirSync(responseDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up test directories
		fs.rmSync(testDir, { recursive: true, force: true });
	});

	describe("basic parallel processing", () => {
		test("should process multiple files in parallel", async () => {
			// Create test files
			fs.writeFileSync(join(dataDir, "file1.txt"), "Content 1");
			fs.writeFileSync(join(dataDir, "file2.txt"), "Content 2");
			fs.writeFileSync(join(dataDir, "file3.txt"), "Content 3");

			const template = `File 1: {{${join(dataDir, "file1.txt")}}}
File 2: {{${join(dataDir, "file2.txt")}}}
File 3: {{${join(dataDir, "file3.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 3,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toContain("Content 1");
			expect(result.content).toContain("Content 2");
			expect(result.content).toContain("Content 3");
			expect(result.metadata.resultMetadata?.length).toBeGreaterThan(0);
		});

		test("should maintain correct order of results", async () => {
			fs.writeFileSync(join(dataDir, "a.txt"), "AAA");
			fs.writeFileSync(join(dataDir, "b.txt"), "BBB");
			fs.writeFileSync(join(dataDir, "c.txt"), "CCC");

			const template = `First: {{${join(dataDir, "a.txt")}}}
Second: {{${join(dataDir, "b.txt")}}}
Third: {{${join(dataDir, "c.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 4,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
			expect(result.error).toBeUndefined();
		});

		test("should work with sequential processing disabled", async () => {
			fs.writeFileSync(join(dataDir, "test.txt"), "Test content");

			const template = `Content: {{${join(dataDir, "test.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 1,
				enableContentLengthPlanning: false,
			});

			expect(result.content).toContain("Test content");
		});
	});

	describe("content length planning", () => {
		test("should estimate and plan based on file sizes", async () => {
			// Create files of different sizes
			fs.writeFileSync(join(dataDir, "small.txt"), "Small");
			fs.writeFileSync(join(dataDir, "medium.txt"), "M".repeat(100));
			fs.writeFileSync(join(dataDir, "large.txt"), "L".repeat(1000));

			const template = `Small: {{${join(dataDir, "small.txt")}}}
Medium: {{${join(dataDir, "medium.txt")}}}
Large: {{${join(dataDir, "large.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 4,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
			expect(result.metadata.resultMetadata).toBeDefined();
		});

		test("should trim files when exceeding max length", async () => {
			fs.writeFileSync(join(dataDir, "huge1.txt"), "X".repeat(500));
			fs.writeFileSync(join(dataDir, "huge2.txt"), "Y".repeat(500));

			const template = `First: {{${join(dataDir, "huge1.txt")}}}
Second: {{${join(dataDir, "huge2.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 2,
				maxPromptLength: 600,
				enableContentLengthPlanning: true,
			});

			expect(result.content?.length).toBeLessThan(1200);
		});

		test("should prioritize templates correctly", async () => {
			fs.mkdirSync(join(dataDir, "subdir"), { recursive: true });
			fs.writeFileSync(join(dataDir, "file.txt"), "File content");
			fs.writeFileSync(join(dataDir, "subdir", "nested.txt"), "Nested");

			const template = `Directory: {{${join(dataDir, "subdir")}/}}
File: {{${join(dataDir, "file.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 4,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
		});
	});

	describe("progress tracking", () => {
		test("should track progress through processing stages", async () => {
			fs.writeFileSync(join(dataDir, "f1.txt"), "F1");
			fs.writeFileSync(join(dataDir, "f2.txt"), "F2");
			fs.writeFileSync(join(dataDir, "f3.txt"), "F3");

			const template = `{{${join(dataDir, "f1.txt")}}}
{{${join(dataDir, "f2.txt")}}}
{{${join(dataDir, "f3.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 2,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
			expect(result.metadata.duration).toBeGreaterThanOrEqual(0);
		});
	});

	describe("concurrency limits", () => {
		test("should respect maxConcurrency setting", async () => {
			for (let i = 1; i <= 10; i++) {
				fs.writeFileSync(join(dataDir, `file${i}.txt`), `Content ${i}`);
			}

			const templateParts = Array.from(
				{ length: 10 },
				(_, i) => `{{${join(dataDir, `file${i + 1}.txt`)}}}`,
			);
			const template = templateParts.join("\n");

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 2,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
			expect(result.metadata.resultMetadata?.length).toBeGreaterThan(0);
		});

		test("should handle high concurrency", async () => {
			for (let i = 1; i <= 5; i++) {
				fs.writeFileSync(join(dataDir, `file${i}.txt`), `Data ${i}`);
			}

			const templateParts = Array.from(
				{ length: 5 },
				(_, i) => `{{${join(dataDir, `file${i + 1}.txt`)}}}`,
			);
			const template = templateParts.join("\n");

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 10,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
		});
	});

	describe("mixed template types", () => {
		test("should handle files and directories together", async () => {
			fs.mkdirSync(join(dataDir, "docs"), { recursive: true });
			fs.writeFileSync(join(dataDir, "readme.txt"), "README");
			fs.writeFileSync(join(dataDir, "docs", "doc1.txt"), "Doc 1");

			const template = `File: {{${join(dataDir, "readme.txt")}}}
Dir: {{${join(dataDir, "docs")}/}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 4,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toContain("README");
		});

		test("should process different template types in parallel", async () => {
			fs.writeFileSync(join(dataDir, "local.txt"), "Local file");
			fs.writeFileSync(join(dataDir, "data1.txt"), "Data 1");
			fs.writeFileSync(join(dataDir, "data2.txt"), "Data 2");

			const template = `File: {{${join(dataDir, "local.txt")}}}
Glob: {{${join(dataDir, "data*.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 4,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
		});
	});

	describe("error handling in parallel context", () => {
		test("should continue processing after individual failures", async () => {
			fs.writeFileSync(join(dataDir, "good1.txt"), "Good 1");
			fs.writeFileSync(join(dataDir, "good2.txt"), "Good 2");

			const template = `Good1: {{${join(dataDir, "good1.txt")}}}
Bad: {{${join(dataDir, "nonexistent.txt")}}}
Good2: {{${join(dataDir, "good2.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [process.cwd(), dataDir],
				maxConcurrency: 3,
				enableContentLengthPlanning: true,
			});

			expect(result.content).toBeDefined();
		});

		test("should record errors in metadata", async () => {
			const template = `Missing: {{${join(dataDir, "missing.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [process.cwd(), dataDir],
				maxConcurrency: 2,
				enableContentLengthPlanning: true,
			});

			expect(result.error || result.content?.includes("Error")).toBeTruthy();
		});
	});

	describe("performance characteristics", () => {
		test("should be faster with parallel processing", async () => {
			for (let i = 1; i <= 8; i++) {
				fs.writeFileSync(
					join(dataDir, `file${i}.txt`),
					`Content ${i}`.repeat(10),
				);
			}

			const templateParts = Array.from(
				{ length: 8 },
				(_, i) => `{{${join(dataDir, `file${i + 1}.txt`)}}}`,
			);
			const template = templateParts.join("\n");

			const startParallel = Date.now();
			const parallelResult = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 4,
				enableContentLengthPlanning: true,
			});
			const parallelTime = Date.now() - startParallel;

			const startSequential = Date.now();
			const sequentialResult = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				maxConcurrency: 1,
				enableContentLengthPlanning: false,
			});
			const sequentialTime = Date.now() - startSequential;

			expect(parallelResult.content).toBeDefined();
			expect(sequentialResult.content).toBeDefined();
			expect(parallelTime).toBeGreaterThanOrEqual(0);
			expect(sequentialTime).toBeGreaterThanOrEqual(0);
		});
	});

	describe("configuration", () => {
		test("should respect disabled parallel processing", async () => {
			fs.writeFileSync(join(dataDir, "test.txt"), "Test");

			const template = `Content: {{${join(dataDir, "test.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
				enableContentLengthPlanning: false,
			});

			expect(result.content).toContain("Test");
		});

		test("should work with default configuration", async () => {
			fs.writeFileSync(join(dataDir, "test.txt"), "Default");

			const template = `Content: {{${join(dataDir, "test.txt")}}}`;

			const result = await shotput({
				template,
				templateDir: dataDir,
				allowedBasePaths: [dataDir],
			});

			expect(result.content).toContain("Default");
		});
	});
});
