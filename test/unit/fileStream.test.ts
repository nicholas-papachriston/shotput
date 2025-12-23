import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { handleFileStream } from "../../src/fileStream";

describe("handleFileStream", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-filestream-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;
	});

	afterEach(async () => {
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should successfully process a valid file using stream", async () => {
		const testContent = "Hello World! This is a test file.";
		await Bun.write(`${tempDir}/test.txt`, testContent);
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });

		const result = "Before {{file}} After";
		const path = `${tempDir}/test.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Before filename:");
		expect(response.operationResults).toContain(testContent);
		expect(response.operationResults).toContain("After");
		expect(response.combinedRemainingCount).toBeGreaterThan(0);
		expect(response.combinedRemainingCount).toBeLessThan(remainingLength);
	});

	it("should handle file not found error", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const result = "Content: {{file}}";
		const path = `${tempDir}/nonexistent.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Error reading");
		expect(response.operationResults).toContain(path);
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should truncate content when length limit is reached", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const largeContent = "x".repeat(1000);
		await Bun.write(`${tempDir}/large.txt`, largeContent);

		const result = "{{file}}";
		const path = `${tempDir}/large.txt`;
		const match = "{{file}}";
		const remainingLength = 100;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.combinedRemainingCount).toBe(0);
		// Content should be significantly smaller than original
		expect(response.operationResults.length).toBeLessThan(largeContent.length);
	});

	it("should block path traversal attempts", async () => {
		const restrictedConfig = createConfig({
			allowedBasePaths: [tempDir],
			allowHttp: false,
			allowFunctions: false,
		});

		const result = "Content: {{file}}";
		const path = "../../../etc/passwd";
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			restrictedConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Security Error:");
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should block paths outside allowed base paths", async () => {
		const restrictedConfig = createConfig({
			allowedBasePaths: [tempDir],
			allowHttp: false,
			allowFunctions: false,
		});

		const result = "Content: {{file}}";
		const path = "/etc/passwd";
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			restrictedConfig,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Security Error:");
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should handle zero remaining length", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		await Bun.write(`${tempDir}/test.txt`, "Some content");

		const result = "Before {{file}} After";
		const path = `${tempDir}/test.txt`;
		const match = "{{file}}";
		const remainingLength = 0;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.combinedRemainingCount).toBe(0);
	});

	it("should handle empty file", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		await Bun.write(`${tempDir}/empty.txt`, "");

		const result = "Before {{file}} After";
		const path = `${tempDir}/empty.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Before filename:");
		expect(response.operationResults).toContain("After");
	});

	it("should preserve file path in output", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		await Bun.write(`${tempDir}/named.txt`, "content");

		const result = "{{file}}";
		const path = `${tempDir}/named.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain(
			`filename:${tempDir}/named.txt:`,
		);
	});

	it("should handle multiline content", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const multilineContent = "Line 1\nLine 2\nLine 3\nLine 4";
		await Bun.write(`${tempDir}/multiline.txt`, multilineContent);

		const result = "{{file}}";
		const path = `${tempDir}/multiline.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Line 1");
		expect(response.operationResults).toContain("Line 2");
		expect(response.operationResults).toContain("Line 3");
		expect(response.operationResults).toContain("Line 4");
	});

	it("should handle special characters in content", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const specialContent = "Special: !@#$%^&*()_+-=[]{}|;':\",./<>?";
		await Bun.write(`${tempDir}/special.txt`, specialContent);

		const result = "{{file}}";
		const path = `${tempDir}/special.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("!@#$%^&*()");
	});

	it("should handle UTF-8 content", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const utf8Content = "UTF-8 content: test";
		await Bun.write(`${tempDir}/utf8.txt`, utf8Content);

		const result = "{{file}}";
		const path = `${tempDir}/utf8.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("UTF-8 content");
	});

	it("should handle partial truncation correctly", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const content = "abcdefghijklmnopqrstuvwxyz";
		await Bun.write(`${tempDir}/alphabet.txt`, content);

		const result = "{{file}}";
		const path = `${tempDir}/alphabet.txt`;
		const match = "{{file}}";
		// Small remaining length that will truncate within the content
		const remainingLength = 20;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		// Should be truncated
		expect(response.combinedRemainingCount).toBe(0);
	});

	it("should replace the correct match placeholder", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		await Bun.write(`${tempDir}/test.txt`, "replaced");

		const result = "Start {{other}} {{file}} {{another}} End";
		const path = `${tempDir}/test.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Start {{other}}");
		expect(response.operationResults).toContain("{{another}} End");
		expect(response.operationResults).toContain("replaced");
	});

	it("should handle very large remaining length", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const content = "Small content";
		await Bun.write(`${tempDir}/small.txt`, content);

		const result = "{{file}}";
		const path = `${tempDir}/small.txt`;
		const match = "{{file}}";
		const remainingLength = 1000000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain(content);
		expect(response.combinedRemainingCount).toBeGreaterThan(0);
	});

	it("should handle file with tabs and mixed whitespace", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const content = "Column1\tColumn2\tColumn3\n  indented  \n\ttabbed";
		await Bun.write(`${tempDir}/whitespace.txt`, content);

		const result = "{{file}}";
		const path = `${tempDir}/whitespace.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Column1\tColumn2");
		expect(response.operationResults).toContain("indented");
	});

	it("should handle file with Windows line endings", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const content = "Line 1\r\nLine 2\r\nLine 3";
		await Bun.write(`${tempDir}/windows.txt`, content);

		const result = "{{file}}";
		const path = `${tempDir}/windows.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Line 1");
		expect(response.operationResults).toContain("Line 2");
		expect(response.operationResults).toContain("Line 3");
	});

	it("should correctly calculate remaining length after processing", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const content = "12345678901234567890"; // 20 characters
		await Bun.write(`${tempDir}/counted.txt`, content);

		const result = "{{file}}";
		const path = `${tempDir}/counted.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		// Remaining should be reduced by at least the content length plus filename prefix
		expect(response.combinedRemainingCount).toBeLessThan(remainingLength);
	});

	it("should handle absolute path correctly", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const content = "Absolute path content";
		const absolutePath = `${tempDir}/absolute.txt`;
		await Bun.write(absolutePath, content);

		const result = "{{file}}";
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			absolutePath,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain(content);
		expect(response.operationResults).toContain(`filename:${absolutePath}`);
	});

	it("should handle file with JSON content", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const jsonContent = '{"key": "value", "number": 123, "array": [1, 2, 3]}';
		await Bun.write(`${tempDir}/data.json`, jsonContent);

		const result = "{{file}}";
		const path = `${tempDir}/data.json`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain('"key": "value"');
		expect(response.operationResults).toContain('"number": 123');
	});

	it("should handle file with code content", async () => {
		const config = createConfig({ allowedBasePaths: [process.cwd(), tempDir] });
		const codeContent = `function hello() {
	console.log("Hello, World!");
	return true;
}`;
		await Bun.write(`${tempDir}/code.js`, codeContent);

		const result = "{{file}}";
		const path = `${tempDir}/code.js`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("function hello()");
		expect(response.operationResults).toContain("console.log");
	});
});
