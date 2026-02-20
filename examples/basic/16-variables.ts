#!/usr/bin/env bun

/**
 * Example 16: Variable Substitution in Template Body
 *
 * Demonstrates {{context.x}}, {{params.x}}, and {{env.X}} placeholders
 * that are substituted with string values in the template body (not only
 * inside {{#if}} conditions). Use for task names, scope, env vars, etc.
 *
 * Usage:
 *   bun run examples/basic/16-variables.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("16-variables");
const outputDir = join(import.meta.dir, "../output/16-variables");
mkdirSync(outputDir, { recursive: true });

const template = `# Variable Substitution Demo

## Task and scope (context)
Task: {{context.taskName}}
Scope: {{context.scope}}

## Nested context
Project: {{context.project.name}}
Phase: {{context.project.phase}}

## Params (e.g. from commands)
Request ID: {{params.requestId}}
Limit: {{params.limit}}

## Environment
User: {{env.USER}}
Shell: {{env.SHELL}}
`;

try {
	const result = await shotput()
		.template(template)
		.templateDir(outputDir)
		.responseDir(outputDir)
		.allowedBasePaths([join(import.meta.dir, "..")])
		.context({
			taskName: "security-audit",
			scope: "api",
			project: { name: "shotput", phase: "beta" },
			// params can be added to context for variable substitution
			params: { requestId: "req-abc-123", limit: "50" },
		})
		.debug(false)
		.run();

	writeFileSync(join(outputDir, "output.md"), result.content ?? "");
	console.log("--- Output (context + params + env) ---");
	console.log(result.content?.slice(0, 700));

	// Show that missing keys become empty string
	const minimal = await shotput()
		.template("Task: {{context.taskName}} Missing: {{context.missing}}")
		.templateDir(outputDir)
		.responseDir(outputDir)
		.context({ taskName: "only-this" })
		.run();
	writeFileSync(join(outputDir, "output-minimal.md"), minimal.content ?? "");
	console.log("\n--- Missing key yields empty string ---");
	console.log(minimal.content);
} catch (error) {
	log.error(error);
}
