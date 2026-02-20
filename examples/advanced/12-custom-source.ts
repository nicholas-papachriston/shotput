#!/usr/bin/env bun

/**
 * Example 12: Custom Source Plugin
 *
 * Demonstrates customSources: a SourcePlugin that matches a URL scheme
 * (e.g. echo://) and resolves content. Plugins can return mergeContext for
 * rules (e.g. command params), canContainTemplates for recursive interpolation,
 * and estimateLength for planning.
 *
 * Usage:
 *   bun run examples/advanced/12-custom-source.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import type { SourceContext, SourcePlugin } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("12-custom-source");
const outputDir = join(import.meta.dir, "../output/12-custom-source");
mkdirSync(outputDir, { recursive: true });

const echoPlugin: SourcePlugin = {
	name: "echo",
	canContainTemplates: false,
	matches: (rawPath) => rawPath.startsWith("echo://"),
	estimateLength: async (rawPath) => rawPath.length + 20,
	async resolve(ctx: SourceContext) {
		const path = ctx.rawPath.slice("echo://".length);
		const content = `[echo: ${path}]`;
		return {
			content,
			remainingLength: ctx.remainingLength - content.length,
		};
	},
};

const template = `# Custom Source Demo

## Echo plugin
{{echo://hello/world}}

## Another
{{echo://custom/source}}

## With file
{{../../data/config.json}}
`;

try {
	const result = await shotput()
		.template(template)
		.templateDir(outputDir)
		.responseDir(outputDir)
		.allowedBasePaths([join(import.meta.dir, "..")])
		.customSources([echoPlugin])
		.debug(true)
		.debugFile(join(outputDir, "custom-source-debug.txt"))
		.run();
	log.info(result.metadata);
	console.log("Output:", result.content?.slice(0, 400));
} catch (error) {
	log.error(error);
}
