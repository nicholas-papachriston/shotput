#!/usr/bin/env bun

/**
 * Example 13: Token-Aware Budgeting
 *
 * When tokenizer is set, maxPromptLength is interpreted as max tokens
 * (not characters). Planning and truncation use token counts so output
 * aligns with model context windows (e.g. 128k tokens).
 *
 * Options:
 *   - tokenizer: undefined (default) -> character-based (unchanged behavior)
 *   - tokenizer: "openai" | "cl100k_base" -> heuristic (~4 chars per token)
 *   - tokenizer: (text: string) => number -> custom (e.g. tiktoken)
 *
 * Usage:
 *   bun run examples/advanced/13-token-budgeting.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("13-token-budgeting");
const templateDir = join(import.meta.dir, "../output/13-token-budgeting");
mkdirSync(templateDir, { recursive: true });

// Content that will be truncated when token budget is small
const longContent = "word ".repeat(500);
writeFileSync(join(templateDir, "long.txt"), longContent);

const template = `# Token Budget Demo

## Inline content (will be truncated by token limit)
{{./long.txt}}
`;

try {
	const base = shotput()
		.templateDir(templateDir)
		.template(template)
		.responseDir(templateDir)
		.allowedBasePaths([templateDir, join(import.meta.dir, "..")])
		.build();

	// Character-based (default): maxPromptLength in characters
	const charResult = await base.maxPromptLength(500).run();
	log.info(
		`Character-based: output length (chars) = ${charResult.content?.length}`,
	);

	// Token-based with heuristic: maxPromptLength in tokens (~4 chars/token)
	const tokenResult = await base
		.maxPromptLength(100) // 100 tokens
		.tokenizer("cl100k_base")
		.run();
	log.info(
		`Token-based (heuristic): output length (chars) = ${tokenResult.content?.length}`,
	);

	// Custom tokenizer: 1 word = 1 token for demo
	const customResult = await base
		.maxPromptLength(20) // 20 "tokens" (words)
		.tokenizer((text: string) => text.split(/\s+/).filter(Boolean).length)
		.run();
	const wordCount =
		customResult.content?.split(/\s+/).filter(Boolean).length ?? 0;
	log.info(`Custom tokenizer (words): output word count = ${wordCount}`);

	console.log("--- Token budgeting examples completed ---");
} catch (error) {
	log.error(error);
}
