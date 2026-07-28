import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	OKF_VERSION,
	asOkfFrontmatter,
	conceptIdFromPath,
	isOkfFrontmatter,
	okfTimestamp,
	parseOkfDocument,
	preferOkfDocument,
	shotput,
	splitYamlFrontmatter,
} from "../../src/index";

describe("OKF parsing", () => {
	it("exports OKF_VERSION 0.1", () => {
		expect(OKF_VERSION).toBe("0.1");
	});

	it("splitYamlFrontmatter returns null without delimiters", () => {
		expect(splitYamlFrontmatter("# No frontmatter")).toBeNull();
	});

	it("parseOkfDocument requires type", () => {
		const withoutType = `---
title: Only title
---
Body`;
		expect(parseOkfDocument(withoutType)).toBeNull();

		const withType = `---
type: Playbook
title: Agent Guide
tags:
  - agents
timestamp: 2026-07-27T12:00:00Z
---
# Agent Guide

Body text.`;
		const parsed = parseOkfDocument(withType, {
			path: "docs/agents.md",
		});
		expect(parsed).not.toBeNull();
		expect(parsed?.okf.type).toBe("Playbook");
		expect(parsed?.okf.title).toBe("Agent Guide");
		expect(parsed?.okf.tags).toEqual(["agents"]);
		expect(parsed?.body).toContain("# Agent Guide");
		expect(parsed?.conceptId).toBe("docs/agents");
	});

	it("tolerates OKF v0.2 generated.at", () => {
		const doc = `---
type: Reference
title: Spec
generated:
  by: human:nick
  at: 2026-07-27T18:00:00Z
---
Body`;
		const parsed = parseOkfDocument(doc);
		expect(parsed?.okf.generated).toEqual({
			by: "human:nick",
			at: "2026-07-27T18:00:00Z",
		});
		expect(okfTimestamp(parsed?.okf ?? { type: "x" })).toBe(
			"2026-07-27T18:00:00Z",
		);
	});

	it("isOkfFrontmatter and asOkfFrontmatter", () => {
		expect(isOkfFrontmatter({ type: "Playbook" })).toBe(true);
		expect(isOkfFrontmatter({ title: "no type" })).toBe(false);
		expect(asOkfFrontmatter({ type: "  " })).toBeNull();
		expect(asOkfFrontmatter({ type: "Reference" })?.type).toBe("Reference");
	});

	it("conceptIdFromPath strips .md", () => {
		expect(conceptIdFromPath("research/profiles/nick.md")).toBe(
			"research/profiles/nick",
		);
	});

	it("preferOkfDocument strips body only when enabled", () => {
		const content = `---
type: Finding
title: Price check
---
Fact body`;
		expect(preferOkfDocument(content, false).content).toBe(content);
		const preferred = preferOkfDocument(content, true);
		expect(preferred.content).toBe("Fact body");
		expect(preferred.okf?.type).toBe("Finding");
	});
});

describe("shotput parseOkf", () => {
	const tempDir = join(process.cwd(), "test-temp-okf");

	beforeEach(() => {
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("sets output.okf as preferred metadata for OKF root templates", async () => {
		const template = `---
type: Playbook
title: Root Prompt
description: System prompt with OKF metadata
tags: [prompts]
timestamp: 2026-07-27T12:00:00Z
---
# Instructions

Hello {{context.user}}.`;
		const result = await shotput()
			.with({
				template,
				templateDir: process.cwd(),
				allowedBasePaths: [process.cwd()],
				parseOkf: true,
				context: { user: "nick" },
				allowHttp: false,
			})
			.run();
		expect(result.error).toBeUndefined();
		expect(result.okf?.type).toBe("Playbook");
		expect(result.okf?.title).toBe("Root Prompt");
		expect(result.frontmatter?.["type"]).toBe("Playbook");
		expect(result.content).toContain("Hello nick");
		expect(result.content).not.toContain("type: Playbook");
	});

	it("does not strip non-OKF frontmatter when only parseOkf is true", async () => {
		const template = `---
model: test-model
---
Body only`;
		const result = await shotput()
			.with({
				template,
				templateDir: process.cwd(),
				parseOkf: true,
				allowHttp: false,
			})
			.run();
		expect(result.okf).toBeUndefined();
		expect(result.frontmatter).toBeUndefined();
		expect(result.content).toContain("model: test-model");
	});

	it("parseSubagentFrontmatter also sets okf when type is present", async () => {
		const template = `---
type: Reference
title: Shared
model: ignored-for-okf-check
---
Body`;
		const result = await shotput()
			.with({
				template,
				templateDir: process.cwd(),
				parseSubagentFrontmatter: true,
				allowHttp: false,
			})
			.run();
		expect(result.okf?.type).toBe("Reference");
		expect(result.frontmatter?.["model"]).toBe("ignored-for-okf-check");
		expect(result.content?.trim()).toBe("Body");
	});

	it("attaches okf on file source resultMetadata and strips from content", async () => {
		const conceptPath = join(tempDir, "concept.md");
		writeFileSync(
			conceptPath,
			`---
type: Finding
title: Live quote
timestamp: 2026-07-27T15:00:00Z
---
Quoted price is $120.`,
		);
		const result = await shotput()
			.with({
				template: "Context:\n{{./concept.md}}",
				templateDir: tempDir,
				allowedBasePaths: [tempDir],
				parseOkf: true,
				allowHttp: false,
				maxConcurrency: 1,
			})
			.run();
		expect(result.error).toBeUndefined();
		expect(result.content).toContain("Quoted price is $120.");
		expect(result.content).not.toContain("type: Finding");
		const entry = result.metadata.resultMetadata?.find((m) =>
			m.path.includes("concept.md"),
		);
		expect(entry?.okf?.type).toBe("Finding");
		expect(entry?.okf?.title).toBe("Live quote");
	});
});
