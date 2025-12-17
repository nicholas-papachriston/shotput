#!/usr/bin/env bun

/**
 * S3 Bucket Setup Script
 *
 * This script uploads sample data to S3 buckets needed for running the
 * Shotput advanced examples. Buckets must be created manually first.
 *
 * Prerequisites:
 *   - S3 buckets already created (see SETUP.md for instructions)
 *   - AWS credentials configured
 *   - S3_REGION environment variable (defaults to us-east-1)
 *
 * Usage:
 *   export S3_ACCESS_KEY_ID=your-key
 *   export S3_SECRET_ACCESS_KEY=your-secret
 *   export S3_REGION=us-east-1
 *   bun run examples/setup-s3-buckets.ts
 *
 * Options:
 *   --dry-run    Show what would be uploaded without actually uploading
 *   --cleanup    Delete all uploaded objects
 *   --r2         Setup Cloudflare R2 buckets instead of AWS S3
 */

import { S3Client } from "bun";
import { getLogger } from "../src/logger";

const log = getLogger("setup-s3-buckets");

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isCleanup = args.includes("--cleanup");
const isR2 = args.includes("--r2");

// Configuration
const region =
	process.env["S3_REGION"] || process.env["AWS_REGION"] || "us-east-1";
const accessKeyId =
	process.env["S3_ACCESS_KEY_ID"] || process.env["AWS_ACCESS_KEY_ID"];
const secretAccessKey =
	process.env["S3_SECRET_ACCESS_KEY"] || process.env["AWS_SECRET_ACCESS_KEY"];
const sessionToken =
	process.env["S3_SESSION_TOKEN"] || process.env["AWS_SESSION_TOKEN"];
const r2Url = process.env["CLOUDFLARE_R2_URL"] || "";

// Validate credentials
if (!accessKeyId || !secretAccessKey) {
	log.error("Missing AWS/S3 credentials!");
	log.info("Please set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
	log.info("Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
}

if (isR2 && !r2Url) {
	log.error("Missing Cloudflare R2 URL!");
	log.info("Please set CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com");
}

// Bucket definitions
interface BucketConfig {
	name: string;
	type: "standard" | "directory" | "r2";
	files: {
		key: string;
		content: string;
	}[];
}

const buckets: BucketConfig[] = [
	// Standard buckets for basic examples
	{
		name: "my-bucket",
		type: "standard",
		files: [
			{
				key: "config/production.json",
				content: JSON.stringify(
					{
						environment: "production",
						version: "1.0.0",
						features: {
							caching: true,
							logging: true,
							monitoring: true,
						},
						endpoints: {
							api: "https://api.example.com",
							cdn: "https://cdn.example.com",
						},
					},
					null,
					2,
				),
			},
			{
				key: "data/settings.json",
				content: JSON.stringify(
					{
						maxConnections: 100,
						timeout: 30000,
						retryAttempts: 3,
						logLevel: "info",
					},
					null,
					2,
				),
			},
			{
				key: "config.json",
				content: JSON.stringify(
					{
						appName: "Shotput Example",
						version: "2.0.0",
					},
					null,
					2,
				),
			},
			{
				key: "config/app.json",
				content: JSON.stringify(
					{
						name: "Mixed Sources Example",
						enabled: true,
					},
					null,
					2,
				),
			},
			{
				key: "logs/2024/01/15/app-001.log",
				content:
					"[2024-01-15 10:00:01] INFO Application started\n[2024-01-15 10:00:02] INFO Connected to database\n[2024-01-15 10:00:03] INFO Server listening on port 3000\n",
			},
			{
				key: "logs/2024/01/15/app-002.log",
				content:
					"[2024-01-15 11:00:01] INFO Processing request\n[2024-01-15 11:00:02] INFO Request completed\n",
			},
			{
				key: "logs/2024/app.log",
				content:
					"[2024-01-15] Application log entry\n[2024-01-16] Another log entry\n",
			},
			{
				key: "logs/latest/current.log",
				content: `[${new Date().toISOString()}] Latest log entry\n`,
			},
			{
				key: "large-data/export.json",
				content: JSON.stringify(
					{
						data: Array(1000)
							.fill(null)
							.map((_, i) => ({
								id: i,
								timestamp: new Date().toISOString(),
								value: Math.random() * 1000,
								metadata: {
									processed: true,
									version: "1.0",
								},
							})),
					},
					null,
					2,
				),
			},
		],
	},

	// Archive bucket for directory bucket example
	{
		name: "archive-bucket",
		type: "standard",
		files: [
			{
				key: "old-logs/app.log",
				content:
					"[2023-12-01] Archived log entry\n[2023-12-02] Another archived entry\n",
			},
		],
	},

	// R2 buckets (Cloudflare)
	{
		name: "cache-bucket",
		type: "r2",
		files: [
			{
				key: "api/responses.json",
				content: JSON.stringify(
					{
						cached: true,
						timestamp: new Date().toISOString(),
						data: {
							status: "success",
							results: [1, 2, 3, 4, 5],
						},
					},
					null,
					2,
				),
			},
		],
	},
	{
		name: "user-uploads",
		type: "r2",
		files: [
			{
				key: "images/sample.json",
				content: JSON.stringify(
					{
						filename: "sample.jpg",
						size: 12345,
						uploadedAt: new Date().toISOString(),
					},
					null,
					2,
				),
			},
		],
	},
	{
		name: "cdn-assets",
		type: "r2",
		files: [
			{
				key: "config.json",
				content: JSON.stringify(
					{
						cdnUrl: "https://cdn.example.com",
						version: "1.0.0",
						assets: ["styles.css", "app.js"],
					},
					null,
					2,
				),
			},
		],
	},
];

// Directory buckets info (manual setup required)
const directoryBuckets = [
	{
		name: "logs--use1-az4--x-s3",
		availabilityZone: "use1-az4",
		region: "us-east-1",
	},
	{
		name: "events--use1-az4--x-s3",
		availabilityZone: "use1-az4",
		region: "us-east-1",
	},
];

// Helper to get S3 client for a bucket
function getS3Client(bucketName: string): S3Client {
	const config: any = {
		accessKeyId,
		secretAccessKey,
		region,
		bucket: bucketName,
	};

	if (sessionToken) {
		config.sessionToken = sessionToken;
	}

	if (isR2 && r2Url) {
		config.endpoint = `https://${r2Url}`;
	}

	return new S3Client(config);
}

// Upload a file to S3
async function uploadFile(
	bucketName: string,
	key: string,
	content: string,
): Promise<boolean> {
	log.info(`  Uploading: s3://${bucketName}/${key}`);

	if (isDryRun) {
		log.info(
			`  [DRY RUN] Would upload ${content.length} bytes to s3://${bucketName}/${key}`,
		);
		return true;
	}

	try {
		const client = getS3Client(bucketName);
		const file = client.file(key);
		await file.write(content);
		log.info(`    ✓ Uploaded: ${key} (${content.length} bytes)`);
		return true;
	} catch (error: any) {
		log.error(`    ✗ Failed to upload ${key}: ${error.message}`);
		return false;
	}
}

// Delete a file from S3
async function deleteFile(bucketName: string, key: string): Promise<boolean> {
	log.info(`  Deleting: s3://${bucketName}/${key}`);

	if (isDryRun) {
		log.info(`  [DRY RUN] Would delete s3://${bucketName}/${key}`);
		return true;
	}

	try {
		const client = getS3Client(bucketName);
		const file = client.file(key);
		await file.delete();
		log.info(`    ✓ Deleted: ${key}`);
		return true;
	} catch (error: any) {
		// File might not exist, that's ok
		log.info(`    ⊘ File not found: ${key}`);
		return true;
	}
}

// Main execution
async function main() {
	log.info("=== Shotput S3 Bucket Setup ===\n");

	if (isDryRun) {
		log.info("🔍 DRY RUN MODE - No changes will be made\n");
	}

	if (isCleanup) {
		log.info("🗑️  CLEANUP MODE - Deleting all uploaded files\n");
	}

	const targetBuckets = isR2
		? buckets.filter((b) => b.type === "r2")
		: buckets.filter((b) => b.type === "standard");

	if (isCleanup) {
		// Cleanup mode
		log.info(`Deleting files from ${targetBuckets.length} buckets...\n`);

		for (const bucket of targetBuckets) {
			log.info(`\n📦 ${bucket.name}`);
			let deleted = 0;
			for (const file of bucket.files) {
				if (await deleteFile(bucket.name, file.key)) {
					deleted++;
				}
			}
			log.info(`   ✓ Deleted ${deleted}/${bucket.files.length} files`);
		}

		log.info("\n✓ Cleanup complete!");
		return;
	}

	// Setup mode
	log.info("⚠️  IMPORTANT: Buckets must be created manually first!");
	log.info("   See SETUP.md for bucket creation instructions\n");
	log.info(`Uploading sample data to ${targetBuckets.length} buckets...\n`);

	let totalUploaded = 0;
	let totalFailed = 0;

	for (const bucket of targetBuckets) {
		log.info(`\n📦 ${bucket.name} (${bucket.type})`);
		log.info(`   Uploading ${bucket.files.length} files...`);

		let uploaded = 0;
		for (const file of bucket.files) {
			if (await uploadFile(bucket.name, file.key, file.content)) {
				uploaded++;
				totalUploaded++;
			} else {
				totalFailed++;
			}
		}

		log.info(
			`   ✓ Complete: ${uploaded}/${bucket.files.length} files uploaded`,
		);
	}

	// Summary
	log.info(`\n${"=".repeat(50)}`);
	log.info("✓ Upload Complete!");
	log.info("=".repeat(50));
	log.info("\nResults:");
	log.info(`  ✓ Successfully uploaded: ${totalUploaded} files`);
	if (totalFailed > 0) {
		log.info(`  ✗ Failed: ${totalFailed} files`);
	}

	log.info("\nBuckets populated:");
	targetBuckets.forEach((b) => {
		log.info(`  ✓ ${b.name} (${b.files.length} files)`);
	});

	if (!isR2 && directoryBuckets.length > 0) {
		log.info("\n📝 Directory Buckets (Manual Setup Required):");
		log.info(
			"   These require special AWS configuration and must be created manually.",
		);
		log.info("   See SETUP.md for detailed instructions.");
		directoryBuckets.forEach((b) => {
			log.info(`\n  ${b.name}`);
			log.info(`    Region: ${b.region}, AZ: ${b.availabilityZone}`);
		});
	}

	log.info("\n💡 Tips:");
	log.info("  • Run with --dry-run to preview changes");
	log.info("  • Run with --cleanup to delete all uploaded files");
	log.info("  • Run with --r2 for Cloudflare R2 setup");
	log.info("  • See SETUP.md for bucket creation instructions");

	log.info("\n🚀 You can now run the advanced examples:");
	log.info("  bun run examples/advanced/01-s3-basic.ts");
	log.info("  bun run examples/advanced/04-streaming.ts");
	log.info("  bun run examples/advanced/07-mixed-sources.ts");

	if (totalFailed > 0) {
		log.error("\n⚠️  Some uploads failed. Check that:");
		log.error("  1. Buckets exist (create them manually first)");
		log.error("  2. Credentials have write permissions");
		log.error("  3. Bucket region matches S3_REGION");
		process.exit(1);
	}
}

// Run
main().catch((error) => {
	log.error("Setup failed:", error);
	process.exit(1);
});
