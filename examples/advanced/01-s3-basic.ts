#!/usr/bin/env bun

/**
 * Example 01: Basic S3 Integration
 *
 * This example demonstrates basic S3 file and prefix access using Shotput.
 * It shows how to fetch individual files and list entire prefixes (directories).
 *
 * Prerequisites:
 *   - Set S3_ACCESS_KEY_ID in environment
 *   - Set S3_SECRET_ACCESS_KEY in environment
 *   - Set S3_REGION in environment (or use config)
 *   - Ensure you have S3 buckets with test data
 *
 * Usage:
 *   export S3_ACCESS_KEY_ID=your-key
 *   export S3_SECRET_ACCESS_KEY=your-secret
 *   export S3_REGION=us-east-1
 *   bun run examples/advanced/01-s3-basic.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("01-s3-basic");
const templateDir = join(import.meta.dir, "../output/01-s3-basic");
mkdirSync(templateDir, { recursive: true });

if (!process.env["S3_ACCESS_KEY_ID"] || !process.env["S3_SECRET_ACCESS_KEY"]) {
	log.error(
		"Missing required S3 credentials. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
	);
	log.info("Example: export S3_ACCESS_KEY_ID=your-key");
	log.info("Example: export S3_SECRET_ACCESS_KEY=your-secret");
}

const singleFileTemplate = `# S3 File Example

## Configuration File from S3
{{s3://my-bucket/config/production.json}}

## Another file
{{s3://my-bucket/data/settings.json}}
`;

const singleFilePath = join(templateDir, "single-file-template.md");
writeFileSync(singleFilePath, singleFileTemplate);

try {
	const result = await shotput({
		templateDir,
		templateFile: "single-file-template.md",
		responseDir: templateDir,
		s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
		s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
		s3Region: process.env["S3_REGION"] || "us-east-1",
		debug: true,
		debugFile: join(templateDir, "single-file-debug.md"),
	});

	log.info(result.metadata);
} catch (error) {
	log.error(error);
}

const prefixTemplate = `# S3 Prefix Example

## All logs from today
{{s3://my-bucket/logs/2024/01/15/}}

This will include all files under this prefix.
`;

const prefixPath = join(templateDir, "prefix-template.md");
writeFileSync(prefixPath, prefixTemplate);

try {
	const result = await shotput({
		templateDir,
		templateFile: "prefix-template.md",
		responseDir: templateDir,
		s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
		s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
		s3Region: process.env["S3_REGION"] || "us-east-1",
		maxBucketFiles: 50, // Limit number of files from prefix
		debug: true,
		debugFile: join(templateDir, "prefix-debug.md"),
	});

	log.info(result.metadata);
} catch (error) {
	log.error(error);
}

/**
 * Key Takeaways:
 *
 * 1. S3 files use the s3://bucket/key syntax
 * 2. S3 prefixes (directories) end with a trailing slash
 * 3. Credentials can be set via environment variables or config
 * 4. Use maxBucketFiles to limit how many files are fetched from a prefix
 * 5. The metadata includes detailed information about each processed template
 * 6. Errors are collected and reported in metadata.errors
 * 7. Processing is done efficiently with parallel operations where possible
 */
