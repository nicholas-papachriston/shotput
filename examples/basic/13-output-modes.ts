#!/usr/bin/env bun

/**
 * Example 13: Output Modes (Sectioned and Messages)
 *
 * Demonstrates outputMode: "sectioned" and "messages" with {{#section:name}} blocks.
 * Sectioned output returns named sections with contentHash for cache optimization.
 * Messages mode maps sections to roles for chat API consumption.
 *
 * Usage:
 *   bun run examples/basic/13-output-modes.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("13-output-modes");
const outputDir = join(import.meta.dir, "../output/13-output-modes");
mkdirSync(outputDir, { recursive: true });

const templateWithSections = `{{#section:system stable=true}}
# System (stable)
This is the system block. It rarely changes.
{{../../data/config.json}}
{{/section}}

{{#section:context}}
# Context (variable)
This block changes per request.
{{../../data/article.md}}
{{/section}}

{{#section:history}}
# History
Recent turns go here.
{{/section}}
`;

try {
	const sectioned = await shotput({
		template: templateWithSections,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		outputMode: "sectioned",
		debug: true,
		debugFile: join(outputDir, "sectioned-debug.txt"),
	});
	log.info(`Sectioned metadata: ${JSON.stringify(sectioned.metadata)}`);
	if (sectioned.sections) {
		for (const s of sectioned.sections) {
			console.log(
				`Section "${s.name}": ${s.content.length} chars, hash=${s.contentHash.slice(0, 12)}..., stable=${s.stable}`,
			);
		}
	}

	const messages = await shotput({
		template: templateWithSections,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		outputMode: "messages",
		sectionRoles: { system: "system", context: "user", history: "user" },
		debug: false,
	});
	log.info(`Messages metadata: ${JSON.stringify(messages.metadata)}`);
	if (messages.messages) {
		for (const m of messages.messages) {
			console.log(`Message role=${m.role} length=${m.content.length}`);
		}
	}
} catch (error) {
	log.error(error);
}
