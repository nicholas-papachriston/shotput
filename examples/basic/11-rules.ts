#!/usr/bin/env bun

/**
 * Example 11: Rules (Conditional Inclusion)
 *
 * Demonstrates {{#if}}...{{else}}...{{/if}} blocks and config.context
 * for conditional inclusion. Conditions can use context, env, and params
 * (params come from commands). Uses JavaScript expression evaluation by default.
 *
 * Usage:
 *   bun run examples/basic/11-rules.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("11-rules");
const outputDir = join(import.meta.dir, "../output/11-rules");
mkdirSync(outputDir, { recursive: true });

const template = `# Conditional Context Demo

## Always shown
This section is always included.

## Task-specific (context.taskType)
{{#if context.taskType == "security"}}
SECURITY MODE: Include security guidelines here.
{{else}}
Default task context.
{{/if}}

## Environment (env)
{{#if env.DEBUG}}
DEBUG is set.
{{else}}
DEBUG is not set.
{{/if}}

## Nested conditionals
{{#if context.env == "prod"}}
Production config.
{{#if context.strict}}
Strict mode enabled.
{{/if}}
{{else}}
Non-production.
{{/if}}
`;

try {
	const resultProd = await shotput({
		template,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		context: { taskType: "security", env: "prod", strict: true },
		debug: true,
		debugFile: join(outputDir, "rules-prod-debug.txt"),
	});
	log.info(`Prod context: ${JSON.stringify(resultProd.metadata)}`);
	console.log("--- Prod output (excerpt) ---");
	console.log(resultProd.content?.slice(0, 400));

	const resultDefault = await shotput({
		template,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		context: { env: "staging" },
		debug: false,
	});
	log.info(`Default context: ${JSON.stringify(resultDefault.metadata)}`);
	console.log("--- Default output (excerpt) ---");
	console.log(resultDefault.content?.slice(0, 350));
} catch (error) {
	log.error(error);
}
