#!/usr/bin/env bun

/**
 * Example 01: Simple File Interpolation
 *
 * This example demonstrates the most basic feature of Shotput:
 * including the contents of a single file in your template.
 *
 * Usage:
 *   bun run examples/basic/01-simple-file.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("01-simple-file");
const templateDir = join(import.meta.dir, "../output/01-simple-file");
mkdirSync(templateDir, { recursive: true });

const templateContent = `# My Configuration

Here is the configuration file for the application:

{{../../data/config.json}}

End of configuration.
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
 * 1. File paths can be absolute or relative to the template directory
 * 2. The {{path}} syntax is replaced with the file contents
 * 3. Shotput preserves the surrounding text in your template
 * 4. The result includes both content and metadata about processing
 * 5. Security validation ensures paths are within allowed base paths
 */
