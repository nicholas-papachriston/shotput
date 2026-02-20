#!/usr/bin/env bun

/**
 * Example 04: Large File Streaming
 *
 * This example demonstrates Shotput's automatic streaming for large files (>1MB).
 * Streaming prevents memory exhaustion when processing large files.
 *
 * Features:
 *   - Automatic streaming for files >1MB
 *   - Memory-efficient processing
 *   - Works with local files, S3, and HTTP
 *   - Configurable length limits
 *
 * Usage:
 *   bun run examples/advanced/04-streaming.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("04-streaming");
const templateDir = join(import.meta.dir, "../output/04-streaming");
mkdirSync(templateDir, { recursive: true });

const largeContent = "Large file content line.\n".repeat(80000); // ~2MB
const largeFilePath = join(templateDir, "large-file.txt");
writeFileSync(largeFilePath, largeContent);

const streamingTemplate = `# Streaming Example

## Large Local File (will be streamed)
{{./large-file.txt}}

## Regular File (no streaming needed)
{{../../data/config.json}}
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, streamingTemplate);

try {
	const result = await shotput()
		.templateDir(templateDir)
		.templateFile("template.md")
		.responseDir(templateDir)
		.maxPromptLength(500000) // 500KB limit
		.allowedBasePaths([join(import.meta.dir, "..")])
		.debug(true)
		.debugFile(join(templateDir, "streaming-debug.md"))
		.run();

	log.info(result.metadata);
} catch (error) {
	log.error(error);
}

// Example 2: Streaming from S3
if (process.env["S3_ACCESS_KEY_ID"] && process.env["S3_SECRET_ACCESS_KEY"]) {
	const s3StreamingTemplate = `# S3 Streaming

## Large S3 File (will be streamed)
{{s3://my-bucket/large-data/export.json}}

## Small S3 File
{{s3://my-bucket/config.json}}
`;

	const s3TemplatePath = join(templateDir, "s3-streaming-template.md");
	writeFileSync(s3TemplatePath, s3StreamingTemplate);

	try {
		const result = await shotput()
			.templateDir(templateDir)
			.templateFile("s3-streaming-template.md")
			.responseDir(templateDir)
			.s3AccessKeyId(process.env["S3_ACCESS_KEY_ID"] ?? "")
			.s3SecretAccessKey(process.env["S3_SECRET_ACCESS_KEY"] ?? "")
			.s3Region(process.env["S3_REGION"] ?? "us-east-1")
			.maxPromptLength(1000000) // 1MB limit
			.debug(true)
			.debugFile(join(templateDir, "s3-streaming-debug.md"))
			.run();
		log.info(result.metadata);
	} catch (error) {
		log.error(error);
	}
} else {
	log.info("\n=== Example 2: Skipped (no S3 credentials) ===");
}

// Example 3: Understanding truncation
const truncationTemplate = `# Truncation Example
{{./large-file.txt}}
This text may not appear if the file is too large.
`;

const truncationPath = join(templateDir, "truncation-template.md");
writeFileSync(truncationPath, truncationTemplate);

try {
	const result = await shotput()
		.templateDir(templateDir)
		.templateFile("truncation-template.md")
		.responseDir(templateDir)
		.maxPromptLength(10000) // Very small limit to demonstrate truncation
		.allowedBasePaths([join(import.meta.dir, "..")])
		.debug(true)
		.debugFile(join(templateDir, "truncation-debug.md"))
		.run();

	log.info(result.metadata);
} catch (error) {
	log.error(error);
}

/**
 * Key Takeaways:
 *
 * 1. Files >1MB are automatically streamed (no configuration needed)
 * 2. Streaming prevents memory exhaustion with large files
 * 3. Use maxPromptLength to control total output size
 * 4. Truncation happens on a per-template basis
 * 5. Later templates may be omitted if length limit is reached
 * 6. Streaming works with local files, S3, HTTP, and R2
 * 7. Check result.error and result.metadata for processing status
 * 8. result.metadata.resultMetadata shows details for each source
 */
