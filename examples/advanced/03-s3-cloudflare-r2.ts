#!/usr/bin/env bun

/**
 * Example 03: Cloudflare R2 Storage
 *
 * This example demonstrates using Cloudflare R2 (S3-compatible storage)
 * with Shotput. R2 offers zero egress fees and S3-compatible API.
 *
 * Prerequisites:
 *   - Cloudflare R2 account
 *   - R2 API credentials
 *   - CLOUDFLARE_R2_URL set to your account endpoint
 *
 * Usage:
 *   export S3_ACCESS_KEY_ID=your-r2-access-key
 *   export S3_SECRET_ACCESS_KEY=your-r2-secret-key
 *   export CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
 *   bun run examples/advanced/03-s3-cloudflare-r2.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("03-s3-cloudflare-r2");
const templateDir = join(import.meta.dir, "../output/03-s3-cloudflare-r2");
mkdirSync(templateDir, { recursive: true });

// Check for Cloudflare R2 credentials
if (!process.env["S3_ACCESS_KEY_ID"] || !process.env["S3_SECRET_ACCESS_KEY"]) {
  log.error("Missing R2 credentials");
  log.info("Get credentials from: Cloudflare Dashboard > R2 > Manage R2 API Tokens");
}

if (!process.env["CLOUDFLARE_R2_URL"]) {
  log.error("Missing CLOUDFLARE_R2_URL");
  log.info("Format: account-id.r2.cloudflarestorage.com");
  log.info("Find it in: Cloudflare Dashboard > R2 > Overview");
}

const r2Template = `# Cloudflare R2 Example

## Cached Data
{{s3://cache-bucket/api/responses.json}}

## User Uploads
{{s3://user-uploads/images/}}

## Static Assets
{{s3://cdn-assets/config.json}}
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, r2Template);

try {
  const result = await shotput({
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,
    cloudflareR2Url: process.env["CLOUDFLARE_R2_URL"],
    s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
    s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
    maxBucketFiles: 100,
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
 * 1. R2 uses the same S3 syntax: s3://bucket/key
 * 2. Configure via cloudflareR2Url parameter
 * 3. R2 offers zero egress fees (no charges for downloads)
 * 4. Fully S3-compatible API
 * 5. Global distribution without multi-region complexity
 * 6. Same security and validation as standard S3
 * 7. Works with all Shotput features (prefixes, streaming, etc.)
 */
