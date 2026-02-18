import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { interpolation } from "../../src/interpolation";
import { evaluateRules } from "../../src/rules";

describe("rules", () => {
	it("should include content when condition is true", () => {
		const config = createConfig({
			context: { show: true },
		});
		const template = "{{#if context.show}}included{{/if}}";
		expect(evaluateRules(template, config)).toBe("included");
	});

	it("should exclude content when condition is false", () => {
		const config = createConfig({
			context: { show: false },
		});
		const template = "{{#if context.show}}included{{/if}}";
		expect(evaluateRules(template, config)).toBe("");
	});

	it("should select consequent when true, alternate when false", () => {
		const configTrue = createConfig({ context: { env: "prod" } });
		const configFalse = createConfig({ context: { env: "staging" } });
		const template =
			'{{#if context.env == "prod"}}production{{else}}staging{{/if}}';
		expect(evaluateRules(template, configTrue)).toBe("production");
		expect(evaluateRules(template, configFalse)).toBe("staging");
	});

	it("should handle nested {{#if}} blocks", () => {
		const config = createConfig({
			context: { a: true, b: false },
		});
		const template =
			"{{#if context.a}}A{{#if context.b}}B{{else}}notB{{/if}}{{/if}}";
		expect(evaluateRules(template, config)).toBe("AnotB");
	});

	it("should expose context and env namespaces", () => {
		const config = createConfig({
			context: { key: "value" },
		});
		const template = "{{#if context.key}}ok{{/if}}";
		expect(evaluateRules(template, config)).toBe("ok");
		const withEnv = "{{#if env.PATH}}haspath{{/if}}";
		expect(evaluateRules(withEnv, config)).toContain("haspath");
	});

	it("should support JS engine expressions", () => {
		const config = createConfig({
			context: { tags: ["prod", "api"], severity: 3 },
		});
		expect(
			evaluateRules('{{#if context.tags.includes("prod")}}yes{{/if}}', config),
		).toBe("yes");
		expect(
			evaluateRules("{{#if context.severity >= 2}}high{{/if}}", config),
		).toBe("high");
	});

	it("should support safe engine for simple expressions", () => {
		const config = createConfig({
			context: { x: "a" },
			expressionEngine: "safe",
		});
		expect(evaluateRules('{{#if context.x == "a"}}ok{{/if}}', config)).toBe(
			"ok",
		);
		expect(evaluateRules('{{#if context.x == "b"}}no{{/if}}', config)).toBe("");
	});

	it("should not fetch excluded branch (rules run before interpolation)", async () => {
		const config = createConfig({
			context: { fetch: false },
			allowedBasePaths: [process.cwd()],
		});
		const template =
			"{{#if context.fetch}}{{test/fixtures/test.txt}}{{else}}skipped{{/if}}";
		const result = await interpolation(template, config);
		expect(result.processedTemplate).toBe("skipped");
	});

	it("should handle unclosed {{#if}} gracefully", () => {
		const config = createConfig({});
		const template = "{{#if true}}content";
		expect(evaluateRules(template, config)).toBe(template);
	});

	it("should evaluate rules inside resolved file content", async () => {
		const config = createConfig({
			context: { include: true },
			allowedBasePaths: [process.cwd()],
			maxConcurrency: 1,
		});
		const template = "{{test/fixtures/rules-include.txt}}";
		const result = await interpolation(template, config);
		expect(result.processedTemplate).toContain("included from file");
		expect(result.processedTemplate).not.toContain("excluded");
	});

	it("should treat malformed expression as false in js engine", () => {
		const config = createConfig({ context: {} });
		const template = "{{#if context.x.y.z}}bad{{/if}}";
		expect(evaluateRules(template, config)).toBe("");
	});
});
