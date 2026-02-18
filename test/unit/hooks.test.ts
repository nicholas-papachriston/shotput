import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { shotput } from "../../src/index";
import type { HookSet, SourceResult } from "../../src/index";
import { interpolation } from "../../src/interpolation";

describe("hooks", () => {
	it("should run preResolve and transform template", async () => {
		const preResolveCalls: string[] = [];
		const hooks: HookSet = {
			preResolve: (template) => {
				preResolveCalls.push(template);
				return template.replace("PLACEHOLDER", "replaced");
			},
		};
		const config = createConfig({
			template: "Prefix PLACEHOLDER suffix",
			allowedBasePaths: [process.cwd()],
			hooks,
		});
		const result = await shotput(config);
		expect(preResolveCalls.length).toBe(1);
		expect(preResolveCalls[0]).toContain("PLACEHOLDER");
		expect(result.content).toContain("replaced");
		expect(result.content).not.toContain("PLACEHOLDER");
	});

	it("should run postResolveSource for each resolved source", async () => {
		const resolved: SourceResult[] = [];
		const hooks: HookSet = {
			postResolveSource: (result) => {
				resolved.push(result);
				return {
					...result,
					content: `[wrapped: ${result.content.trim().slice(0, 20)}]`,
				};
			},
		};
		const config = createConfig({
			template: "{{test/fixtures/test.txt}}",
			allowedBasePaths: [process.cwd()],
			hooks,
			maxConcurrency: 1,
		});
		const template = config.template;
		if (template === undefined) throw new Error("template required");
		await interpolation(template, config);
		expect(resolved.length).toBeGreaterThanOrEqual(1);
		expect(resolved[0].path).toBeDefined();
		expect(resolved[0].content).toBeDefined();
	});

	it("should run postAssembly and allow abort with false", async () => {
		const hooks: HookSet = {
			postAssembly: () => false,
		};
		const config = createConfig({
			template: "hello",
			hooks,
		});
		const result = await shotput(config);
		expect(result.error).toBeDefined();
		expect(result.error?.name).toBe("HookAbortError");
	});

	it("should run preOutput and transform output", async () => {
		const hooks: HookSet = {
			preOutput: (output) => ({
				...output,
				content: `${output.content ?? ""}\n[footer]`,
			}),
		};
		const config = createConfig({
			template: "body",
			hooks,
		});
		const result = await shotput(config);
		expect(result.content).toContain("body");
		expect(result.content).toContain("[footer]");
	});

	it("should run multiple hooks in array in order", async () => {
		const order: string[] = [];
		const hooks: HookSet = {
			preResolve: [
				(t) => {
					order.push("a");
					return t;
				},
				(t) => {
					order.push("b");
					return t;
				},
			],
		};
		const config = createConfig({
			template: "x",
			hooks,
		});
		await shotput(config);
		expect(order).toEqual(["a", "b"]);
	});

	it("should support async hooks", async () => {
		const hooks: HookSet = {
			preResolve: async (template) => {
				await Promise.resolve();
				return `${template} async`;
			},
		};
		const config = createConfig({
			template: "sync",
			hooks,
		});
		const result = await shotput(config);
		expect(result.content).toContain("sync async");
	});
});
