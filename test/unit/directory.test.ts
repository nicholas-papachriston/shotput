import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createConfig } from "../../src/config";
import { ensureDirectoryExists, handleDirectory } from "../../src/directory";

describe("directory", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = join(process.cwd(), `test-temp-directory-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("ensureDirectoryExists", () => {
		it("should create a directory if it does not exist", async () => {
			const newDir = join(tempDir, "new-directory");
			await ensureDirectoryExists(newDir, tempDir);

			// Directory should exist now
			const testFile = join(newDir, "test.txt");
			await writeFile(testFile, "test");
			const exists = await Bun.file(testFile).exists();
			expect(exists).toBe(true);
		});

		it("should not throw error if directory already exists", async () => {
			const existingDir = join(tempDir, "existing");
			await mkdir(existingDir, { recursive: true });

			// Should not throw
			await ensureDirectoryExists(existingDir, tempDir);
			// If we get here without throwing, the test passes
			expect(true).toBe(true);
		});

		it("should handle nested directory creation", async () => {
			const nestedDir = join(tempDir, "level1", "level2", "level3");
			await ensureDirectoryExists(nestedDir, tempDir);

			const testFile = join(nestedDir, "test.txt");
			await writeFile(testFile, "test");
			const exists = await Bun.file(testFile).exists();
			expect(exists).toBe(true);
		});
	});

	describe("handleDirectory", () => {
		const testConfig = createConfig({
			allowedBasePaths: [process.cwd(), "/tmp"],
		});

		it("should process all files in a directory", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "file1.txt"), "Content 1");
			await writeFile(join(tempDir, "file2.txt"), "Content 2");

			const result = await handleDirectory(
				config,
				"Start {{dir}} End",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Content 1");
			expect(result.operationResults).toContain("Content 2");
			expect(result.operationResults).toContain("Start");
			expect(result.operationResults).toContain("End");
			expect(result.operationResults).not.toContain("{{dir}}");
		});

		it("should process files recursively in subdirectories", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			const subDir = join(tempDir, "subdir");
			await mkdir(subDir, { recursive: true });

			await writeFile(join(tempDir, "root.txt"), "Root content");
			await writeFile(join(subDir, "sub.txt"), "Sub content");

			const result = await handleDirectory(
				config,
				"Files: {{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Root content");
			expect(result.operationResults).toContain("Sub content");
		});

		it("should include filename in output", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "test.txt"), "Test content");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("filename:");
			expect(result.operationResults).toContain("test.txt");
		});

		it("should handle empty directory", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			const emptyDir = join(tempDir, "empty");
			await mkdir(emptyDir, { recursive: true });

			const result = await handleDirectory(
				config,
				"Empty: {{dir}}",
				emptyDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toBe("Empty: ");
			expect(result.combinedRemainingCount).toBe(10000);
		});

		it("should truncate content when reaching length limit", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "file1.txt"), "A".repeat(5000));
			await writeFile(join(tempDir, "file2.txt"), "B".repeat(5000));

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				100, // Small limit
			);

			expect(result.operationResults.length).toBeLessThan(1000);
			expect(result.combinedRemainingCount).toBeLessThanOrEqual(100);
		});

		it("should stop processing when remaining length reaches zero", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "file1.txt"), "A".repeat(50));
			await writeFile(join(tempDir, "file2.txt"), "B".repeat(50));
			await writeFile(join(tempDir, "file3.txt"), "C".repeat(50));

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				80, // Only enough for ~1 file (or less if path prefix is long)
			);

			// Should have produced some output and respected the budget
			expect(result.operationResults.length).toBeGreaterThan(0);
			expect(result.combinedRemainingCount).toBeLessThanOrEqual(80);
			// Not all three file bodies should appear (would require > 80 bytes after path prefixes)
			const hasA = result.operationResults.includes("A");
			const hasB = result.operationResults.includes("B");
			const hasC = result.operationResults.includes("C");
			expect(hasA && hasB && hasC).toBe(false);
		});

		it("should handle security validation errors", async () => {
			const restrictedConfig = createConfig({
				allowedBasePaths: ["/some/other/path"],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = await handleDirectory(
				restrictedConfig,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("[Security Error:");
			expect(result.combinedRemainingCount).toBe(10000);
		});

		it("should handle non-existent directory", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			const nonExistent = join(tempDir, "does-not-exist");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				nonExistent,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("[Error processing directory");
			expect(result.combinedRemainingCount).toBe(10000);
		});

		it("should handle directory with multiple file types", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "file.txt"), "Text");
			await writeFile(join(tempDir, "file.json"), '{"key": "value"}');
			await writeFile(join(tempDir, "file.md"), "# Markdown");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Text");
			expect(result.operationResults).toContain('"key": "value"');
			expect(result.operationResults).toContain("# Markdown");
		});

		it("should handle files with special characters in names", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "file with spaces.txt"), "Content");
			await writeFile(join(tempDir, "file-with-dashes.txt"), "Content 2");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Content");
			expect(result.operationResults).toContain("Content 2");
		});

		it("should handle nested directory structure", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			const level1 = join(tempDir, "level1");
			const level2 = join(level1, "level2");
			const level3 = join(level2, "level3");

			await mkdir(level3, { recursive: true });

			await writeFile(join(tempDir, "root.txt"), "Root");
			await writeFile(join(level1, "l1.txt"), "Level 1");
			await writeFile(join(level2, "l2.txt"), "Level 2");
			await writeFile(join(level3, "l3.txt"), "Level 3");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Root");
			expect(result.operationResults).toContain("Level 1");
			expect(result.operationResults).toContain("Level 2");
			expect(result.operationResults).toContain("Level 3");
		});

		it("should preserve original template structure", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "file.txt"), "Content");

			const result = await handleDirectory(
				config,
				"Before {{dir}} After",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Before");
			expect(result.operationResults).toContain("After");
			expect(result.operationResults).toContain("Content");
		});

		it("should handle files with UTF-8 content", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "unicode.txt"), "Hello 世界 🌍");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Hello 世界 🌍");
		});

		it("should handle files with newlines and special formatting", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(
				join(tempDir, "formatted.txt"),
				"Line 1\nLine 2\n\tIndented",
			);

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Line 1");
			expect(result.operationResults).toContain("Line 2");
			expect(result.operationResults).toContain("Indented");
		});

		it("should correctly calculate remaining length", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "file1.txt"), "12345");
			await writeFile(join(tempDir, "file2.txt"), "67890");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			const contentLength = result.operationResults.length;
			expect(result.combinedRemainingCount).toBe(10000 - contentLength);
		});

		it("should handle directory with only subdirectories (no files)", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			const sub1 = join(tempDir, "sub1");
			const sub2 = join(tempDir, "sub2");
			await mkdir(sub1, { recursive: true });
			await mkdir(sub2, { recursive: true });

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toBe("");
			expect(result.combinedRemainingCount).toBe(10000);
		});

		it("should handle mixed content with empty and non-empty files", async () => {
			const config = createConfig({
				...testConfig,
				allowedBasePaths: [...testConfig.allowedBasePaths, tempDir],
			});
			await writeFile(join(tempDir, "empty.txt"), "");
			await writeFile(join(tempDir, "content.txt"), "Has content");

			const result = await handleDirectory(
				config,
				"{{dir}}",
				tempDir,
				"{{dir}}",
				10000,
			);

			expect(result.operationResults).toContain("Has content");
		});
	});
});
