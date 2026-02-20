#!/usr/bin/env bun

/**
 * Example 05: Regex Patterns
 *
 * This example demonstrates using regex patterns to match file paths.
 * Regex patterns provide maximum flexibility for complex file matching.
 *
 * Usage:
 *   bun run examples/basic/05-regex-patterns.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("05-regex-patterns");
const templateDir = join(import.meta.dir, "../output/05-regex-patterns");
mkdirSync(templateDir, { recursive: true });
const templateContent = `# Regex Pattern Matching Examples

## Example 1: Match Files by Extension

Match all .ts files using regex:

{{../../data/code/.*\.ts$}}

## Example 2: Match Files by Name Pattern

Match files containing "api" or "utils":

{{../../data/code/.*(api|utils).*}}

## Example 3: Match Log Files

Match all .log files:

{{../../data/logs/.*\.log$}}

---

Regex patterns provide powerful, flexible file matching!
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, templateContent);

try {
	const base = shotput()
		.templateDir(templateDir)
		.responseDir(templateDir)
		.allowedBasePaths([join(import.meta.dir, "..")])
		.debug(true)
		.build();

	const template = await base
		.templateFile("template.md")
		.debugFile(join(templateDir, "template-debug.md"))
		.run();

	log.info(template.metadata);

	const complexTemplate = `# Complex Regex Patterns

  ## Match JSON Files in Data Directory

  {{../../data/.*\.json$}}

  ## Match Files Starting with Specific Prefix

  {{../../data/code/api.*}}

  ## Match CSV Files

  {{../../data/.*\.csv$}}

  Complete!
  `;

	const complexTemplatePath = join(templateDir, "complex-template.md");
	writeFileSync(complexTemplatePath, complexTemplate);

	const complex = await base
		.templateFile("complex-template.md")
		.debugFile(join(templateDir, "complex-template-debug.md"))
		.run();

	log.info(complex.metadata);
} catch (error) {
	log.error(error);
}

/**
 * Key Takeaways:
 *
 * 1. Regex Syntax:
 *    - Use standard JavaScript regex syntax
 *    - Patterns are matched against full file paths
 *    - Remember to escape special characters with \\
 *
 * 2. Common Regex Patterns:
 *    - {{\\.ts$}} - Files ending with .ts
 *    - {{^/path/}} - Files starting with /path/
 *    - {{(api|utils)}} - Files containing "api" OR "utils"
 *    - {{\\.test\\.}} - Files containing ".test."
 *    - {{^(?!.*test).*\\.ts$}} - .ts files NOT containing "test"
 *
 * 3. Special Characters to Escape:
 *    - . (dot) → \\.
 *    - $ (end) → already special, use directly
 *    - ^ (start) → already special, use directly
 *    - | (or) → use in parentheses: (a|b)
 *    - * (asterisk) → \\*
 *
 * 4. Regex vs Glob:
 *    - Regex: More powerful, flexible, but complex syntax
 *    - Glob: Simpler, more intuitive for basic patterns
 *    - Use regex when glob patterns aren't sufficient
 *
 * 5. Performance:
 *    - Specific patterns perform better than broad patterns
 *    - Avoid overly complex regex that backtrack heavily
 *    - Test patterns on representative file sets
 *
 * 6. Debugging:
 *    - Test regex patterns in isolation first
 *    - Use online regex testers for validation
 *    - Enable debug mode to see what files are matched
 *
 * 7. Case Sensitivity:
 *    - Patterns are case-sensitive by default
 *    - Use (?i) flag for case-insensitive matching: {{(?i)\\.LOG$}}
 */
