#!/usr/bin/env bun

/**
 * Example 23: Jinja auto-detection, includes, and jinja: format reference
 *
 * Demonstrates:
 * 1) Auto-detecting Jinja mode from .jinja templateFile extension
 * 2) {% include "..." %} preprocessing in Jinja templates
 * 3) {{jinja:path}} format reference from a Shotput template
 *
 * Usage:
 *   bun run examples/basic/23-jinja-includes-and-format.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";

const outputDir = join(
	import.meta.dir,
	"../output/23-jinja-includes-and-format",
);
const templateDir = join(outputDir, "templates");
const partialDir = join(templateDir, "partials");

mkdirSync(partialDir, { recursive: true });

writeFileSync(
	join(partialDir, "summary.jinja"),
	[
		"## Included Summary",
		"User: {{ user.name | upper }}",
		"Projects:",
		"{% for project in user.projects %}- {{ loop.index }}. {{ project }}",
		"{% else %}- none",
		"{% endfor %}",
	].join("\n"),
);

writeFileSync(
	join(templateDir, "main.jinja"),
	[
		"{% set title = 'Auto-detected Jinja template' %}",
		"# {{ title }}",
		"",
		'{% include "./partials/summary.jinja" %}',
	].join("\n"),
);

writeFileSync(
	join(partialDir, "card.jinja"),
	[
		"### Card",
		"Name: {{ user.name }}",
		"Project count: {{ user.projects | length }}",
	].join("\n"),
);

const context = {
	user: {
		name: "nick",
		projects: ["shotput", "docs", "benchmarks"],
	},
};

// 1) Auto-detected Jinja mode from .jinja extension (no .templateSyntax("jinja2"))
const autoDetected = await shotput()
	.templateDir(templateDir)
	.templateFile("main.jinja")
	.responseDir(outputDir)
	.allowedBasePaths([outputDir])
	.context(context)
	.run();

if (autoDetected.error !== undefined) {
	console.error("Auto-detected Jinja example failed:", autoDetected.error);
	process.exit(1);
}

writeFileSync(
	join(outputDir, "auto-detected-output.md"),
	autoDetected.content ?? "",
);

// 2) jinja: format reference in a Shotput template
const formatReferenced = await shotput()
	.template(
		["# jinja: format reference", "", "{{jinja:./partials/card.jinja}}"].join(
			"\n",
		),
	)
	.templateDir(templateDir)
	.responseDir(outputDir)
	.allowedBasePaths([outputDir])
	.context(context)
	.run();

if (formatReferenced.error !== undefined) {
	console.error("jinja: format example failed:", formatReferenced.error);
	process.exit(1);
}

writeFileSync(
	join(outputDir, "format-reference-output.md"),
	formatReferenced.content ?? "",
);

console.log("Wrote:");
console.log(`- ${join(outputDir, "auto-detected-output.md")}`);
console.log(`- ${join(outputDir, "format-reference-output.md")}`);
