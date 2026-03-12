import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { interpolation } from "../../src/runtime/interpolation";
import { interpolationStream } from "../../src/runtime/interpolationStream";

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

	it("should resolve relative paths in included content relative to including file", async () => {
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

	it("should use mergeContext when provided", async () => {
		const config = createConfig({
			context: { base: "default" },
		});
		const template = "{{context.base}} {{context.override}}";
		const result = await interpolation(
			template,
			config,
			process.cwd(),
			0,
			100000,
			new Set(),
			undefined,
			{ override: "merged" },
		);
		expect(result.processedTemplate).toBe("default merged");
	});

	it("should substitute literals when literalBox has entries and no matches", async () => {
		const literalBox = { literals: new Map<string, string>() };
		literalBox.literals.set("__SHOTPUT_LITERAL_0__", "literal-content");
		const template = "Prefix __SHOTPUT_LITERAL_0__ suffix";
		const result = await interpolation(
			template,
			defaultConfig,
			process.cwd(),
			0,
			100000,
			new Set(),
			literalBox,
		);
		expect(result.processedTemplate).toContain("literal-content");
	});

	it("should return remainingLength in result", async () => {
		const template = "Hello World";
		const result = await interpolation(template, defaultConfig);
		expect(result.remainingLength).toBeDefined();
		expect(typeof result.remainingLength).toBe("number");
	});

	it("should include resultMetadata when placeholders are processed", async () => {
		const template = "{{test/fixtures/test.txt}}";
		const result = await interpolation(template, defaultConfig);
		expect(result.resultMetadata).toBeDefined();
		expect(result.resultMetadata?.length).toBeGreaterThan(0);
		expect(result.resultMetadata?.[0]).toHaveProperty("path");
		expect(result.resultMetadata?.[0]).toHaveProperty("type");
		expect(result.resultMetadata?.[0]).toHaveProperty("duration");
	});
});

describe("interpolationStream", () => {
	const sequentialConfig = createConfig({
		allowedBasePaths: [process.cwd()],
		allowHttp: false,
		allowFunctions: true,
		allowedFunctionPaths: ["./test/fixtures"],
		maxConcurrency: 1,
	});

	async function consumeStream(
		stream: ReadableStream<string>,
	): Promise<string> {
		const reader = stream.getReader();
		const chunks: string[] = [];
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value !== undefined) chunks.push(value);
		}
		return chunks.join("");
	}

	it("concatenated segments equal interpolation().processedTemplate (no matches)", async () => {
		const template = "Hello World!";
		const expected = await interpolation(template, sequentialConfig);
		const { stream } = await interpolationStream(template, sequentialConfig);
		const concatenated = await consumeStream(stream);
		expect(concatenated).toBe(expected.processedTemplate);
	});

	it("concatenated segments equal interpolation().processedTemplate (one placeholder)", async () => {
		const template = "Hello {{test/fixtures/test.txt}}!";
		const expected = await interpolation(template, sequentialConfig);
		const { stream } = await interpolationStream(template, sequentialConfig);
		const concatenated = await consumeStream(stream);
		expect(concatenated).toBe(expected.processedTemplate);
	});

	it("concatenated segments equal interpolation().processedTemplate (multiple placeholders)", async () => {
		const template =
			"Start {{test/fixtures/test.txt}} Middle {{test/fixtures/test.txt}} End";
		const expected = await interpolation(template, sequentialConfig);
		const { stream } = await interpolationStream(template, sequentialConfig);
		const concatenated = await consumeStream(stream);
		expect(concatenated).toBe(expected.processedTemplate);
	});

	const parallelConfig = createConfig({
		allowedBasePaths: [process.cwd()],
		allowHttp: false,
		allowFunctions: true,
		allowedFunctionPaths: ["./test/fixtures"],
		enableContentLengthPlanning: true,
		maxConcurrency: 2,
	});

	it("concatenated segments equal interpolation().processedTemplate (parallel path)", async () => {
		const template =
			"Start {{test/fixtures/test.txt}} Mid {{test/fixtures/test.txt}} End";
		const expected = await interpolation(template, parallelConfig);
		const { stream } = await interpolationStream(template, parallelConfig);
		const concatenated = await consumeStream(stream);
		expect(concatenated).toBe(expected.processedTemplate);
	});

	it("maxConcurrency=1 produces same output as maxConcurrency=4", async () => {
		const template =
			"Start {{test/fixtures/test.txt}} Mid {{test/fixtures/test.txt}} End";
		const single = await interpolation(template, sequentialConfig);
		const multi = await interpolation(template, parallelConfig);
		expect(single.processedTemplate).toBe(multi.processedTemplate);
	});

	it("should return stream that emits segments in order when multiple placeholders", async () => {
		const template =
			"A {{test/fixtures/test.txt}} B {{test/fixtures/test.txt}} C";
		const { stream } = await interpolationStream(template, sequentialConfig);
		const chunks: string[] = [];
		const reader = stream.getReader();
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value !== undefined) chunks.push(value);
		}
		const concatenated = chunks.join("");
		expect(concatenated).toContain("A ");
		expect(concatenated).toContain("filename:");
		expect(concatenated).toContain(" B ");
		expect(concatenated).toContain(" C");
	});

	it("should resolve literalMapPromise when custom sources emit literals", async () => {
		// For stream without matches, literalMapPromise resolves to undefined
		const template = "No placeholders here";
		const { literalMapPromise } = await interpolationStream(
			template,
			sequentialConfig,
		);
		const literalMap = await literalMapPromise;
		expect(literalMap).toBeUndefined();
	});
});
