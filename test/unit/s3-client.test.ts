import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	extractAvailabilityZoneId,
	getS3Endpoint,
	isDirectoryBucketName,
	parseS3Path,
} from "../../src/s3-client";
import { CONFIG } from "../../src/config";
import type { S3Credentials } from "../../src/types";

describe("s3-client", () => {
	// Save original CONFIG values
	const originalCloudflareR2Url = CONFIG.cloudflareR2Url;
	const originalAwsS3Url = CONFIG.awsS3Url;
	const originalS3Region = CONFIG.s3Region;

	beforeEach(() => {
		// Reset CONFIG to known state for tests
		CONFIG.cloudflareR2Url = undefined;
		CONFIG.awsS3Url = "s3.amazonaws.com";
		CONFIG.s3Region = undefined;
	});

	afterEach(() => {
		// Restore original CONFIG values
		CONFIG.cloudflareR2Url = originalCloudflareR2Url;
		CONFIG.awsS3Url = originalAwsS3Url;
		CONFIG.s3Region = originalS3Region;
	});
	describe("parseS3Path", () => {
		test("parses standard bucket with key", () => {
			const result = parseS3Path("s3://my-bucket/path/to/file.json");

			expect(result).toEqual({
				bucket: "my-bucket",
				key: "path/to/file.json",
				isDirectoryBucket: false,
				availabilityZoneId: undefined,
			});
		});

		test("parses standard bucket without key", () => {
			const result = parseS3Path("s3://my-bucket/");

			expect(result).toEqual({
				bucket: "my-bucket",
				key: undefined,
				isDirectoryBucket: false,
				availabilityZoneId: undefined,
			});
		});

		test("parses standard bucket with trailing slash only", () => {
			const result = parseS3Path("s3://my-bucket");

			expect(result).toEqual({
				bucket: "my-bucket",
				key: undefined,
				isDirectoryBucket: false,
				availabilityZoneId: undefined,
			});
		});

		test("parses directory bucket with key", () => {
			const result = parseS3Path("s3://my-data--use1-az4--x-s3/logs/app.log");

			expect(result).toEqual({
				bucket: "my-data--use1-az4--x-s3",
				key: "logs/app.log",
				isDirectoryBucket: true,
				availabilityZoneId: "use1-az4",
			});
		});

		test("parses directory bucket without key", () => {
			const result = parseS3Path("s3://my-data--use1-az4--x-s3/");

			expect(result).toEqual({
				bucket: "my-data--use1-az4--x-s3",
				key: undefined,
				isDirectoryBucket: true,
				availabilityZoneId: "use1-az4",
			});
		});

		test("parses directory bucket with prefix", () => {
			const result = parseS3Path("s3://logs--usw2-az1--x-s3/2024/01/");

			expect(result).toEqual({
				bucket: "logs--usw2-az1--x-s3",
				key: "2024/01/",
				isDirectoryBucket: true,
				availabilityZoneId: "usw2-az1",
			});
		});

		test("throws error for invalid S3 path format", () => {
			expect(() => parseS3Path("invalid://bucket/key")).toThrow(
				"Invalid S3 path format",
			);
		});

		test("throws error for missing s3:// protocol", () => {
			expect(() => parseS3Path("bucket/key")).toThrow("Invalid S3 path format");
		});
	});

	describe("isDirectoryBucketName", () => {
		test("identifies valid directory bucket names", () => {
			expect(isDirectoryBucketName("my-data--use1-az4--x-s3")).toBe(true);
			expect(isDirectoryBucketName("logs--usw2-az1--x-s3")).toBe(true);
			expect(isDirectoryBucketName("app-cache--euc1-az2--x-s3")).toBe(true);
			expect(isDirectoryBucketName("bucket123--apne1-az3--x-s3")).toBe(true);
		});

		test("rejects standard bucket names", () => {
			expect(isDirectoryBucketName("my-bucket")).toBe(false);
			expect(isDirectoryBucketName("my-bucket-name")).toBe(false);
			expect(isDirectoryBucketName("bucket.with.dots")).toBe(false);
		});

		test("rejects invalid directory bucket formats", () => {
			// Missing --x-s3 suffix
			expect(isDirectoryBucketName("my-data--use1-az4")).toBe(false);

			// Missing availability zone
			expect(isDirectoryBucketName("my-data--x-s3")).toBe(false);

			// Wrong suffix
			expect(isDirectoryBucketName("my-data--use1-az4--s3")).toBe(false);

			// Uppercase letters
			expect(isDirectoryBucketName("My-Data--use1-az4--x-s3")).toBe(false);

			// Starting with hyphen
			expect(isDirectoryBucketName("-my-data--use1-az4--x-s3")).toBe(false);
		});
	});

	describe("extractAvailabilityZoneId", () => {
		test("extracts availability zone ID from directory bucket", () => {
			expect(extractAvailabilityZoneId("my-data--use1-az4--x-s3")).toBe(
				"use1-az4",
			);
			expect(extractAvailabilityZoneId("logs--usw2-az1--x-s3")).toBe(
				"usw2-az1",
			);
			expect(extractAvailabilityZoneId("cache--euc1-az2--x-s3")).toBe(
				"euc1-az2",
			);
		});

		test("returns undefined for standard buckets", () => {
			expect(extractAvailabilityZoneId("my-bucket")).toBeUndefined();
			expect(extractAvailabilityZoneId("my-bucket-name")).toBeUndefined();
		});

		test("returns undefined for invalid formats", () => {
			expect(extractAvailabilityZoneId("my-data--x-s3")).toBeUndefined();
			expect(
				extractAvailabilityZoneId("my-data--use1-az4--wrong"),
			).toBeUndefined();
		});
	});

	describe("getS3Endpoint", () => {
		test("uses explicit endpoint when provided", () => {
			const bucketInfo = {
				bucket: "my-bucket",
				isDirectoryBucket: false,
			};

			const credentials: S3Credentials = {
				endpoint: "https://custom.s3.example.com",
			};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe("https://custom.s3.example.com");
		});

		test("generates S3 Express endpoint for directory buckets", () => {
			const bucketInfo = {
				bucket: "my-data--use1-az4--x-s3",
				isDirectoryBucket: true,
				availabilityZoneId: "use1-az4",
			};

			const credentials: S3Credentials = {
				region: "us-east-1",
			};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe(
				"https://my-data--use1-az4--x-s3.s3express-use1-az4.us-east-1.amazonaws.com",
			);
		});

		test("uses default region for directory buckets without explicit region", () => {
			const bucketInfo = {
				bucket: "logs--usw2-az1--x-s3",
				isDirectoryBucket: true,
				availabilityZoneId: "usw2-az1",
			};

			const credentials: S3Credentials = {};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toContain("us-east-1"); // Default region
		});

		test("generates virtual-hosted-style endpoint when enabled", () => {
			const bucketInfo = {
				bucket: "my-bucket",
				isDirectoryBucket: false,
			};

			const credentials: S3Credentials = {
				region: "us-west-2",
				virtualHostedStyle: true,
			};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe("https://my-bucket.s3.us-west-2.amazonaws.com");
		});

		test("generates path-style endpoint for standard buckets", () => {
			const bucketInfo = {
				bucket: "my-bucket",
				isDirectoryBucket: false,
			};

			const credentials: S3Credentials = {
				region: "eu-central-1",
				virtualHostedStyle: false,
			};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe("https://s3.eu-central-1.amazonaws.com");
		});

		test("falls back to default AWS S3 URL when no endpoint info available", () => {
			const bucketInfo = {
				bucket: "my-bucket",
				isDirectoryBucket: false,
			};

			const credentials: S3Credentials = {};

			// This falls back to CONFIG.awsS3Url in the actual implementation
			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe("https://s3.amazonaws.com");
		});

		test("handles directory bucket with different regions", () => {
			const bucketInfo = {
				bucket: "data--apne1-az3--x-s3",
				isDirectoryBucket: true,
				availabilityZoneId: "apne1-az3",
			};

			const credentials: S3Credentials = {
				region: "ap-northeast-1",
			};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe(
				"https://data--apne1-az3--x-s3.s3express-apne1-az3.ap-northeast-1.amazonaws.com",
			);
		});
	});

	describe("integration scenarios", () => {
		test("parses and generates endpoint for standard S3 bucket", () => {
			const path = "s3://my-bucket/data/file.json";
			const bucketInfo = parseS3Path(path);

			expect(bucketInfo.isDirectoryBucket).toBe(false);

			const credentials: S3Credentials = {
				region: "us-east-1",
			};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe("https://s3.us-east-1.amazonaws.com");
		});

		test("parses and generates endpoint for directory bucket", () => {
			const path = "s3://logs--use1-az4--x-s3/app/error.log";
			const bucketInfo = parseS3Path(path);

			expect(bucketInfo.isDirectoryBucket).toBe(true);
			expect(bucketInfo.availabilityZoneId).toBe("use1-az4");

			const credentials: S3Credentials = {
				region: "us-east-1",
			};

			const endpoint = getS3Endpoint(bucketInfo, credentials);
			expect(endpoint).toBe(
				"https://logs--use1-az4--x-s3.s3express-use1-az4.us-east-1.amazonaws.com",
			);
		});

		test("handles complex directory bucket names", () => {
			const path = "s3://my-app-data-prod--euc1-az2--x-s3/backups/";
			const bucketInfo = parseS3Path(path);

			expect(bucketInfo).toEqual({
				bucket: "my-app-data-prod--euc1-az2--x-s3",
				key: "backups/",
				isDirectoryBucket: true,
				availabilityZoneId: "euc1-az2",
			});
		});
	});
});
