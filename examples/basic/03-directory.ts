#!/usr/bin/env bun

/**
 * Example 03: Directory Inclusion
 *
 * This example demonstrates including all files from a directory.
 * When you reference a directory (path ending with /), Shotput will
 * include all files within that directory.
 *
 * Usage:
 *   bun run examples/basic/03-directory.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("03-directory");
const templateDir = join(import.meta.dir, "../output/03-directory");
mkdirSync(templateDir, { recursive: true });
const templateContent = `# Code Review: Utility Functions

## Overview

Below are all the utility files from our codebase for review:

## Source Code

{{../../data/code/}}

## End of Review

Note: Directory paths must end with a trailing slash (/) to be recognized as directories.
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, templateContent);

try {
  const instance = await shotput({
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "template-debug.md"),
  });

  log.info(instance);

  const logsTemplate = `# Application Logs

{{../data/logs/}}

End of logs.
`;

  const logsTemplatePath = join(templateDir, "logs-template.md");
  writeFileSync(logsTemplatePath, logsTemplate);

  const logs = await shotput({
    templateDir,
    templateFile: "logs-template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "logs-template-debug.md"),
  });

  log.info(logs);
} catch (error) {
  log.error(error);

}

/**
 * Key Takeaways:
 *
 * 1. Directory paths MUST end with a trailing slash (/)
 *    - Correct: {{/path/to/directory/}}
 *    - Wrong: {{/path/to/directory}}
 *
 * 2. All files in the directory are included automatically
 *
 * 3. Subdirectories are NOT included recursively (use glob for that)
 *
 * 4. Files are processed in alphabetical order
 *
 * 5. Empty directories will not cause errors
 *
 * 6. Each file's content is concatenated in sequence
 *
 * When to use directories vs glob patterns:
 * - Use {{dir/}} when you want ALL files in a single directory
 * - Use {{dir/**\/*.ext}} when you want specific file types or recursive inclusion
 */
