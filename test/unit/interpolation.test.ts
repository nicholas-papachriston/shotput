import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { interpolation } from "../../src/interpolation";

describe("interpolation", () => {
	const defaultConfig = createConfig({
		allowedBasePaths: [process.cwd()],
		allowHttp: false, // Disable HTTP for tests
		allowFunctions: true,
		allowedFunctionPaths: ["./test/fixtures"],
	});

	it("should process simple file template", async () => {
		const template = "Hello {{test/fixtures/test.txt}}!";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toContain("Hello filename:");
		expect(result.processedTemplate).toContain("Hello World!");
	});

	it("should handle multiple templates", async () => {
		const template =
			"Start {{test/fixtures/test.txt}} Middle {{test/fixtures/test.txt}} End";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toContain("Start filename:");
		expect(result.processedTemplate).toContain("Hello World!");
		expect(result.processedTemplate).toContain("Middle filename:");
		expect(result.processedTemplate).toContain("This is a test file");
		expect(result.processedTemplate).toContain("End");
	});

	it("should handle templates with no matches", async () => {
		const template = "Hello World!";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toBe("Hello World!");
	});

	it("should handle function templates", async () => {
		const template =
			"Hello {{TemplateType.Function:./test/fixtures/test-function.js}}!";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toContain("This is from a test function!");
	});

	it("should handle malformed templates gracefully", async () => {
		const template = "Hello {{invalid template}}!";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toContain("Hello");
		// Should not crash and should contain some error message
	});

	it("should respect length limits", async () => {
		const template = "{{test/fixtures/large-file.txt}}";
		const result = await interpolation(template, defaultConfig);

		// Result should be truncated due to length limit
		expect(result.processedTemplate.length).toBeLessThan(100001); // Default maxPromptLength
	});

	it("should handle mixed template types", async () => {
		const template =
			"File: {{test/fixtures/test.txt}} Function: {{TemplateType.Function:./test/fixtures/test-function.js}}";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toContain("File: filename:");
		expect(result.processedTemplate).toContain("Hello World!");
		expect(result.processedTemplate).toContain(
			"Function: This is from a test function!",
		);
	});

	it("should handle base path resolution", async () => {
		const template = "Hello {{test.txt}}!";
		const result = await interpolation(
			template,
			defaultConfig,
			"./test/fixtures",
		);

		expect(result.processedTemplate).toContain("Hello filename:");
		expect(result.processedTemplate).toContain("Hello World!");
	});

	it("should handle empty templates", async () => {
		const template = "";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toBe("");
	});

	it("should handle template syntax edge cases", async () => {
		const template = "{{}} {{{{}}}} {{{{}}}";
		const result = await interpolation(template, defaultConfig);

		// Should not crash and return some processed content
		expect(typeof result.processedTemplate).toBe("string");
	});

	it("should handle nested templates", async () => {
		const template = "{{test/fixtures/nested-1.txt}}";
		const config = createConfig({
			...defaultConfig,
			maxConcurrency: 1,
		});
		const result = await interpolation(template, config);

		expect(result.processedTemplate).toContain("Level 1");
		expect(result.processedTemplate).toContain("Level 2");
		expect(result.processedTemplate).toContain("Hello World!");
	});

	it("should respect maxNestingDepth limit", async () => {
		const limitedConfig = createConfig({
			...defaultConfig,
			maxNestingDepth: 1,
			maxConcurrency: 1,
		});

		const template = "{{test/fixtures/nested-1.txt}}";
		const result = await interpolation(template, limitedConfig);

		expect(result.processedTemplate).toContain("Level 1");
		expect(result.processedTemplate).toContain("Level 2");
		// Level 2 contains {{test.txt}}, which should NOT be processed at depth 1
		expect(result.processedTemplate).toContain("{{test.txt}}");
		expect(result.processedTemplate).not.toContain("Hello World!");
	});

	it("should detect cycle and replace with message", async () => {
		const template = "{{test/fixtures/cycle-a.txt}}";
		const result = await interpolation(template, defaultConfig);

		expect(result.processedTemplate).toContain("Content A");
		expect(result.processedTemplate).toContain("Content B");
		expect(result.processedTemplate).toContain("[Cycle detected:");
		expect(result.processedTemplate).toContain("cycle-a.txt]");
	});

	it("should resolve relative paths in included content relative to including file (sequential path)", async () => {
		const sequentialConfig = createConfig({
			...defaultConfig,
			maxConcurrency: 1,
		});
		const template = "{{test/fixtures/subdir/a.txt}}";
		const result = await interpolation(
			template,
			sequentialConfig,
			process.cwd(),
		);

		expect(result.processedTemplate).toContain("Nested:");
		expect(result.processedTemplate).toContain("from b");
	});

	it("should substitute {{context.x}} and {{params.x}} in template body", async () => {
		const config = createConfig({
			context: { taskName: "review", scope: "security" },
		}) as ReturnType<typeof createConfig> & {
			params?: Record<string, unknown>;
		};
		config.params = { id: "p1" };
		const template =
			"Task: {{context.taskName}} Scope: {{context.scope}} ID: {{params.id}}";
		const result = await interpolation(template, config);
		expect(result.processedTemplate).toBe(
			"Task: review Scope: security ID: p1",
		);
	});

	it("should combine {{#each}} and variable substitution in full interpolation", async () => {
		const config = createConfig({
			context: { items: ["a", "b", "c"] },
		});
		const template =
			"{{#each context.items}}[{{context.__loop.index}}:{{context.__loop.item}}]{{/each}}";
		const result = await interpolation(template, config);
		expect(result.processedTemplate).toBe("[0:a][1:b][2:c]");
	});
});
