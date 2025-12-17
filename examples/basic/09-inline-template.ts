#!/usr/bin/env bun

/**
 * Example 09: Inline Template Content
 *
 * This example demonstrates using template content directly as a string
 * instead of reading from a file. This is useful for:
 * - Programmatically generated templates
 * - Templates stored in databases or memory
 * - Dynamic template composition
 * - Testing and prototyping
 *
 * Usage:
 *   bun run examples/basic/09-inline-template.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("09-inline-template");
const outputDir = join(import.meta.dir, "../output/09-inline-template");
mkdirSync(outputDir, { recursive: true });
const simpleTemplate = `# Simple Inline Template

This template is defined as a string in the code, not read from a file.

## Configuration Data

{{../../data/config.json}}

## End
`;

try {
	const result = await shotput({
		template: simpleTemplate,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		debug: true,
		debugFile: join(outputDir, "simple-template-debug.md"),
	});

	log.info(result.metadata);

	const multiTemplate = `# Data Summary

## Users
{{../../data/users.csv}}

## Article
{{../../data/article.md}}

---
Generated from inline template
`;
	const multiResult = await shotput({
		template: multiTemplate,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		debug: true,
		debugFile: join(outputDir, "multi-template-debug.md"),
	});

	log.info(multiResult.metadata);

	const timestamp = new Date().toISOString();
	const fileToInclude = "../../data/config.json";

	const dynamicTemplate = `# Dynamic Report
Generated at: ${timestamp}

## System Configuration
{{${fileToInclude}}}

## Summary
This template was dynamically generated at runtime with embedded timestamp and computed file paths.
`;
	const dynamicResult = await shotput({
		template: dynamicTemplate,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		debug: true,
		debugFile: join(outputDir, "dynamic-template-debug.md"),
	});

	log.info(dynamicResult.metadata);

	const filesToInclude = ["config.json", "users.csv", "article.md"];
	const sections = filesToInclude.map((file, index) => {
		return `## Section ${index + 1}: ${file}\n{{../../data/${file}}}\n`;
	});

	const programmaticTemplate = `# Programmatically Built Template

This template was constructed by iterating over a list of files.

${sections.join("\n")}

---
Total sections: ${filesToInclude.length}
`;

	const programmaticResult = await shotput({
		template: programmaticTemplate,
		templateDir: join(import.meta.dir, "../output/09-inline-template"),
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
		debug: true,
		debugFile: join(outputDir, "programmatic-template-debug.md"),
	});

	log.info(programmaticResult.metadata);
} catch (error) {
	log.error(error);
}

/**
 * Key Takeaways:
 *
 * 1. Template Parameter:
 *    - Use `template: string` to provide inline content
 *    - Overrides `templateFile` when provided
 *    - Still requires `templateDir` for resolving relative paths
 *
 * 2. Use Cases:
 *    - Dynamic template generation
 *    - Templates from databases or APIs
 *    - Programmatic composition
 *    - Testing without file I/O
 *    - Template preprocessing
 *
 * 3. Path Resolution:
 *    - templateDir is used as the base for relative paths in the template
 *    - Interpolation markers like {{../../data/file.txt}} are resolved relative to templateDir
 *    - All security validations still apply
 *
 * 4. Combining with Other Features:
 *    - Works with all template types (files, directories, globs, HTTP, functions, skills)
 *    - Security settings (allowedBasePaths, allowHttp, etc.) work the same
 *    - Debug output still available
 *
 * 5. Benefits:
 *    - No need to write template to disk first
 *    - Easier testing and prototyping
 *    - Better for dynamic/generated templates
 *    - Reduces file I/O operations
 *
 * 6. Best Practices:
 *    - Always set templateDir to provide proper base path for resolution
 *    - Include allowedBasePaths for security
 *    - Validate/sanitize dynamic template content
 *    - Consider escaping user input in templates
 *    - Use for appropriate use cases (not just to avoid files)
 *
 * 7. Pattern Examples:
 *    ```ts
 *    // From environment variable
 *    const template = process.env.TEMPLATE_CONTENT;
 *
 *    // From database
 *    const template = await db.getTemplate('report-template');
 *
 *    // Dynamically composed
 *    const template = `# ${title}\n{{${dataFile}}}`;
 *
 *    // From API
 *    const response = await fetch('https://api.example.com/template');
 *    const template = await response.text();
 *    ```
 */
