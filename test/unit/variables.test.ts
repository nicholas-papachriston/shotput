import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { getVariableValue, substituteVariables } from "../../src/variables";

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
	});
});
