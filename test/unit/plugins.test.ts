import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { interpolation } from "../../src/interpolation";
import { getMatchingPlugin } from "../../src/plugins";
import type { SourcePlugin } from "../../src/plugins";

describe("custom source plugins", () => {
	it("should match custom plugin by raw path", () => {
		const plugin: SourcePlugin = {
			name: "echo",
			matches: (rawPath) => rawPath.startsWith("echo://"),
			canContainTemplates: false,
			resolve: async (ctx) => ({
				content: `echo: ${ctx.rawPath}`,
				remainingLength: ctx.remainingLength - 100,
			}),
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [plugin],
		});
		const matched = getMatchingPlugin(config, "echo://hello");
		expect(matched).toBe(plugin);
		expect(getMatchingPlugin(config, "http://example.com")).toBeUndefined();
	});

	it("should resolve custom source and replace in template", async () => {
		const plugin: SourcePlugin = {
			name: "echo",
			matches: (rawPath) => rawPath.startsWith("echo://"),
			canContainTemplates: false,
			resolve: async (ctx) => ({
				content: `[resolved: ${ctx.rawPath}]`,
				remainingLength: ctx.remainingLength - 50,
			}),
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [plugin],
		});
		const template = "Prefix {{echo://foo/bar}} Suffix";
		const result = await interpolation(template, config);

		expect(result.processedTemplate).toBe(
			"Prefix [resolved: echo://foo/bar] Suffix",
		);
	});

	it("should use estimateLength when provided during planning", async () => {
		let estimateCalled = false;
		const plugin: SourcePlugin = {
			name: "sized",
			matches: (rawPath) => rawPath.startsWith("sized://"),
			canContainTemplates: false,
			estimateLength: async () => {
				estimateCalled = true;
				return 2000;
			},
			resolve: async (ctx) => ({
				content: "x".repeat(100),
				remainingLength: ctx.remainingLength - 100,
			}),
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [plugin],
			enableContentLengthPlanning: true,
			maxConcurrency: 2,
		});
		const template = "{{sized://resource}}";
		await interpolation(template, config);
		expect(estimateCalled).toBe(true);
	});

	it("should recursively interpolate when canContainTemplates is true", async () => {
		const plugin: SourcePlugin = {
			name: "nested",
			matches: (rawPath) => rawPath.startsWith("nested://"),
			canContainTemplates: true,
			resolve: async () => ({
				content: "Inner {{test/fixtures/test.txt}}",
				remainingLength: 90000,
			}),
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [plugin],
		});
		const template = "Outer {{nested://x}}";
		const result = await interpolation(template, config);

		expect(result.processedTemplate).toContain("Outer Inner ");
		expect(result.processedTemplate).toContain("Hello World!");
	});

	it("should not recursively interpolate when canContainTemplates is false", async () => {
		const plugin: SourcePlugin = {
			name: "literal",
			matches: (rawPath) => rawPath.startsWith("literal://"),
			canContainTemplates: false,
			resolve: async () => ({
				content: "Literal {{test/fixtures/test.txt}} as text",
				remainingLength: 90000,
			}),
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [plugin],
			maxConcurrency: 1, // sequential path honors canContainTemplates: false
		});
		const template = "{{literal://x}}";
		const result = await interpolation(template, config);

		expect(result.processedTemplate).toBe(
			"Literal {{test/fixtures/test.txt}} as text",
		);
	});

	it("should detect cycle when custom source returns self-reference", async () => {
		const plugin: SourcePlugin = {
			name: "cycle",
			matches: (rawPath) => rawPath.startsWith("cycle://"),
			canContainTemplates: true,
			resolve: async () => ({
				content: "Self: {{cycle://self}}",
				remainingLength: 90000,
			}),
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [plugin],
		});
		const template = "{{cycle://self}}";
		const result = await interpolation(template, config);

		expect(result.processedTemplate).toContain("[Cycle detected:");
		expect(result.processedTemplate).toContain("cycle://self");
	});

	it("should use first matching plugin when multiple match", async () => {
		const first: SourcePlugin = {
			name: "first",
			matches: () => true,
			canContainTemplates: false,
			resolve: async () => ({ content: "first", remainingLength: 90000 }),
		};
		const second: SourcePlugin = {
			name: "second",
			matches: () => true,
			canContainTemplates: false,
			resolve: async () => ({ content: "second", remainingLength: 90000 }),
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [first, second],
		});
		const template = "{{any://path}}";
		const result = await interpolation(template, config);

		expect(result.processedTemplate).toBe("first");
	});

	it("should replace with error message when plugin resolve throws", async () => {
		const plugin: SourcePlugin = {
			name: "broken",
			matches: (rawPath) => rawPath.startsWith("broken://"),
			canContainTemplates: false,
			resolve: async () => {
				throw new Error("Plugin failed");
			},
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			customSources: [plugin],
		});
		const template = "Before {{broken://x}} After";
		const result = await interpolation(template, config);

		expect(result.processedTemplate).toContain("Before [Error reading ");
		expect(result.processedTemplate).toContain("broken://x");
		expect(result.processedTemplate).toContain("] After");
	});

	it("should pass config to plugin resolve context", async () => {
		let receivedConfig: unknown = null;
		const plugin: SourcePlugin = {
			name: "config-check",
			matches: (rawPath) => rawPath.startsWith("config://"),
			canContainTemplates: false,
			resolve: async (ctx) => {
				receivedConfig = ctx.config;
				return {
					content: "ok",
					remainingLength: ctx.remainingLength - 2,
				};
			},
		};
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			maxPromptLength: 5000,
			customSources: [plugin],
		});
		await interpolation("{{config://test}}", config);
		expect(receivedConfig).toBe(config);
		expect(
			(receivedConfig as { maxPromptLength: number }).maxPromptLength,
		).toBe(5000);
	});
});
