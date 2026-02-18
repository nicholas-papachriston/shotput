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

	describe("{{#each}}", () => {
		it("should iterate over context array and expose __loop.item", () => {
			const config = createConfig({
				context: { items: ["a", "b", "c"] },
			});
			const template =
				"{{#each context.items}}-{{context.__loop.item}}-{{/each}}";
			expect(evaluateRules(template, config)).toBe("-a--b--c-");
		});

		it("should expose context.__loop.index", () => {
			const config = createConfig({
				context: { list: ["x", "y"] },
			});
			const template =
				"{{#each context.list}}[{{context.__loop.index}}]{{context.__loop.item}}{{/each}}";
			expect(evaluateRules(template, config)).toBe("[0]x[1]y");
		});

		it("should render empty string for empty array", () => {
			const config = createConfig({
				context: { list: [] },
			});
			const template = "{{#each context.list}}x{{/each}}";
			expect(evaluateRules(template, config)).toBe("");
		});

		it("should treat non-array as single-item array", () => {
			const config = createConfig({
				context: { single: "only" },
			});
			const template =
				"{{#each context.single}}{{context.__loop.item}}{{/each}}";
			expect(evaluateRules(template, config)).toBe("only");
		});

		it("should support params.* as each source", () => {
			const config = createConfig({}) as ReturnType<typeof createConfig> & {
				params?: Record<string, unknown>;
			};
			config.params = { names: ["alice", "bob"] };
			const template =
				"{{#each params.names}}{{context.__loop.item}} {{/each}}";
			expect(evaluateRules(template, config)).toBe("alice bob ");
		});

		it("should evaluate nested {{#if}} inside {{#each}}", () => {
			const config = createConfig({
				context: { items: [1, 2, 3], threshold: 2 },
			});
			const template =
				"{{#each context.items}}{{#if context.__loop.item >= context.threshold}}{{context.__loop.item}}{{/if}}{{/each}}";
			expect(evaluateRules(template, config)).toBe("23");
		});

		it("should handle nested {{#each}}", () => {
			const config = createConfig({
				context: { rows: [["a", "b"], ["c"]] },
			});
			const template =
				"{{#each context.rows}}({{#each context.__loop.item}}{{context.__loop.item}}{{/each}}){{/each}}";
			expect(evaluateRules(template, config)).toBe("(ab)(c)");
		});
	});
});
