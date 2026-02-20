#!/usr/bin/env bun

/**
 * Example 06: Length Limits and Output Management
 *
 * This example demonstrates how to manage output size using length limits
 * and understand truncation behavior.
 *
 * Features:
 *   - maxPromptLength for total output control
 *   - maxBucketFiles for S3 prefix limits
 *   - Understanding truncation
 *   - Processing priority
 *
 * Usage:
 *   bun run examples/advanced/06-length-limits.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("06-length-limits");
const templateDir = join(import.meta.dir, "../output/06-length-limits");
mkdirSync(templateDir, { recursive: true });

const smallFile = "Small content.\n";
const mediumFile = "Medium content line.\n".repeat(100); // ~2KB
const largeFile = "Large content line.\n".repeat(5000); // ~100KB

writeFileSync(join(templateDir, "small.txt"), smallFile);
writeFileSync(join(templateDir, "medium.txt"), mediumFile);
writeFileSync(join(templateDir, "large.txt"), largeFile);

const lengthTemplate = `# Length Limit Example

## File 1 (Small)
{{./small.txt}}

## File 2 (Medium)
{{./medium.txt}}

## File 3 (Large)
{{./large.txt}}

## File 4 (This might not appear)
{{./small.txt}}
`;

const lengthTemplatePath = join(templateDir, "length-template.md");
writeFileSync(lengthTemplatePath, lengthTemplate);

try {
	const base = shotput()
		.templateDir(templateDir)
		.responseDir(templateDir)
		.allowedBasePaths([templateDir, join(import.meta.dir, "..")])
		.build();

	const result = await base
		.templateFile("length-template.md")
		.maxPromptLength(5000) // Only allow 5KB total
		.debug(true)
		.debugFile(join(templateDir, "length-debug.md"))
		.run();

	log.info(result.metadata);
} catch (error) {
	log.error("Failed:", error);
}

const priorityTemplate = `# Priority Matters

## High Priority (appears first)
{{./small.txt}}

## Medium Priority
{{./small.txt}}

## Low Priority (may be truncated)
{{./large.txt}}

## Lowest Priority (may be omitted)
{{./medium.txt}}
`;

const priorityTemplatePath = join(templateDir, "priority-template.md");
writeFileSync(priorityTemplatePath, priorityTemplate);

try {
	const result = await base
		.templateFile("priority-template.md")
		.maxPromptLength(1000)
		.run();

	log.info(result.metadata);
} catch (error) {
	log.error("Failed:", error);
}

if (process.env["S3_ACCESS_KEY_ID"]) {
	const s3Template = `# S3 Bucket Limits

## This prefix may have hundreds of files
{{s3://my-bucket/logs/2024/}}

## But we'll only process the first N files
`;

	const s3TemplatePath = join(templateDir, "s3-limit-template.md");
	writeFileSync(s3TemplatePath, s3Template);

	try {
		const result = await base
			.templateFile("s3-limit-template.md")
			.s3AccessKeyId(process.env["S3_ACCESS_KEY_ID"] ?? "")
			.s3SecretAccessKey(process.env["S3_SECRET_ACCESS_KEY"] ?? "")
			.s3Region(process.env["S3_REGION"] ?? "us-east-1")
			.maxBucketFiles(10) // Only process first 10 files
			.maxPromptLength(50000)
			.run();

		log.info(result.metadata);
	} catch (error) {
		log.error("S3 example failed:", error);
	}
}

const monitorTemplate = `# Monitor Output

{{./small.txt}}
{{./medium.txt}}
{{./large.txt}}
`;

const monitorTemplatePath = join(templateDir, "monitor-template.md");
writeFileSync(monitorTemplatePath, monitorTemplate);

try {
	const result = await base
		.templateFile("monitor-template.md")
		.maxPromptLength(200000)
		.run();

	log.info(result.metadata);
} catch (error) {
	log.error("Failed:", error);
}

/**
 * Key Takeaways:
 *
 * 1. maxPromptLength controls total output size
 * 2. maxBucketFiles limits files from S3 prefixes
 * 3. Templates are processed in order of appearance
 * 4. Earlier templates have priority over later ones
 * 5. Truncation happens on a per-template basis
 * 6. result.error indicates if processing failed
 * 7. result.metadata.resultMetadata shows details for each source
 * 8. Choose limits based on your use case
 * 9. Monitor metadata to understand what was included
 * 10. Consider processing time vs output size trade-offs
 */
