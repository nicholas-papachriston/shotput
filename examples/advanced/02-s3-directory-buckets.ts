#!/usr/bin/env bun

/**
 * Example 02: S3 Directory Buckets (AWS S3 Express One Zone)
 *
 * This example demonstrates using AWS S3 Express One Zone directory buckets,
 * which provide single-digit millisecond latency for high-performance workloads.
 *
 * Directory buckets are automatically detected by their naming pattern:
 * bucket-name--azid--x-s3
 *
 * Prerequisites:
 *   - AWS S3 Express One Zone enabled
 *   - Directory bucket created (e.g., my-data--use1-az4--x-s3)
 *   - S3 credentials with appropriate permissions
 *
 * Usage:
 *   export S3_ACCESS_KEY_ID=your-key
 *   export S3_SECRET_ACCESS_KEY=your-secret
 *   export S3_REGION=us-east-1
 *   bun run examples/advanced/02-s3-directory-buckets.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("02-s3-directory-buckets");
const templateDir = join(import.meta.dir, "../output/02-s3-directory-buckets");
mkdirSync(templateDir, { recursive: true });

if (!process.env["S3_ACCESS_KEY_ID"] || !process.env["S3_SECRET_ACCESS_KEY"]) {
  log.error("Missing S3 credentials");

}

const directoryBucketTemplate = `# Directory Bucket Example

## High-Performance Logs (Directory Bucket)
{{s3://logs--use1-az4--x-s3/app/current.log}}

## Recent Events (Directory Bucket)
{{s3://events--use1-az4--x-s3/2024/01/}}

## Standard Bucket for Comparison
{{s3://archive-bucket/old-logs/app.log}}
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, directoryBucketTemplate);

try {
  const startTime = Date.now();

  const result = await shotput({
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,
    s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
    s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
    s3Region: process.env["S3_REGION"] || "us-east-1",
    debug: true,
    debugFile: join(templateDir, "template-debug.md"),
  });

  const totalTime = Date.now() - startTime;

  log.info(result.content);
  log.info(`Total processing time: ${totalTime}ms`);
} catch (error) {
  log.error(error);

}

/**
 * Key Takeaways:
 *
 * 1. Directory buckets are detected automatically by naming pattern
 * 2. Format: bucket-name--availability-zone-id--x-s3
 * 3. Provide significantly lower latency than standard buckets
 * 4. Best for high-performance, low-latency workloads
 * 5. Must be in same AZ as your compute for best performance
 * 6. Support both single files and prefix operations
 * 7. No special configuration needed - Shotput detects them automatically
 */
