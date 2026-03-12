import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { createConfig } from "../../src/config";
import { evaluateRules } from "../../src/language/shotput/rules";
import { substituteVariables } from "../../src/language/shotput/variables";
import { interpolation } from "../../src/runtime/interpolation";
import { getInterpolationMatchesWithIndices } from "../../src/runtime/interpolationApply";
import { parseOutputSections } from "../../src/sections";

const assertOpts = { numRuns: 200 };

describe("fuzz", () => {
	it("evaluateRules never throws on random string", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 500 }), (content) => {
				const config = createConfig({ context: {} });
				expect(() => evaluateRules(content, config)).not.toThrow();
				const result = evaluateRules(content, config);
				expect(typeof result).toBe("string");
			}),
			assertOpts,
		);
	});

	it("evaluateRules never throws on template-like string", () => {
		const templateLike = fc.oneof(
			fc.string({ maxLength: 300 }),
			fc
				.array(fc.constantFrom("{{", "}}", "#if", "/if", "#each", "/each"), {
					maxLength: 30,
				})
				.map((parts) => parts.join("")),
		);
		fc.assert(
			fc.property(templateLike, (content) => {
				const config = createConfig({ context: { x: true, items: [] } });
				expect(() => evaluateRules(content, config)).not.toThrow();
				const result = evaluateRules(content, config);
				expect(typeof result).toBe("string");
			}),
			assertOpts,
		);
	});

	it("substituteVariables never throws on random string", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 500 }), (content) => {
				const config = createConfig({ context: {} });
				expect(() => substituteVariables(content, config)).not.toThrow();
				const result = substituteVariables(content, config);
				expect(typeof result).toBe("string");
			}),
			assertOpts,
		);
	});

	it("getInterpolationMatchesWithIndices never throws on random string", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 500 }), (content) => {
				expect(() => getInterpolationMatchesWithIndices(content)).not.toThrow();
				const result = getInterpolationMatchesWithIndices(content);
				expect(Array.isArray(result)).toBe(true);
				for (const m of result) {
					expect(m).toHaveProperty("match");
					expect(m).toHaveProperty("start");
					expect(m).toHaveProperty("end");
					expect(typeof m.start).toBe("number");
					expect(typeof m.end).toBe("number");
					expect(m.start).toBeLessThanOrEqual(content.length);
					expect(m.end).toBeLessThanOrEqual(content.length);
				}
			}),
			assertOpts,
		);
	});

	it("parseOutputSections never throws on random string", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 500 }), (content) => {
				expect(() => parseOutputSections(content)).not.toThrow();
				const result = parseOutputSections(content);
				expect(result).toHaveProperty("sections");
				expect(result).toHaveProperty("remainingContent");
				expect(Array.isArray(result.sections)).toBe(true);
				expect(typeof result.remainingContent).toBe("string");
			}),
			assertOpts,
		);
	});

	it("parseOutputSections never throws with sectionBudgets", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 300 }),
				fc.record({
					a: fc.option(fc.nat(100), { nil: undefined }),
					b: fc.option(fc.nat(100), { nil: undefined }),
				}),
				(content, budgets) => {
					const filtered = Object.fromEntries(
						Object.entries(budgets).filter(([_, v]) => v !== undefined) as [
							string,
							number,
						][],
					);
					expect(() => parseOutputSections(content, filtered)).not.toThrow();
					const result = parseOutputSections(content, filtered);
					expect(result).toHaveProperty("sections");
					expect(result).toHaveProperty("remainingContent");
				},
			),
			assertOpts,
		);
	});

	it("interpolation never throws on rules-only content", async () => {
		// Content with only {{#if}}, {{#each}}, {{context.x}} - no file paths
		const rulesOnlyContent = fc.oneof(
			fc.string({ maxLength: 200 }),
			fc.constant("{{#if context.x}}a{{/if}}"),
			fc.constant("{{#each context.items}}x{{/each}}"),
			fc.constant("{{context.key}}"),
		);
		await fc.assert(
			fc.asyncProperty(rulesOnlyContent, async (content) => {
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					context: { x: true, items: ["a"], key: "v" },
				});
				await expect(interpolation(content, config)).resolves.toBeDefined();
				const result = await interpolation(content, config);
				expect(typeof result.processedTemplate).toBe("string");
				expect(typeof result.remainingLength).toBe("number");
			}),
			{ ...assertOpts, numRuns: 100 },
		);
	});
});
