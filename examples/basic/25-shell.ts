#!/usr/bin/env bun

/**
 * Example 25: Embedded Shell Interpolation
 *
 * Demonstrates {{shell:...}} placeholders in template content. Shell output
 * is captured from stdout and interpolated directly into the result.
 *
 * Important:
 * - Shell execution is disabled by default; enable it with .allowShell(true).
 * - Use .shellTimeoutMs(...) to cap runtime for each command.
 *
 * Usage:
 *   bun run examples/basic/25-shell.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("25-shell");
const outputDir = join(import.meta.dir, "../output/25-shell");
mkdirSync(outputDir, { recursive: true });

const template = `# Shell Interpolation Demo

Date:
{{shell:date +%Y-%m-%d}}

Working directory:
{{shell:pwd}}

Current shell:
{{shell:printf '%s' "$SHELL"}}
`;

try {
	const result = await shotput()
		.template(template)
		.templateDir(outputDir)
		.responseDir(outputDir)
		.allowedBasePaths([join(import.meta.dir, "..")])
		.allowShell(true)
		.shellTimeoutMs(3000)
		.maxConcurrency(1)
		.run();

	writeFileSync(join(outputDir, "output.md"), result.content ?? "");
	console.log("--- Shell example output ---");
	console.log(result.content?.slice(0, 800));
} catch (error) {
	log.error(error);
}
