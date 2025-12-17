#!/usr/bin/env bun

/**
 * Example 02: Multiple File Interpolation
 *
 * This example demonstrates including multiple files in a single template.
 * Files are processed in the order they appear in the template.
 *
 * Usage:
 *   bun run examples/basic/02-multiple-files.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("02-multiple-files");
const templateDir = join(import.meta.dir, "../output/02-multiple-files");
mkdirSync(templateDir, { recursive: true });
const templateContent = `# Project Documentation

## Configuration

Below is our application configuration:

{{../../data/config.json}}

## Team Members

Our current team roster:

{{../../data/users.csv}}

## Technical Article

Recent documentation:

{{../../data/article.md}}

---

All files included successfully! The order of inclusion matches the order in the template.
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, templateContent);

try {
  const result = await shotput({
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "template-debug.md"),
  });

  log.info(result);

} catch (error) {
  log.error(error);

}

/**
 * Key Takeaways:
 *
 * 1. Multiple files can be included in a single template
 * 2. Files are processed in the ORDER they appear in the template
 * 3. Different file types (JSON, CSV, MD) can be mixed
 * 4. Each file's content is inserted at its template marker location
 * 5. The original template structure is preserved
 * 6. Metadata tracks each file separately
 *
 * Order Matters:
 * !! Priority when determining what files to concatenate follows
 *    the order of the template strings in your template file !!
 */
