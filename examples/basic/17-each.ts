#!/usr/bin/env bun

/**
 * Example 17: {{#each}} Loops Over Arrays
 *
 * Demonstrates {{#each context.list}}...{{/each}} to iterate over arrays.
 * Inside the block, {{context.__loop.item}} is the current element and
 * {{context.__loop.index}} is the zero-based index. Works with context.*
 * and params.*. Combine with {{#if}} and variable substitution.
 *
 * Usage:
 *   bun run examples/basic/17-each.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("17-each");
const outputDir = join(import.meta.dir, "../output/17-each");
mkdirSync(outputDir, { recursive: true });

const template = `# {{#each}} Demo

## Simple list (context.items)
{{#each context.items}}
- {{context.__loop.item}}
{{/each}}

## With index
{{#each context.names}}
{{context.__loop.index}}. {{context.__loop.item}}
{{/each}}

## Conditional inside each
{{#each context.scores}}
{{#if context.__loop.item >= context.passing}}
Pass: {{context.__loop.item}}
{{else}}
Fail: {{context.__loop.item}}
{{/if}}
{{/each}}

## Empty list
{{#each context.empty}}
(should not appear)
{{/each}}
Done.
`;

try {
	const result = await shotput({
		template,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		context: {
			items: ["alpha", "beta", "gamma"],
			names: ["Alice", "Bob", "Carol"],
			scores: [45, 72, 58, 90],
			passing: 60,
			empty: [],
		},
		debug: false,
	});

	console.log("--- {{#each}} output ---");
	console.log(result.content);
} catch (error) {
	log.error(error);
}
