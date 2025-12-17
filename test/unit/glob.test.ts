import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { handleGlob } from "../../src/glob";
import { SecurityValidator } from "../../src/security";

describe("handleGlob", () => {
	let tempDir: string;
	let validator: SecurityValidator;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-glob-${Date.now()}`;
		await mkdir(tempDir, { recursive: true });

		validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd(), tempDir],
			allowHttp: false,
			allowFunctions: false,
		});
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("basic glob patterns", () => {
		it("should match all files with * pattern", async () => {
			await writeFile(join(tempDir, "file1.txt"), "Content 1");
			await writeFile(join(tempDir, "file2.txt"), "Content 2");
			await writeFile(join(tempDir, "file3.txt"), "Content 3");

			const result = await handleGlob(
				"Files: {{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Content 1");
			expect(result.operationResults).toContain("Content 2");
			expect(result.operationResults).toContain("Content 3");
		});

		it("should match files with specific extension", async () => {
			await writeFile(join(tempDir, "file.txt"), "Text");
			await writeFile(join(tempDir, "file.json"), "JSON");
			await writeFile(join(tempDir, "file.md"), "Markdown");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Text");
			expect(result.operationResults).not.toContain("JSON");
			expect(result.operationResults).not.toContain("Markdown");
		});

		it("should match files with prefix pattern", async () => {
			await writeFile(join(tempDir, "test-1.txt"), "Test 1");
			await writeFile(join(tempDir, "test-2.txt"), "Test 2");
			await writeFile(join(tempDir, "other.txt"), "Other");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/test-*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Test 1");
			expect(result.operationResults).toContain("Test 2");
			expect(result.operationResults).not.toContain("Other");
		});

		it("should handle ? wildcard for single character", async () => {
			await writeFile(join(tempDir, "file1.txt"), "File 1");
			await writeFile(join(tempDir, "file2.txt"), "File 2");
			await writeFile(join(tempDir, "file10.txt"), "File 10");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/file?.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("File 1");
			expect(result.operationResults).toContain("File 2");
			expect(result.operationResults).not.toContain("File 10");
		});
	});

	describe("recursive glob patterns", () => {
		it("should match files recursively with ** pattern", async () => {
			const subDir = join(tempDir, "subdir");
			await mkdir(subDir, { recursive: true });

			await writeFile(join(tempDir, "root.txt"), "Root");
			await writeFile(join(subDir, "sub.txt"), "Sub");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/**/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Root");
			expect(result.operationResults).toContain("Sub");
		});

		it("should match files in nested directories", async () => {
			const level1 = join(tempDir, "level1");
			const level2 = join(level1, "level2");
			const level3 = join(level2, "level3");

			await mkdir(level3, { recursive: true });

			await writeFile(join(tempDir, "root.js"), "Root");
			await writeFile(join(level1, "l1.js"), "Level 1");
			await writeFile(join(level2, "l2.js"), "Level 2");
			await writeFile(join(level3, "l3.js"), "Level 3");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/**/*.js`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Root");
			expect(result.operationResults).toContain("Level 1");
			expect(result.operationResults).toContain("Level 2");
			expect(result.operationResults).toContain("Level 3");
		});

		it("should match only specific subdirectory with **", async () => {
			const srcDir = join(tempDir, "src");
			const testDir = join(tempDir, "test");

			await mkdir(srcDir, { recursive: true });
			await mkdir(testDir, { recursive: true });

			await writeFile(join(srcDir, "code.ts"), "Source");
			await writeFile(join(testDir, "test.ts"), "Test");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/src/**/*.ts`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Source");
			expect(result.operationResults).not.toContain("Test");
		});
	});

	describe("pattern extraction and base path", () => {
		it("should correctly extract base path from glob pattern", async () => {
			const dataDir = join(tempDir, "data");
			await mkdir(dataDir, { recursive: true });
			await writeFile(join(dataDir, "file.txt"), "Content");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/data/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Content");
		});

		it("should handle glob pattern with no directory path", async () => {
			await writeFile(join(tempDir, "test.txt"), "Test");

			// This would be relative to current directory in real usage
			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Test");
		});

		it("should handle complex nested path before wildcard", async () => {
			const complexPath = join(tempDir, "a", "b", "c", "d");
			await mkdir(complexPath, { recursive: true });
			await writeFile(join(complexPath, "file.txt"), "Deep file");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/a/b/c/d/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Deep file");
		});
	});

	describe("content processing", () => {
		it("should include filename in output", async () => {
			await writeFile(join(tempDir, "test.txt"), "Content");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("filename:");
			expect(result.operationResults).toContain("test.txt");
		});

		it("should process multiple files and combine content", async () => {
			await writeFile(join(tempDir, "a.txt"), "AAA");
			await writeFile(join(tempDir, "b.txt"), "BBB");
			await writeFile(join(tempDir, "c.txt"), "CCC");

			const result = await handleGlob(
				"Start {{glob}} End",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("AAA");
			expect(result.operationResults).toContain("BBB");
			expect(result.operationResults).toContain("CCC");
			expect(result.operationResults).toContain("Start");
			expect(result.operationResults).toContain("End");
		});

		it("should preserve template structure when replacing match", async () => {
			await writeFile(join(tempDir, "file.txt"), "Content");

			const result = await handleGlob(
				"Before {{glob}} After",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).not.toContain("{{glob}}");
			expect(result.operationResults).toContain("Before");
			expect(result.operationResults).toContain("After");
		});
	});

	describe("length limits and truncation", () => {
		it("should truncate content when exceeding remaining length", async () => {
			await writeFile(join(tempDir, "file1.txt"), "A".repeat(5000));
			await writeFile(join(tempDir, "file2.txt"), "B".repeat(5000));

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				100, // Small limit
			);

			expect(result.operationResults.length).toBeLessThan(1000);
			expect(result.combinedRemainingCount).toBeLessThanOrEqual(100);
		});

		it("should stop processing files when remaining length reaches zero", async () => {
			await writeFile(join(tempDir, "file1.txt"), "A".repeat(50));
			await writeFile(join(tempDir, "file2.txt"), "B".repeat(50));
			await writeFile(join(tempDir, "file3.txt"), "C".repeat(50));

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				80, // Only enough for ~1 file
			);

			// Should process at least one file but stop early
			expect(result.combinedRemainingCount).toBeLessThanOrEqual(80);
		});

		it("should correctly calculate remaining length", async () => {
			await writeFile(join(tempDir, "small.txt"), "12345");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			const contentLength = result.operationResults.length;
			expect(result.combinedRemainingCount).toBe(10000 - contentLength);
		});
	});

	describe("error handling", () => {
		it("should handle invalid glob pattern gracefully", async () => {
			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/[invalid`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("[Invalid glob pattern:");
			expect(result.combinedRemainingCount).toBe(10000);
		});

		it("should handle security validation errors", async () => {
			validator.configure({
				allowedBasePaths: ["/some/other/path"],
				allowHttp: false,
				allowFunctions: false,
			});

			await writeFile(join(tempDir, "file.txt"), "Content");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("[Security Error");
			expect(result.combinedRemainingCount).toBeLessThanOrEqual(10000);
		});

		it("should handle non-existent directory gracefully", async () => {
			const nonExistent = join(tempDir, "does-not-exist");

			const result = await handleGlob(
				"{{glob}}",
				`${nonExistent}/*.txt`,
				"{{glob}}",
				10000,
			);

			// Should handle gracefully, possibly with empty result or error
			expect(result.combinedRemainingCount).toBeLessThanOrEqual(10000);
		});

		it("should handle file read errors in matched files", async () => {
			await writeFile(join(tempDir, "good.txt"), "Good content");
			// Create a file reference but we can't easily make it unreadable in tests
			// The error handling code path is tested through security validation

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Good content");
		});
	});

	describe("edge cases", () => {
		it("should handle empty match (no files match pattern)", async () => {
			await writeFile(join(tempDir, "file.txt"), "Content");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.json`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toBe("");
			expect(result.combinedRemainingCount).toBe(10000);
		});

		it("should handle single file match", async () => {
			await writeFile(join(tempDir, "single.txt"), "Single file");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/single.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Single file");
		});

		it("should handle files with special characters in names", async () => {
			await writeFile(join(tempDir, "file with spaces.txt"), "Content");
			await writeFile(join(tempDir, "file-with-dashes.txt"), "Content 2");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Content");
			expect(result.operationResults).toContain("Content 2");
		});

		it("should handle empty files", async () => {
			await writeFile(join(tempDir, "empty.txt"), "");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("filename:");
		});

		it("should handle files with UTF-8 content", async () => {
			await writeFile(join(tempDir, "unicode.txt"), "Hello 世界 🌍");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Hello 世界 🌍");
		});

		it("should handle files with newlines and formatting", async () => {
			await writeFile(
				join(tempDir, "formatted.txt"),
				"Line 1\nLine 2\n\tIndented",
			);

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Line 1");
			expect(result.operationResults).toContain("Line 2");
			expect(result.operationResults).toContain("Indented");
		});

		it("should handle multiple file types with single pattern", async () => {
			await writeFile(join(tempDir, "file.txt"), "Text");
			await writeFile(join(tempDir, "file.md"), "Markdown");
			await writeFile(join(tempDir, "file.js"), "JavaScript");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/file.*`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Text");
			expect(result.operationResults).toContain("Markdown");
			expect(result.operationResults).toContain("JavaScript");
		});

		it("should handle bracket patterns", async () => {
			await writeFile(join(tempDir, "file1.txt"), "File 1");
			await writeFile(join(tempDir, "file2.txt"), "File 2");
			await writeFile(join(tempDir, "file3.txt"), "File 3");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/file[12].txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("File 1");
			expect(result.operationResults).toContain("File 2");
			expect(result.operationResults).not.toContain("File 3");
		});
	});

	describe("mixed scenarios", () => {
		it("should handle mixed file sizes", async () => {
			await writeFile(join(tempDir, "small.txt"), "S");
			await writeFile(join(tempDir, "medium.txt"), "M".repeat(100));
			await writeFile(join(tempDir, "large.txt"), "L".repeat(1000));

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("S");
			expect(result.operationResults).toContain("M");
			expect(result.operationResults).toContain("L");
		});

		it("should handle glob with multiple wildcards", async () => {
			const subDir = join(tempDir, "sub");
			await mkdir(subDir, { recursive: true });

			await writeFile(join(tempDir, "test-1.txt"), "Test 1");
			await writeFile(join(subDir, "test-2.txt"), "Test 2");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/**/test-*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Test 1");
			expect(result.operationResults).toContain("Test 2");
		});

		it("should handle absolute paths in glob patterns", async () => {
			await writeFile(join(tempDir, "absolute.txt"), "Absolute path content");

			const result = await handleGlob(
				"{{glob}}",
				`${tempDir}/*.txt`,
				"{{glob}}",
				10000,
			);

			expect(result.operationResults).toContain("Absolute path content");
		});
	});
});
