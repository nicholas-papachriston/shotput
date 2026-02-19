#!/usr/bin/env bun

/**
 * Example 18: Format utilities - Markdown
 *
 * Uses {{md:path}} to include file content (no filename prefix). Then demonstrates
 * markdownToHtml() and markdownToPlaintext() on the resolved content for HTML or
 * plain-text use in prompts.
 *
 * Usage:
 *   bun run examples/basic/18-format-markdown.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { markdownToHtml, markdownToPlaintext, shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("18-format-markdown");
const outputDir = join(import.meta.dir, "../output/18-format-markdown");
mkdirSync(outputDir, { recursive: true });

const template = `# Resolved content (Markdown)

{{md:../../data/article.md}}
`;

try {
	const result = await shotput({
		template,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
	});

	const content = result.content ?? "";
	writeFileSync(join(outputDir, "output.md"), content);

	// Render to HTML (GFM supported)
	const html = markdownToHtml(content);
	writeFileSync(join(outputDir, "output.html"), html);
	log.info(`HTML length: ${html.length}`);
	console.log("--- HTML excerpt (first 300 chars) ---");
	console.log(html.slice(0, 300));

	// Strip to plain text (for prompts or length estimation)
	const plain = markdownToPlaintext(content);
	writeFileSync(join(outputDir, "output-plain.txt"), plain);
	log.info(`Plain text length: ${plain.length}`);
	console.log("--- Plain text excerpt (first 200 chars) ---");
	console.log(plain.slice(0, 200));
} catch (error) {
	log.error(error);
}

/**
 * Key takeaways:
 * - markdownToHtml(text, options?) uses Bun's Markdown API; GFM (tables, strikethrough, task lists) enabled by default.
 * - markdownToPlaintext(text) strips formatting; use for including markdown content in prompts without HTML.
 */
