#!/usr/bin/env bun

/**
 * Example 19: Format utilities - JSONL
 *
 * Uses {{jsonl:path}} to parse JSONL and expand as a JSON array in the template.
 * Also demonstrates parseJsonl() and parseJsonlChunk() programmatically.
 *
 * Usage:
 *   bun run examples/basic/19-format-jsonl.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonl, parseJsonlChunk, shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("19-format-jsonl");
const outputDir = join(import.meta.dir, "../output/19-format-jsonl");
mkdirSync(outputDir, { recursive: true });

const template = `Records:
{{jsonl:../../data/sample.jsonl}}
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

	// Content is "Records:\n" + formatted JSON array; parse the array part for display
	const jsonBlock = content.replace(/^Records:\n/s, "").trim();
	const records = JSON.parse(jsonBlock) as unknown[];
	log.info(`Expanded ${records.length} records from {{jsonl:path}}`);
	console.log("--- {{jsonl:path}} expanded output ---");
	for (const r of records) {
		console.log(r);
	}

	// Programmatic: parseJsonlChunk for streaming
	const chunk1 = '{"a":1}\n{"b":2}\n{"c":3';
	const res1 = parseJsonlChunk(chunk1);
	console.log("--- parseJsonlChunk() (streaming) ---");
	console.log("values:", res1.values);
	console.log("read:", res1.read);
	console.log("done:", res1.done);
} catch (error) {
	log.error(error);
}

/**
 * Key takeaways:
 * - {{jsonl:path}} parses the file and expands as a JSON array in the template.
 * - parseJsonl(input) parses a full string or Uint8Array; throws on invalid JSON.
 * - parseJsonlChunk(input, start?, end?) for streaming; returns { values, read, done, error }.
 */
