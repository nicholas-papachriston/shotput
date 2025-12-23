import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { handleS3 } from "../../src/s3";

describe("s3", () => {
	describe("handleS3", () => {
		describe("security validation", () => {
			it("should validate bucket name length", async () => {
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					allowHttp: true,
					allowFunctions: false,
				});

				// Bucket name too short (less than 3 chars)
				const result = await handleS3(
					config,
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
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					allowHttp: true,
					allowFunctions: false,
				});

				// Invalid characters in bucket name
				const result = await handleS3(
					config,
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

			it("should validate path traversal in S3 key", async () => {
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					allowHttp: true,
					allowFunctions: false,
				});

				const result = await handleS3(
					config,
					"{{s3}}",
					"s3://my-bucket/../etc/passwd",
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
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					allowHttp: true,
					allowFunctions: false,
				});

				const result = await handleS3(
					config,
					"{{s3}}",
					"s3://",
					"{{s3}}",
					10000,
				);

				expect(result.operationResults).toContain("[Security Error:");
				expect(result.operationResults).toContain("Malformed S3 path");
				expect(result.combinedRemainingCount).toBe(10000);
			});

			it("should handle S3 path without trailing slash as file", async () => {
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					allowHttp: true,
					allowFunctions: false,
				});

				// This will fail because we don't have real S3 credentials
				// but we can test that it attempts the right operation
				const result = await handleS3(
					config,
					"{{s3}}",
					"s3://my-bucket/file.txt",
					"{{s3}}",
					10000,
				);

				// Should attempt to process as file (will error without real S3)
				expect(result.operationResults).toContain("[Error reading");
			});

			it("should handle S3 path with trailing slash as prefix", async () => {
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					allowHttp: true,
					allowFunctions: false,
				});

				// This will fail because we don't have real S3 credentials
				// but we can test that it attempts the right operation
				const result = await handleS3(
					config,
					"{{s3}}",
					"s3://my-bucket/folder/",
					"{{s3}}",
					10000,
				);

				// Should attempt to list prefix (will error without real S3)
				expect(result.operationResults).toContain("[Error reading");
			});

			it("should preserve template when error occurs", async () => {
				const config = createConfig({
					allowedBasePaths: [process.cwd()],
					allowHttp: true,
					allowFunctions: false,
				});

				const result = await handleS3(
					config,
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
