import { beforeEach, describe, expect, it } from "bun:test";
import { interpolation } from "../../src/interpolation";
import { SecurityValidator } from "../../src/security";

describe("interpolation", () => {
	beforeEach(() => {
		const validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd()],
			allowHttp: false, // Disable HTTP for tests
			allowFunctions: true,
			allowedFunctionPaths: ["./test/fixtures"],
		});
	});

	it("should process simple file template", async () => {
		const template = "Hello {{test/fixtures/test.txt}}!";
		const result = await interpolation(template);

		expect(result.processedTemplate).toContain("Hello filename:");
		expect(result.processedTemplate).toContain("Hello World!");
	});

	it("should handle multiple templates", async () => {
		const template =
			"Start {{test/fixtures/test.txt}} Middle {{test/fixtures/test.txt}} End";
		const result = await interpolation(template);

		expect(result.processedTemplate).toContain("Start filename:");
		expect(result.processedTemplate).toContain("Hello World!");
		expect(result.processedTemplate).toContain("Middle filename:");
		expect(result.processedTemplate).toContain("This is a test file");
		expect(result.processedTemplate).toContain("End");
	});

	it("should handle templates with no matches", async () => {
		const template = "Hello World!";
		const result = await interpolation(template);

		expect(result.processedTemplate).toBe("Hello World!");
	});

	it("should handle function templates", async () => {
		const template =
			"Hello {{TemplateType.Function:./test/fixtures/test-function.js}}!";
		const result = await interpolation(template);

		expect(result.processedTemplate).toContain("This is from a test function!");
	});

	it("should handle malformed templates gracefully", async () => {
		const template = "Hello {{invalid template}}!";
		const result = await interpolation(template);

		expect(result.processedTemplate).toContain("Hello");
		// Should not crash and should contain some error message
	});

	it("should respect length limits", async () => {
		const template = "{{test/fixtures/large-file.txt}}";
		const result = await interpolation(template);

		// Result should be truncated due to length limit
		expect(result.processedTemplate.length).toBeLessThan(100001); // Default maxPromptLength
	});

	it("should handle mixed template types", async () => {
		const template =
			"File: {{test/fixtures/test.txt}} Function: {{TemplateType.Function:./test/fixtures/test-function.js}}";
		const result = await interpolation(template);

		expect(result.processedTemplate).toContain("File: filename:");
		expect(result.processedTemplate).toContain("Hello World!");
		expect(result.processedTemplate).toContain("Function: This is from a test function!");
	});

	it("should handle base path resolution", async () => {
		const template = "Hello {{test.txt}}!";
		const result = await interpolation(template, "./test/fixtures");

		expect(result.processedTemplate).toContain("Hello filename:");
		expect(result.processedTemplate).toContain("Hello World!");
	});

	it("should handle empty templates", async () => {
		const template = "";
		const result = await interpolation(template);

		expect(result.processedTemplate).toBe("");
	});

	it("should handle template syntax edge cases", async () => {
		const template = "{{}} {{{{}}}} {{{{}}}";
		const result = await interpolation(template);

		// Should not crash and return some processed content
		expect(typeof result.processedTemplate).toBe("string");
	});
});
