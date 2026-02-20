#!/usr/bin/env bun

/**
 * Example 15: Subagent Definitions
 *
 * Demonstrates resolveSubagent() and {{subagent:name}}. Subagent files are
 * Markdown with YAML frontmatter (model, temperature, tools, permissions, etc.)
 * and a body that is resolved as the system prompt. parseSubagentFrontmatter
 * in shotput() strips frontmatter and returns it as output.frontmatter.
 *
 * Usage:
 *   bun run examples/basic/15-subagents.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveSubagent, shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("15-subagents");
const examplesDir = join(process.cwd(), "examples");
const outputDir = join(examplesDir, "output/15-subagents");
mkdirSync(outputDir, { recursive: true });

try {
	const resolved = await resolveSubagent({
		subagentFile: join(examplesDir, "data", "agents", "reviewer.md"),
		allowedBasePaths: [examplesDir],
		templateDir: examplesDir,
		allowHttp: false,
	}).run();
	log.info(`resolveSubagent metadata: ${JSON.stringify(resolved.metadata)}`);
	console.log("Agent config:", resolved.agentConfig);
	console.log("System prompt length:", resolved.systemPrompt.length);

	const templateWithSubagent = `# Coordinator

For code review, delegate to:

{{subagent:reviewer}}

End.`;

	const result = await shotput()
		.template(templateWithSubagent)
		.templateDir(examplesDir)
		.responseDir(outputDir)
		.allowedBasePaths([examplesDir])
		.subagentsDir("data/agents")
		.maxConcurrency(1)
		.debug(true)
		.debugFile(join(outputDir, "subagents-debug.txt"))
		.run();
	log.info(result.metadata);
	console.log(
		"Output contains subagent body:",
		result.content?.includes("Code Reviewer") ?? false,
	);

	const subagentTemplate = `---
model: example-model
temperature: 0.5
---
# Inline subagent body
This was parsed as frontmatter + body.`;
	const withFrontmatter = await shotput()
		.template(subagentTemplate)
		.templateDir(outputDir)
		.parseSubagentFrontmatter(true)
		.debug(false)
		.run();
	console.log("Frontmatter from inline:", withFrontmatter.frontmatter);
	console.log("Content:", withFrontmatter.content?.slice(0, 80));
} catch (error) {
	log.error(error);
}
