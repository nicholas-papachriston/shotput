import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { resolveSubagent, shotput } from "../../src/index";
import { interpolation } from "../../src/interpolation";
import {
	createSubagentPlugin,
	parseSubagentFrontmatter,
} from "../../src/subagent";

const agentsDir = "test/fixtures/agents";

describe("parseSubagentFrontmatter", () => {
	it("should return null when no frontmatter", () => {
		expect(parseSubagentFrontmatter("# Just body")).toBeNull();
		expect(parseSubagentFrontmatter("no dashes")).toBeNull();
	});

	it("should parse frontmatter and body", () => {
		const content = `---
model: claude-opus-4-5
temperature: 0.1
---
# Body here`;
		const out = parseSubagentFrontmatter(content);
		expect(out).not.toBeNull();
		expect(out?.frontmatter.model).toBe("claude-opus-4-5");
		expect(out?.frontmatter.temperature).toBe(0.1);
		expect(out?.body.trim()).toBe("# Body here");
	});

	it("should parse array frontmatter", () => {
		const content = `---
tools:
  - read_file
  - search_files
---
body`;
		const out = parseSubagentFrontmatter(content);
		expect(out).not.toBeNull();
		expect(out?.frontmatter.tools).toEqual(["read_file", "search_files"]);
		expect(out?.body.trim()).toBe("body");
	});

	it("should parse boolean and number", () => {
		const content = `---
enabled: true
count: 42
---
x`;
		const out = parseSubagentFrontmatter(content);
		expect(out?.frontmatter["enabled"]).toBe(true);
		expect(out?.frontmatter["count"]).toBe(42);
	});
});

describe("subagent plugin", () => {
	it("should match rawPath starting with subagent:", () => {
		const plugin = createSubagentPlugin();
		expect(plugin.matches("subagent:security-reviewer")).toBe(true);
		expect(plugin.matches("command:review")).toBe(false);
	});
});

describe("resolveSubagent", () => {
	it("should return systemPrompt and agentConfig", async () => {
		const result = await resolveSubagent({
			subagentFile: "test/fixtures/agents/simple.md",
			allowedBasePaths: [process.cwd()],
			allowHttp: false,
		});
		expect(result.systemPrompt).toContain("# Simple Agent");
		expect(result.systemPrompt).toContain("Plain body");
		expect(result.agentConfig.model).toBe("simple-model");
		expect(result.agentConfig.temperature).toBe(0);
	});

	it("should resolve nested sources in body", async () => {
		const result = await resolveSubagent({
			subagentFile: "test/fixtures/agents/security-reviewer.md",
			allowedBasePaths: [process.cwd()],
			allowHttp: false,
		});
		expect(result.systemPrompt).toContain("Security Reviewer");
		expect(result.systemPrompt).toContain("Hello World!");
		expect(result.agentConfig.model).toBe("claude-opus-4-5");
		expect(result.agentConfig.tools).toEqual(["read_file", "search_files"]);
	});

	it("should throw when subagentFile missing", async () => {
		await expect(
			resolveSubagent({ allowedBasePaths: [process.cwd()] }),
		).rejects.toThrow("subagentFile");
	});

	it("should leave section markers as literal text in systemPrompt (no section parsing)", async () => {
		const result = await resolveSubagent({
			subagentFile: "test/fixtures/agents/with-sections.md",
			allowedBasePaths: [process.cwd()],
			allowHttp: false,
		});
		expect(result.systemPrompt).toContain("{{#section:foo}}");
		expect(result.systemPrompt).toContain("{{/section}}");
		expect(result.systemPrompt).toContain("this is literal section text");
		expect("sections" in result).toBe(false);
	});
});

describe("shotput with parseSubagentFrontmatter", () => {
	it("should set output.frontmatter when parseSubagentFrontmatter is true", async () => {
		const templateContent = `---
model: test-model
temperature: 0.5
---
# Template body`;
		const result = await shotput({
			template: templateContent,
			templateDir: process.cwd(),
			allowedBasePaths: [process.cwd()],
			parseSubagentFrontmatter: true,
			allowHttp: false,
		});
		expect(result.error).toBeUndefined();
		expect(result.frontmatter).toBeDefined();
		expect(result.frontmatter?.["model"]).toBe("test-model");
		expect(result.frontmatter?.["temperature"]).toBe(0.5);
		expect(result.content).toContain("# Template body");
	});

	it("should leave content unchanged when no frontmatter", async () => {
		const result = await shotput({
			template: "# No frontmatter",
			templateDir: process.cwd(),
			parseSubagentFrontmatter: true,
		});
		expect(result.content).toBe("# No frontmatter");
		expect(result.frontmatter).toBeUndefined();
	});
});

describe("{{subagent:name}} resolution", () => {
	const baseConfig = createConfig({
		allowedBasePaths: [process.cwd()],
		subagentsDir: agentsDir,
		customSources: [createSubagentPlugin()],
		templateDir: process.cwd(),
		allowHttp: false,
		maxConcurrency: 1,
	});

	it("should embed resolved body only (no frontmatter in output)", async () => {
		const template = "Parent says: {{subagent:simple}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("Parent says:");
		expect(result.processedTemplate).toContain("# Simple Agent");
		expect(result.processedTemplate).toContain("Plain body");
		expect(result.processedTemplate).not.toContain("simple-model");
	});

	it("should error when subagent not found", async () => {
		const template = "{{subagent:nonexistent}}";
		const result = await interpolation(template, baseConfig);
		expect(result.processedTemplate).toContain("[Error reading");
		expect(result.processedTemplate).toContain("subagent:nonexistent");
	});
});
