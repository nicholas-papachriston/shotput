#!/usr/bin/env bun

/**
 * Example 12: Hooks (Transform Pipeline)
 *
 * Demonstrates preResolve, postResolveSource, postAssembly, and preOutput hooks.
 * Use hooks for token counting, sanitization, validation, or logging without
 * changing Shotput core.
 *
 * Usage:
 *   bun run examples/basic/12-hooks.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import type { AssemblyContext, HookSet, SourceResult } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("12-hooks");
const outputDir = join(import.meta.dir, "../output/12-hooks");
mkdirSync(outputDir, { recursive: true });

const hooks: HookSet = {
	preResolve: (template) => {
		log.info(`preResolve: template length = ${template.length}`);
		return template;
	},
	postResolveSource: (result: SourceResult) => {
		log.info(
			`postResolveSource: ${result.type} ${result.path} (${result.content.length} chars)`,
		);
		return result;
	},
	postAssembly: (ctx: AssemblyContext) => {
		log.info(`postAssembly: total content length = ${ctx.content.length}`);
		if (ctx.content.length > 50_000) {
			log.warn("Content exceeds 50k; would abort with return false");
			return false;
		}
		return ctx;
	},
	preOutput: (output) => {
		log.info("preOutput: trimming final output");
		return {
			...output,
			content: output.content?.trimEnd() ?? "",
		};
	},
};

const template = `# Hooks Demo

## File content
{{../../data/config.json}}

## End
`;

try {
	const result = await shotput()
		.template(template)
		.templateDir(outputDir)
		.responseDir(outputDir)
		.allowedBasePaths([join(import.meta.dir, "..")])
		.hooks(hooks)
		.debug(true)
		.debugFile(join(outputDir, "hooks-debug.txt"))
		.run();
	log.info(result.metadata);
	console.log("Output length:", result.content?.length ?? 0);
} catch (error) {
	log.error(error);
}
