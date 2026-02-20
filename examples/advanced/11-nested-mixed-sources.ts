#!/usr/bin/env bun
/**
 * Example 11: Nested Templates with Mixed Sources
 *
 * This example combines nested template resolution with multiple source types
 * in a single chain: file -> skill -> file -> function + HTTP.
 *
 * - Level 0: Root template includes a file
 * - Level 1: File includes a skill and another file
 * - Level 2: File includes a function and an HTTP resource
 *
 * Demonstrates recursive interpolation across file, skill, function, and HTTP.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("11-nested-mixed-sources");

const EXAMPLE_DIR = join(process.cwd(), "examples");
const DATA_DIR = join(EXAMPLE_DIR, "data", "nested-mixed");
const OUTPUT_DIR = join(EXAMPLE_DIR, "output", "11-nested-mixed-sources");
const SKILLS_DIR = join(DATA_DIR, "skills");
const SHARED_DATA_DIR = join(EXAMPLE_DIR, "data");

/**
 * Setup: Create nested chain with mixed source types
 * Root -> level1.md (file) -> skill + level2.txt (file) -> function + HTTP
 */
function setupTestData() {
	try {
		rmSync(DATA_DIR, { recursive: true, force: true });
	} catch (e) {
		// Ignore if directory does not exist
	}

	mkdirSync(DATA_DIR, { recursive: true });
	mkdirSync(OUTPUT_DIR, { recursive: true });
	mkdirSync(SHARED_DATA_DIR, { recursive: true });

	// Timestamp function used by level2 (shared data dir)
	const timestampFunction = `
export default async function(result, path, match, remainingLength) {
  const timestamp = new Date().toISOString();
  const content = "Generated at: " + timestamp;
  return {
    operationResults: result.replace(match, content),
    combinedRemainingCount: remainingLength - content.length,
  };
}
`;
	writeFileSync(
		join(SHARED_DATA_DIR, "timestamp-function.js"),
		timestampFunction.trim(),
	);

	// Minimal local skill (no nested markers) so the example stays self-contained
	mkdirSync(join(SKILLS_DIR, "nested-demo-skill"), { recursive: true });
	writeFileSync(
		join(SKILLS_DIR, "nested-demo-skill", "SKILL.md"),
		`---
name: nested-demo-skill
description: Minimal skill for nested mixed-sources example
---

# Nested Demo Skill

This skill is included from a file in the nested chain.
It has no nested template markers.`,
	);

	// Level 1: File that includes a skill and another file
	writeFileSync(
		join(DATA_DIR, "level1.md"),
		`## Level 1 (file)

First we pull in a skill:

{{skill:nested-demo-skill}}

Then we include the next level:

{{./level2.txt}}`,
	);

	// Level 2: File that includes a function and HTTP (mixed sources)
	writeFileSync(
		join(DATA_DIR, "level2.txt"),
		`## Level 2 (mixed sources)

Dynamic timestamp from function:
{{TemplateType.Function:../../data/timestamp-function.js}}

GitHub API quote:
{{https://api.github.com/zen}}`,
	);
}

async function runNestedMixedExample() {
	log.info("--- Nested templates with mixed sources ---");

	const template = `# Nested Mixed Sources Demo

This template chains: file -> skill + file -> function + HTTP.

{{./level1.md}}`;

	const result = await shotput()
		.template(template)
		.templateDir(DATA_DIR)
		.allowedBasePaths([EXAMPLE_DIR, DATA_DIR, SHARED_DATA_DIR])
		.skillsDir(SKILLS_DIR) // local skills under data/nested-mixed/skills
		.allowHttp(true)
		.allowedDomains(["api.github.com"])
		.httpTimeout(10000)
		.allowFunctions(true)
		.allowedFunctionPaths([SHARED_DATA_DIR])
		.maxNestingDepth(3)
		.maxConcurrency(1) // Sequential so inclusion base path is used for nested markers
		.debug(true)
		.debugFile(join(OUTPUT_DIR, "nested-mixed-debug.txt"))
		.run();

	log.info(result.metadata);
}

async function main() {
	setupTestData();

	try {
		await runNestedMixedExample();
	} catch (error) {
		log.error(`Example failed: ${error}`);
	}
}

main();
