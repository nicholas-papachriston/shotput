#!/usr/bin/env bun

/**
 * Example 04: Glob Patterns
 *
 * This example demonstrates using glob patterns to match multiple files
 * based on patterns. Glob patterns are powerful for including specific
 * file types or files matching certain patterns.
 *
 * Usage:
 *   bun run examples/basic/04-glob-patterns.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("04-glob-patterns");
const templateDir = join(import.meta.dir, "../output/04-glob-patterns");
mkdirSync(templateDir, { recursive: true });
const templateContent = `# Glob Pattern Examples

## Example 1: All TypeScript Files

Include all .ts files in the code directory:

{{../../data/code/*.ts}}

## Example 2: All Files Recursively

Include all files from data directory (recursively):

{{../../data/**/*}}

## Example 3: Specific File Extension

Only log files:

{{../../data/**/*.log}}

---

Glob patterns allow flexible file matching!
`;

const templatePath = join(templateDir, "template.md");

writeFileSync(templatePath, templateContent);

log.info(templateContent);

try {
  const glob = await shotput({
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "template-debug.md"),
  });

  log.info(glob.content);

  log.info(`Full output saved to: ${join(templateDir, "response.md")}`);

  const specificTemplate = `# Specific Pattern Matching

## Only CSV Files

{{../../data/**/*.csv}}

## Only Markdown Files

{{../../data/**/*.md}}

Done!
`;

  const specificTemplatePath = join(templateDir, "specific-template.md");
  writeFileSync(specificTemplatePath, specificTemplate);

  const specific = await shotput({
    templateDir,
    templateFile: "specific-template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "specific-template-debug.md"),
  });

  log.info(specific.content);

  log.info(`Full output saved to: ${join(templateDir, "specific-response.md")}`);
} catch (error) {
  log.error(error);

}

/**
 * Key Takeaways:
 *
 * 1. Glob Pattern Syntax:
 *    - * matches any characters in a filename (except /)
 *    - ** matches any characters including / (recursive)
 *    - *.ts matches all TypeScript files in current directory
 *    - **\/*.ts matches all TypeScript files recursively
 *
 * 2. Common Patterns:
 *    - {{/path/*.js}} - All .js files in /path
 *    - {{/path/**\/*.js}} - All .js files in /path and subdirectories
 *    - {{/path/**\/*}} - All files recursively
 *    - {{/path/test-*.txt}} - Files starting with "test-" and ending with .txt
 *
 * 3. Glob vs Directory:
 *    - Use {{dir/}} to include ALL files in one directory
 *    - Use glob patterns for selective inclusion or recursive matching
 *
 * 4. Performance:
 *    - Specific patterns are more efficient than broad patterns
 *    - Use the most specific pattern possible
 *
 * 5. Multiple Patterns:
 *    - You can use multiple glob patterns in the same template
 *    - Each pattern is processed independently
 *    - Files matching multiple patterns will be included multiple times
 *
 * 6. Order:
 *    - Files are processed in the order they match
 *    - Alphabetical within each pattern match
 */
