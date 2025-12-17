#!/usr/bin/env bun

/**
 * Example 07: Mixed Sources
 *
 * This example demonstrates combining multiple source types in a single template:
 * local files, S3, HTTP, functions, skills, globs, and regex patterns.
 *
 * Usage:
 *   bun run examples/advanced/07-mixed-sources.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("07-mixed-sources");
const templateDir = join(import.meta.dir, "../output/07-mixed-sources");
const dataDir = join(import.meta.dir, "../data");
mkdirSync(templateDir, { recursive: true });

// Create a custom function
const transformFunction = `
export default async function(result, path, match, remainingLength) {
  const timestamp = new Date().toISOString();
  const content = \`Generated at: \${timestamp}\`;
  return {
    operationResults: result.replace(match, content),
    combinedRemainingCount: remainingLength - content.length,
  };
}
`;

const functionPath = join(dataDir, "timestamp-function.js");
writeFileSync(functionPath, transformFunction);

// Create the mixed-source template
const mixedTemplate = `# Mixed Source Template

This template demonstrates combining different source types in one document.

---

## Section 1: Local Files

Configuration from local file:
{{../../data/config.json}}

---

## Section 2: Multiple Files via Glob

All TypeScript files in the data/code directory:
{{../../data/code/*.ts}}

---

## Section 3: Dynamic Function Output

{{TemplateType.Function:../../data/timestamp-function.js}}

---

## Section 4: HTTP Resource

Random wisdom from GitHub:
{{https://api.github.com/zen}}

---

## Section 5: Directory Contents

All files from data directory:
{{../../data/}}

---

## Section 6: Regex Pattern Matching

All JSON files (using regex):
{{data/.*\\.json$}}

${process.env["S3_ACCESS_KEY_ID"] ? `
---

## Section 7: S3 Resources

Configuration from S3:
{{s3://my-bucket/config/app.json}}

Logs from S3 prefix:
{{s3://my-bucket/logs/latest/}}
` : ''}

---

## Summary

This template combined:
- Local files (absolute and relative paths)
- Glob patterns
- Directory inclusion
- Custom functions
- HTTP resources
${process.env["S3_ACCESS_KEY_ID"] ? '- S3 files and prefixes' : ''}
- Regex patterns

All processed in a single run!
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, mixedTemplate);

try {
  const config = {
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,

    // Allow local files
    allowedBasePaths: [dataDir, templateDir, join(import.meta.dir, "..")],

    // Allow HTTP
    allowHttp: true,
    allowedDomains: ["api.github.com"],
    httpTimeout: 10000,

    // Allow functions
    allowFunctions: true,
    allowedFunctionPaths: [dataDir],

    // S3 configuration (if available)
    s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
    s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
    s3Region: process.env["S3_REGION"] || "us-east-1",
    maxBucketFiles: 20,

    // Output limits
    maxPromptLength: 500000,

    // Debugging
    debug: true,
    debugFile: join(templateDir, "mixed-debug.md"),
  };

  log.info("Processing template with mixed sources...");
  const startTime = Date.now();

  const result = await shotput(config);

  const totalTime = Date.now() - startTime;

  log.info(`✓ Processing completed in ${totalTime}ms`);
  log.info(result.content?.slice(0, 500));
} catch (error) {
  log.error("Failed to process mixed template:", error);

}

/**
 * Key Takeaways:
 *
 * 1. Shotput can combine any source types in a single template
 * 2. Each source type is processed with its own handler
 * 3. Processing happens in order of appearance
 * 4. All security rules apply to their respective sources
 * 5. Metadata tracks each template individually
 * 6. Errors in one template don't stop processing of others
 * 7. Configure only the features you need
 * 8. Use metadata to understand what was processed
 * 9. Mixed sources enable powerful composition patterns
 * 10. Processing is optimized with parallel operations where possible
 */
