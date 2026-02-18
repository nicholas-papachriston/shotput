#!/usr/bin/env bun

/**
 * Example 14: Commands (Reusable Template Actions)
 *
 * Demonstrates {{command:name key=value}} and commandsDir. Commands are
 * Markdown files with YAML frontmatter (name, description, parameters with
 * defaults). {{$paramName}} is substituted in the body; params are injected
 * into rules context for {{#if params.x}}. Command body is recursively
 * interpolated (files, skills, etc.).
 *
 * Usage:
 *   bun run examples/basic/14-commands.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("14-commands");
const examplesDir = join(process.cwd(), "examples");
const outputDir = join(examplesDir, "output/14-commands");
mkdirSync(outputDir, { recursive: true });

const templateWithParams = `# Commands Demo

## Review with custom scope/severity
{{command:review scope=src severity=critical}}

---
## Onboard (no params)
{{command:onboard}}
`;

try {
	const result = await shotput({
		template: templateWithParams,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [examplesDir],
		commandsDir: "data/commands",
		maxConcurrency: 1,
		debug: true,
		debugFile: join(outputDir, "commands-debug.txt"),
	});
	log.info(result.metadata);
	console.log("Output length:", result.content?.length ?? 0);
	console.log("Excerpt:", result.content?.slice(0, 500));
} catch (error) {
	log.error(error);
}
