import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import {
	getVariableValue,
	substituteLoopItemVariables,
	substituteLoopVariables,
	substituteVariables,
} from "../../src/language/shotput/variables";

describe("variables", () => {
	describe("getVariableValue", () => {
		it("should resolve context.* to string value", () => {
			const config = createConfig({
				context: { taskName: "review", scope: "security" },
			});
			expect(getVariableValue("context.taskName", config)).toBe("review");
			expect(getVariableValue("context.scope", config)).toBe("security");
		});

		it("should resolve nested context paths", () => {
			const config = createConfig({
				context: { foo: { bar: "nested" } },
			});
			expect(getVariableValue("context.foo.bar", config)).toBe("nested");
		});

		it("should return empty string for missing context key", () => {
			const config = createConfig({ context: {} });
			expect(getVariableValue("context.missing", config)).toBe("");
		});

		it("should resolve params.* when params present on config", () => {
			const config = createConfig({}) as ReturnType<typeof createConfig> & {
				params?: Record<string, unknown>;
			};
			config.params = { scope: "narrow", limit: 10 };
			expect(getVariableValue("params.scope", config)).toBe("narrow");
			expect(getVariableValue("params.limit", config)).toBe("10");
		});

		it("should return empty string when params missing", () => {
			const config = createConfig({});
			expect(getVariableValue("params.x", config)).toBe("");
		});

		it("should resolve env.* from process.env", () => {
			const config = createConfig({});
			// PATH is typically set; NODE_ENV may be set
			const pathVal = getVariableValue("env.PATH", config);
			expect(typeof pathVal).toBe("string");
			// Unknown env returns ""
			expect(getVariableValue("env.SHOTPUT_UNLIKELY_ENV_XYZ_123", config)).toBe(
				"",
			);
		});

		it("should return empty string for non-context/params/env path", () => {
			const config = createConfig({ context: { x: 1 } });
			expect(getVariableValue("other.x", config)).toBe("");
		});

		it("should trim path and handle whitespace in placeholder", () => {
			const config = createConfig({ context: { key: "val" } });
			expect(getVariableValue("  context.key  ", config)).toBe("val");
		});

		it("should return empty string for empty trimmed path", () => {
			const config = createConfig({ context: { key: "val" } });
			expect(getVariableValue("   ", config)).toBe("");
		});

		it("should stringify number context value", () => {
			const config = createConfig({ context: { count: 42 } });
			expect(getVariableValue("context.count", config)).toBe("42");
		});

		it("should stringify boolean context value", () => {
			const config = createConfig({ context: { enabled: true } });
			expect(getVariableValue("context.enabled", config)).toBe("true");
		});
	});

	describe("substituteVariables", () => {
		it("should replace {{context.x}} placeholders", () => {
			const config = createConfig({
				context: { taskName: "audit", env: "prod" },
			});
			const content = "Task: {{context.taskName}} Env: {{context.env}}";
			expect(substituteVariables(content, config)).toBe(
				"Task: audit Env: prod",
			);
		});

		it("should replace {{params.x}} when params set", () => {
			const config = createConfig({}) as ReturnType<typeof createConfig> & {
				params?: Record<string, unknown>;
			};
			config.params = { id: "123" };
			const content = "ID: {{params.id}}";
			expect(substituteVariables(content, config)).toBe("ID: 123");
		});

		it("should replace {{env.X}} placeholders", () => {
			const content = "Shell: {{env.SHELL}}";
			const result = substituteVariables(content, createConfig({}));
			expect(typeof result).toBe("string");
			expect(result.startsWith("Shell: ")).toBe(true);
		});

		it("should leave non-variable {{...}} unchanged", () => {
			const config = createConfig({ context: {} });
			const content = "File: {{./some/file.txt}} and {{context.name}}";
			const result = substituteVariables(content, config);
			expect(result).toContain("{{./some/file.txt}}");
			expect(result).toContain("and ");
			expect(result).not.toContain("{{context.name}}");
			expect(result).toContain("and "); // context.name empty
		});

		it("should substitute multiple and repeated placeholders", () => {
			const config = createConfig({
				context: { tag: "v1" },
			});
			const content = "{{context.tag}} | {{context.tag}}";
			expect(substituteVariables(content, config)).toBe("v1 | v1");
		});

		it("should handle empty content", () => {
			expect(substituteVariables("", createConfig({}))).toBe("");
		});

		it("should substitute number and boolean context values", () => {
			const config = createConfig({
				context: { count: 10, active: false },
			});
			const content = "Count: {{context.count}} Active: {{context.active}}";
			expect(substituteVariables(content, config)).toBe(
				"Count: 10 Active: false",
			);
		});
	});

	describe("substituteLoopItemVariables", () => {
		it("should substitute item.name when item has name property", () => {
			const item = { name: "Alice", value: "a" };
			const content = "{{context.__loop.item.name}}";
			expect(substituteLoopItemVariables(content, item, 0)).toBe("Alice");
		});

		it("should substitute item.value when item has value property", () => {
			const item = { name: "x", value: "val" };
			const content = "{{context.__loop.item.value}}";
			expect(substituteLoopItemVariables(content, item, 0)).toBe("val");
		});

		it("should substitute index", () => {
			const content = "{{context.__loop.index}}";
			expect(substituteLoopItemVariables(content, "x", 2)).toBe("2");
		});

		it("should substitute item when primitive", () => {
			const content = "{{context.__loop.item}}";
			expect(substituteLoopItemVariables(content, "hello", 0)).toBe("hello");
		});

		it("should return content unchanged when no __loop placeholders", () => {
			const content = "No loop vars {{context.x}}";
			expect(substituteLoopItemVariables(content, "x", 0)).toBe(content);
		});
	});

	describe("substituteLoopVariables", () => {
		it("should substitute both loop and variable placeholders in one pass", () => {
			const config = createConfig({ context: { tag: "v1" } });
			const item = { name: "a" };
			const content =
				"{{context.__loop.index}}:{{context.__loop.item.name}} tag={{context.tag}}";
			const result = substituteLoopVariables(content, item, 1, config);
			expect(result).toBe("1:a tag=v1");
		});
	});
});
