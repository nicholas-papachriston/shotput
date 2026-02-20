#!/usr/bin/env bun

/**
 * Example 21: Format references (yaml, json, jsonl, xml, md)
 *
 * Demonstrates all in-template format references in one template:
 * {{yaml:path}}, {{json:path}}, {{jsonl:path}}, {{xml:path}}, {{md:path}}.
 * Each parses the file and expands as formatted content (objects as JSON; md as content).
 *
 * Usage:
 *   bun run examples/basic/21-format-references.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("21-format-references");
const outputDir = join(import.meta.dir, "../output/21-format-references");
mkdirSync(outputDir, { recursive: true });

const template = `# Format references demo

## YAML (expanded as JSON)
{{yaml:../../data/sample.yaml}}

## JSON (pretty-printed)
{{json:../../data/config.json}}

## JSONL (expanded as JSON array)
{{jsonl:../../data/sample.jsonl}}

## XML (formatted)
{{xml:../../data/sample.xml}}

## Markdown (content as-is)
{{md:../../data/article.md}}
`;

try {
	const result = await shotput()
		.template(template)
		.templateDir(outputDir)
		.responseDir(outputDir)
		.allowedBasePaths([join(import.meta.dir, "..")])
		.run();

	const content = result.content ?? "";
	writeFileSync(join(outputDir, "output.md"), content);

	log.info(`Output length: ${content.length}`);
	console.log("--- Excerpt (first 600 chars) ---");
	console.log(content.slice(0, 600));
	console.log("...");
} catch (error) {
	log.error(error);
}

/**
 * Key takeaways:
 * - {{yaml:path}}, {{json:path}}, {{jsonl:path}}, {{xml:path}} parse and expand as formatted text.
 * - {{md:path}} inserts file content without parsing.
 * - Paths are relative to templateDir and validated against allowedBasePaths.
 */
