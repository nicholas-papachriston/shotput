import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { handleFile } from "../../src/file";

// Threshold for streaming (must match the value in file.ts)
const STREAM_THRESHOLD_BYTES = 1024 * 1024; // 1MB

describe("handleFile", () => {
	const testConfig = createConfig({
		allowedBasePaths: [process.cwd()],
		allowHttp: true,
		allowFunctions: false,
	});

	it("should successfully process a valid file", async () => {
		const result = "Hello {{test/fixtures/test.txt}}!";
		const path = "test/fixtures/test.txt";
		const match = "{{test/fixtures/test.txt}}";
		const remainingLength = 1000;

		const response = await handleFile(
			testConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Hello filename:");
		expect(response.operationResults).toContain("Hello World!");
		expect(response.operationResults).toContain("This is a test file");
		expect(response.combinedRemainingCount).toBeGreaterThan(0);
	});

	it("should handle file not found", async () => {
		const result = "Hello {{test/fixtures/nonexistent.txt}}!";
		const path = "test/fixtures/nonexistent.txt";
		const match = "{{test/fixtures/nonexistent.txt}}";
		const remainingLength = 1000;

		const response = await handleFile(
			testConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Error reading");
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should truncate content when length limit is reached", async () => {
		const result = "Start {{large-file.txt}} End";
		const path = "test/fixtures/large-file.txt";
		const match = "{{test/fixtures/large-file.txt}}";
		const remainingLength = 50; // Very small limit

		const response = await handleFile(
			testConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.combinedRemainingCount).toBe(0);
		expect(response.operationResults.length).toBeLessThan(
			result.length + remainingLength,
		);
	});

	it("should block path traversal attempts", async () => {
		const result = "Hello {{../../../etc/passwd}}!";
		const path = "../../../etc/passwd";
		const match = "{{../../../etc/passwd}}";
		const remainingLength = 1000;

		const response = await handleFile(
			testConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Security Error:");
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should block paths outside allowed base paths", async () => {
		const result = "Hello {{/etc/passwd}}!";
		const path = "/etc/passwd";
		const match = "{{/etc/passwd}}";
		const remainingLength = 1000;

		const response = await handleFile(
			testConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Security Error:");
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should handle zero remaining length", async () => {
		const result = "Hello {{test/fixtures/test.txt}}!";
		const path = "test/fixtures/test.txt";
		const match = "{{test/fixtures/test.txt}}";
		const remainingLength = 0;

		const response = await handleFile(
			testConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Hello !");
		expect(response.combinedRemainingCount).toBe(0);
	});
});

describe("handleFile with large files (streaming)", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-largefile-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;
	});

	afterEach(async () => {
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should use streaming for files larger than threshold", async () => {
		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		// Create a file larger than 1MB
		const largeContent = "x".repeat(STREAM_THRESHOLD_BYTES + 1000);
		await Bun.write(`${tempDir}/large.txt`, largeContent);

		const result = "{{file}}";
		const path = `${tempDir}/large.txt`;
		const match = "{{file}}";
		const remainingLength = 10000;

		const response = await handleFile(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		// Should process successfully using streaming
		expect(response.operationResults).toContain("filename:");
		expect(response.combinedRemainingCount).toBeLessThanOrEqual(
			remainingLength,
		);
	});

	it("should not use streaming for files smaller than threshold", async () => {
		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		// Create a file smaller than 1MB
		const smallContent = "Small file content";
		await Bun.write(`${tempDir}/small.txt`, smallContent);

		const result = "{{file}}";
		const path = `${tempDir}/small.txt`;
		const match = "{{file}}";
		const remainingLength = 10000;

		const response = await handleFile(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		// Should process successfully without streaming
		expect(response.operationResults).toContain("filename:");
		expect(response.operationResults).toContain("Small file content");
	});

	it("should handle large file with truncation", async () => {
		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		// Create a file larger than 1MB
		const largeContent = "y".repeat(STREAM_THRESHOLD_BYTES + 5000);
		await Bun.write(`${tempDir}/large-truncate.txt`, largeContent);

		const result = "{{file}}";
		const path = `${tempDir}/large-truncate.txt`;
		const match = "{{file}}";
		const remainingLength = 100; // Small limit to force truncation

		const response = await handleFile(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		// Should truncate content
		expect(response.combinedRemainingCount).toBe(0);
		expect(response.operationResults.length).toBeLessThan(largeContent.length);
	});

	it("should handle security error for large file outside allowed paths", async () => {
		const restrictedConfig = createConfig({
			allowedBasePaths: [tempDir],
			allowHttp: false,
			allowFunctions: false,
		});

		// Try to access a file outside allowed paths
		const result = "{{file}}";
		const path = "/etc/passwd";
		const match = "{{file}}";
		const remainingLength = 10000;

		const response = await handleFile(
			restrictedConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Security Error:");
	});
});
