import { describe, expect, it } from "bun:test";
import { createCommandPlugin, parseCommandInvocation } from "../../src/command";
import { createConfig } from "../../src/config";
import { shotput } from "../../src/index";
import { interpolation } from "../../src/interpolation";

const commandsDir = "test/fixtures/commands";

describe("command plugin", () => {
	it("should parse command invocation with no params", () => {
		const out = parseCommandInvocation("command:review");
		expect(out.name).toBe("review");
		expect(out.params).toEqual({});
	});

	it("should parse command invocation with params", () => {
		const out = parseCommandInvocation(
			"command:review scope=src severity=critical",
		);
		expect(out.name).toBe("review");
		expect(out.params).toEqual({ scope: "src", severity: "critical" });
	});

	it("should match rawPath starting with command:", () => {
		const plugin = createCommandPlugin();
		expect(plugin.matches("command:review")).toBe(true);
		expect(plugin.matches("command:onboard")).toBe(true);
		expect(plugin.matches("file:./x")).toBe(false);
	});
});

describe("command resolution", () => {
	const baseConfig = createConfig({
		allowedBasePaths: [process.cwd()],
		commandsDir,
		customSources: [createCommandPlugin()],
		templateDir: process.cwd(),
		allowHttp: false,
		maxConcurrency: 1,
	});

	it("should use default params from frontmatter when no params provided", async () => {
		const template = "{{command:review}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("Scope: .");
		expect(result.processedTemplate).toContain("# Code Review Context");
	});

	it("should override default params when key=value provided", async () => {
		const template = "{{command:review scope=src/api severity=critical}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("Scope: src/api");
		expect(result.processedTemplate).toContain("Scope is src/api");
		expect(result.processedTemplate).toContain("Severity filter: critical");
	});

	it("should substitute {{$paramName}} in template body", async () => {
		const template = "{{command:review scope=lib}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("Scope: lib");
		expect(result.processedTemplate).toContain("Scope is lib");
	});

	it("should evaluate {{#if params.key}} inside command body", async () => {
		const template = "{{command:review scope=src severity=critical}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("Severity filter: critical");
	});

	it("should resolve sources inside command body recursively", async () => {
		const template = "{{command:with-file}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("Content from file:");
		expect(result.processedTemplate).toContain("Hello World!");
		expect(result.processedTemplate).toContain("Param path was: test.txt");
	});

	it("should detect cycle when command includes itself", async () => {
		const template = "{{command:self}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("[Cycle detected:");
		expect(result.processedTemplate).toContain("command:self");
	});

	it("should error when command name not found", async () => {
		const template = "{{command:nonexistent}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("[Error reading");
		expect(result.processedTemplate).toContain("command:nonexistent");
	});
});

describe("shotput with commands", () => {
	it("should resolve command when commandsDir is set", async () => {
		const result = await shotput({
			template: "Prefix {{command:review scope=app}} Suffix",
			templateDir: process.cwd(),
			allowedBasePaths: [process.cwd()],
			commandsDir,
			allowHttp: false,
			maxConcurrency: 1,
		});
		expect(result.error).toBeUndefined();
		expect(result.content).toContain("Prefix");
		expect(result.content).toContain("Suffix");
		expect(result.content).toContain("Scope: app");
	});

	it("should leave {{command:name}} unmodified when commandsDir not set", async () => {
		const result = await shotput({
			template: "Before {{command:review}} After",
			templateDir: process.cwd(),
			allowedBasePaths: [process.cwd()],
			commandsDir: undefined,
			allowHttp: false,
		});
		expect(result.error).toBeUndefined();
		expect(result.content).toBe("Before {{command:review}} After");
	});
});
