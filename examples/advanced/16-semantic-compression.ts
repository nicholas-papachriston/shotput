#!/usr/bin/env bun

/**
 * Example 16: Semantic Context Compression
 *
 * When a context budget is exceeded, Shotput normally drops low-priority sources entirely.
 * By defining a `compressor`, low-priority sources can instead be semantically compressed
 * (e.g. summarized via an LLM or heuristically shrunk) to fit the remaining budget.
 *
 * Usage:
 *   bun run examples/advanced/16-semantic-compression.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("16-semantic-compression");
const templateDir = join(import.meta.dir, "../output/16-semantic-compression");

try {
	mkdirSync(templateDir, { recursive: true });
	const hugeText = "Shotput is an incredible context assembly engine. ".repeat(
		200,
	);
	writeFileSync(join(templateDir, "huge.txt"), hugeText);

	const base = shotput()
		.templateDir(templateDir)
		.template("System prompt prefix.\n\n{{./huge.txt}}")
		.allowedBasePaths([templateDir])
		.maxPromptLength(150)
		.build();

	log.info(
		"1. Without compression (truncates linearly or drops content if over budget)",
	);

	const charResult = await base.run();
	log.info(`Result length without compressor: ${charResult.content?.length}`);
	log.info(`Content preview: ${charResult.content?.slice(0, 80)}...\n`);

	log.info("2. With semantic compressor (actively shrinking content)");

	const compressedResult = await base
		.compressor(async (content, { maxBudget, unit }) => {
			log.info(
				`[Compressor Invoked] Shrinking content (size: ${content.length}) to fit budget: ${maxBudget} ${unit}`,
			);
			// Mocking an LLM summarization step
			const summary =
				"[LLM Summary: The source file contained a repetitive description of Shotput's capabilities.]";
			// Ensure we return something within budget
			return summary.slice(0, maxBudget);
		})
		.run();

	log.info(
		`Result length with compressor: ${compressedResult.content?.length}`,
	);
	log.info(`Content:\n${compressedResult.content}\n`);
} catch (error) {
	log.error(error);
}
