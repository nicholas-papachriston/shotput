import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CONFIG } from "../../src/config";
import { getStorageServiceUrl, handleS3 } from "../../src/s3";
import { SecurityValidator } from "../../src/security";

describe("s3", () => {
	let validator: SecurityValidator;
	
	// Save original CONFIG values
	const originalCloudflareR2Url = CONFIG.cloudflareR2Url;
	const originalAwsS3Url = CONFIG.awsS3Url;
	const originalS3Region = CONFIG.s3Region;

	beforeEach(() => {
		// Reset CONFIG to known state for tests
		CONFIG.cloudflareR2Url = undefined;
		CONFIG.awsS3Url = "s3.amazonaws.com";
		CONFIG.s3Region = undefined;
		
		validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd()],
			allowHttp: true,
			allowFunctions: false,
		});
	});
	
	afterEach(() => {
		// Restore original CONFIG values
		CONFIG.cloudflareR2Url = originalCloudflareR2Url;
		CONFIG.awsS3Url = originalAwsS3Url;
		CONFIG.s3Region = originalS3Region;
	});

	describe("getStorageServiceUrl", () => {
		describe("standard S3 buckets", () => {
			it("should generate URL for bucket without key", () => {
				const url = getStorageServiceUrl("my-bucket");
				expect(url).toBe("https://my-bucket.s3.amazonaws.com");
			});

			it("should generate URL for bucket with key", () => {
				const url = getStorageServiceUrl("my-bucket", "path/to/file.txt");
				expect(url).toBe("https://my-bucket.s3.amazonaws.com/path/to/file.txt");
			});

			it("should handle bucket with hyphens", () => {
				const url = getStorageServiceUrl("my-test-bucket-123");
				expect(url).toBe("https://my-test-bucket-123.s3.amazonaws.com");
			});

			it("should handle keys with special characters", () => {
				const url = getStorageServiceUrl("my-bucket", "folder/file name.txt");
				expect(url).toBe(
					"https://my-bucket.s3.amazonaws.com/folder/file name.txt",
				);
			});

			it("should handle deeply nested keys", () => {
				const url = getStorageServiceUrl("my-bucket", "a/b/c/d/e/file.txt");
				expect(url).toBe(
					"https://my-bucket.s3.amazonaws.com/a/b/c/d/e/file.txt",
				);
			});
		});

		describe("directory buckets (S3 Express)", () => {
			it("should generate S3 Express URL for directory bucket", () => {
				const url = getStorageServiceUrl(
					"my-bucket--use1-az1--x-s3",
					undefined,
					true,
					"use1-az1",
				);
				expect(url).toContain("s3express-use1-az1");
				expect(url).toContain("us-east-1"); // default region
			});

			it("should generate S3 Express URL with key", () => {
				const url = getStorageServiceUrl(
					"my-bucket--use1-az1--x-s3",
					"file.txt",
					true,
					"use1-az1",
				);
				expect(url).toContain("s3express-use1-az1");
				expect(url).toContain("/file.txt");
			});

			it("should use configured region for S3 Express", () => {
				const originalRegion = CONFIG.s3Region;
				CONFIG.s3Region = "eu-west-1";

				const url = getStorageServiceUrl(
					"my-bucket--euw1-az1--x-s3",
					undefined,
					true,
					"euw1-az1",
				);
				expect(url).toContain("eu-west-1");

				CONFIG.s3Region = originalRegion;
			});
		});

		describe("Cloudflare R2", () => {
			it("should use R2 URL when configured", () => {
				const originalR2Url = CONFIG.cloudflareR2Url;
				CONFIG.cloudflareR2Url = "accountid.r2.cloudflarestorage.com";

				const url = getStorageServiceUrl("my-bucket", "file.txt");
				expect(url).toBe(
					"https://accountid.r2.cloudflarestorage.com/my-bucket/file.txt",
				);

				CONFIG.cloudflareR2Url = originalR2Url;
			});

			it("should use R2 URL without key", () => {
				const originalR2Url = CONFIG.cloudflareR2Url;
				CONFIG.cloudflareR2Url = "accountid.r2.cloudflarestorage.com";

				const url = getStorageServiceUrl("my-bucket");
				expect(url).toBe(
					"https://accountid.r2.cloudflarestorage.com/my-bucket",
				);

				CONFIG.cloudflareR2Url = originalR2Url;
			});
		});
	});

	describe("handleS3", () => {
		describe("security validation", () => {
			it("should validate bucket name length", async () => {
				// Bucket name too short (less than 3 chars)
				const result = await handleS3(
					"{{s3}}",
					"s3://ab/file.txt",
					"{{s3}}",
					10000,
				);

				expect(result.operationResults).toContain("[Security Error:");
				expect(result.operationResults).toContain("Invalid S3 bucket name");
				expect(result.combinedRemainingCount).toBe(10000);
			});

			it("should validate bucket name format", async () => {
				// Invalid characters in bucket name
				const result = await handleS3(
					"{{s3}}",
					"s3://Invalid_Bucket_Name/file.txt",
					"{{s3}}",
					10000,
				);

				expect(result.operationResults).toContain("[Security Error:");
				expect(result.operationResults).toContain(
					"Invalid S3 bucket name format",
				);
				expect(result.combinedRemainingCount).toBe(10000);
			});

			it("should detect path traversal in S3 keys", async () => {
				const result = await handleS3(
					"{{s3}}",
					"s3://test-bucket/../other-bucket/file.txt",
					"{{s3}}",
					10000,
				);

				expect(result.operationResults).toContain("[Security Error:");
				expect(result.operationResults).toContain("Path traversal");
				expect(result.combinedRemainingCount).toBe(10000);
			});
		});

		describe("error handling", () => {
			it("should handle invalid S3 paths", async () => {
				const result = await handleS3("{{s3}}", "s3://", "{{s3}}", 10000);

				expect(result.operationResults).toContain("[Security Error:");
				expect(result.operationResults).toContain("Malformed S3 path");
				expect(result.combinedRemainingCount).toBe(10000);
			});

			it("should handle S3 path without trailing slash as file", async () => {
				// This will fail because we don't have real S3 credentials
				// but we can test that it attempts the right operation
				const result = await handleS3(
					"{{s3}}",
					"s3://test-bucket/file.txt",
					"{{s3}}",
					10000,
				);

				// Should attempt to process as file (will error without real S3)
				expect(result.operationResults).toContain("[Error reading S3 path:");
			});

			it("should handle S3 path with trailing slash as prefix", async () => {
				// This will fail because we don't have real S3 credentials
				// but we can test that it attempts the right operation
				const result = await handleS3(
					"{{s3}}",
					"s3://test-bucket/folder/",
					"{{s3}}",
					10000,
				);

				// Should attempt to list prefix (will error without real S3)
				expect(result.operationResults).toContain("[Error reading S3 path:");
			});

			it("should preserve template when error occurs", async () => {
				const result = await handleS3(
					"Before {{s3}} After",
					"s3://",
					"{{s3}}",
					10000,
				);

				expect(result.operationResults).toContain("Before");
				expect(result.operationResults).toContain("After");
				expect(result.operationResults).not.toContain("{{s3}}");
			});
		});
	});
});
