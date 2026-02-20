import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { shotput } from "../../src/index";
import type { HookSet } from "../../src/index";
import { formatMessages, parseOutputSections } from "../../src/sections";

describe("sections", () => {
	it("should parse sectioned output and return flat when outputMode is flat", async () => {
		const config = createConfig({
			template: "hello",
			outputMode: "flat",
		});
		const result = await shotput().with(config).run();
		expect(result.content).toBe("hello");
		expect(result.sections).toBeUndefined();
		expect(result.metadata.outputMode).toBe("flat");
	});

	it("should extract named sections in sectioned mode", async () => {
		const config = createConfig({
			template:
				"{{#section:system stable=true}}system content{{/section}}\n{{#section:context}}context content{{/section}}",
			outputMode: "sectioned",
		});
		const result = await shotput().with(config).run();
		expect(result.sections).toBeDefined();
		expect(result.sections?.length).toBe(2);
		expect(result.sections?.[0].name).toBe("system");
		expect(result.sections?.[0].content).toBe("system content");
		expect(result.sections?.[0].stable).toBe(true);
		expect(result.sections?.[0].contentHash).toBeDefined();
		expect(result.sections?.[0].contentHash.length).toBe(64);
		expect(result.sections?.[1].name).toBe("context");
		expect(result.sections?.[1].content).toBe("context content");
		expect(result.sections?.[1].stable).toBe(false);
	});

	it("should produce consistent contentHash for same content", () => {
		const { sections } = parseOutputSections("{{#section:a}}same{{/section}}");
		const hash1 = sections[0].contentHash;
		const { sections: sections2 } = parseOutputSections(
			"{{#section:a}}same{{/section}}",
		);
		expect(sections2[0].contentHash).toBe(hash1);
	});

	it("should map sections to messages when outputMode is messages", async () => {
		const config = createConfig({
			template:
				"{{#section:sys}}system text{{/section}}\n{{#section:ctx}}user text{{/section}}",
			outputMode: "messages",
			sectionRoles: { sys: "system", ctx: "user" },
		});
		const result = await shotput().with(config).run();
		expect(result.messages).toBeDefined();
		expect(result.messages?.length).toBe(2);
		expect(result.messages?.[0].role).toBe("system");
		expect(result.messages?.[0].content).toBe("system text");
		expect(result.messages?.[1].role).toBe("user");
		expect(result.messages?.[1].content).toBe("user text");
	});

	it("formatMessages filters by sectionRoles", () => {
		const sections = [
			{
				name: "a",
				content: "A",
				stable: false,
				contentHash: "1",
				metadata: [],
			},
			{
				name: "b",
				content: "B",
				stable: false,
				contentHash: "2",
				metadata: [],
			},
		];
		const messages = formatMessages(sections, { a: "system" });
		expect(messages.length).toBe(1);
		expect(messages[0].role).toBe("system");
		expect(messages[0].content).toBe("A");
	});

	it("should trim section content when sectionBudgets is set", () => {
		const { sections } = parseOutputSections(
			"{{#section:x}}hello world long content{{/section}}",
			{ x: 5 },
		);
		expect(sections[0].content).toBe("hello");
	});

	it("should include nested section markup in outer section content", () => {
		const content =
			"{{#section:outer}}before{{#section:inner}}nested{{/section}}after{{/section}}";
		const { sections } = parseOutputSections(content);
		// Only top-level sections are extracted; inner is part of outer's content
		expect(sections).toHaveLength(1);
		expect(sections[0].name).toBe("outer");
		expect(sections[0].content).toContain("before");
		expect(sections[0].content).toContain("{{#section:inner}}");
		expect(sections[0].content).toContain("nested");
		expect(sections[0].content).toContain("{{/section}}");
		expect(sections[0].content).toContain("after");
	});

	it("parseOutputSections returns remainingContent for text outside sections", () => {
		const content = "prefix{{#section:a}}A{{/section}}suffix";
		const { sections, remainingContent } = parseOutputSections(content);
		expect(sections).toHaveLength(1);
		expect(sections[0].content).toBe("A");
		expect(remainingContent).toContain("prefix");
		expect(remainingContent).toContain("suffix");
	});

	it("should parse sections after rules, interpolation, and hooks in full pipeline", async () => {
		const preResolveSuffix = "[preResolve]";
		const hooks: HookSet = {
			preResolve: (t) => t + preResolveSuffix,
			postResolveSource: (result) => ({
				...result,
				content: `[wrapped:${result.content.trim().slice(0, 80)}]`,
			}),
		};
		const config = createConfig({
			template:
				"{{#section:sys}}prefix {{test/fixtures/test.txt}} suffix{{/section}}",
			templateDir: process.cwd(),
			allowedBasePaths: [process.cwd()],
			outputMode: "sectioned",
			hooks,
			maxConcurrency: 1,
		});
		const result = await shotput().with(config).run();
		expect(result.error).toBeUndefined();
		expect(result.sections).toBeDefined();
		expect(result.sections?.length).toBe(1);
		expect(result.sections?.[0].name).toBe("sys");
		const sectionContent = result.sections?.[0].content ?? "";
		expect(sectionContent).toContain("prefix");
		expect(sectionContent).toContain("suffix");
		expect(sectionContent).toContain("[wrapped:");
		expect(sectionContent).toContain("Hello World");
		expect(result.content ?? "").toContain(preResolveSuffix);
	});
});
