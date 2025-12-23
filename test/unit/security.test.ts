import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import {
	SecurityError,
	validateFunction,
	validatePath,
	validateS3Path,
	validateUrl,
} from "../../src/security";

describe("Security Functions", () => {
	const defaultConfig = createConfig({
		allowedBasePaths: [process.cwd()],
		allowedDomains: ["example.com", "api.example.com"],
		allowHttp: true,
		allowFunctions: false,
		allowedFunctionPaths: [],
	});

	describe("validatePath", () => {
		it("should allow valid absolute paths within allowed base paths", () => {
			const validPath = `${process.cwd()}/test.txt`;
			expect(() => validatePath(defaultConfig, validPath)).not.toThrow();
		});

		it("should allow relative paths within allowed base paths", () => {
			const validPath = "test/fixtures/test.txt";
			const resolvedPath = validatePath(defaultConfig, validPath);
			expect(resolvedPath).toContain(process.cwd());
		});

		it("should block path traversal attempts", () => {
			const maliciousPath = "../../../etc/passwd";
			expect(() => validatePath(defaultConfig, maliciousPath)).toThrow(
				SecurityError,
			);
		});

		it("should block paths outside allowed base paths", () => {
			const outsidePath = "/etc/passwd";
			expect(() => validatePath(defaultConfig, outsidePath)).toThrow(
				SecurityError,
			);
		});

		it("should block dangerous path patterns", () => {
			const dangerousPath = "./test/../../secret.txt";
			expect(() => validatePath(defaultConfig, dangerousPath)).toThrow(
				SecurityError,
			);
		});
	});

	describe("validateUrl", () => {
		it("should allow HTTPS URLs from allowed domains", () => {
			const validUrl = "https://api.example.com/data";
			expect(() => validateUrl(defaultConfig, validUrl)).not.toThrow();
		});

		it("should allow HTTP URLs from allowed domains", () => {
			const validUrl = "http://example.com/data";
			expect(() => validateUrl(defaultConfig, validUrl)).not.toThrow();
		});

		it("should block URLs from non-allowed domains", () => {
			const invalidUrl = "https://malicious.com/data";
			expect(() => validateUrl(defaultConfig, invalidUrl)).toThrow(
				SecurityError,
			);
		});

		it("should block private network access", () => {
			const privateUrls = [
				"http://localhost:3000",
				"https://127.0.0.1/data",
				"http://192.168.1.1/api",
				"https://10.0.0.1/data",
			];

			for (const url of privateUrls) {
				expect(() => validateUrl(defaultConfig, url)).toThrow(SecurityError);
			}
		});

		it("should block non-HTTP/HTTPS protocols", () => {
			const invalidUrls = [
				"file:///etc/passwd",
				"ftp://example.com/data",
				"javascript:alert('xss')",
			];

			for (const url of invalidUrls) {
				expect(() => validateUrl(defaultConfig, url)).toThrow(SecurityError);
			}
		});

		it("should throw when HTTP requests are disabled", () => {
			const restrictedConfig = createConfig({
				...defaultConfig,
				allowHttp: false,
			});
			expect(() =>
				validateUrl(restrictedConfig, "https://example.com/data"),
			).toThrow(SecurityError);
		});
	});

	describe("validateFunction", () => {
		it("should allow function paths when enabled", () => {
			const config = createConfig({
				...defaultConfig,
				allowFunctions: true,
				allowedFunctionPaths: ["./test/fixtures"],
			});

			const validFunctionPath = "./test/fixtures/test-function.js";
			expect(() => validateFunction(config, validFunctionPath)).not.toThrow();
		});

		it("should block function execution when disabled", () => {
			const functionPath = "./test/fixtures/test-function.js";
			expect(() => validateFunction(defaultConfig, functionPath)).toThrow(
				SecurityError,
			);
		});

		it("should block functions outside allowed paths", () => {
			const config = createConfig({
				...defaultConfig,
				allowFunctions: true,
				allowedFunctionPaths: ["./allowed"],
			});

			const disallowedFunctionPath = "./test/fixtures/test-function.js";
			expect(() => validateFunction(config, disallowedFunctionPath)).toThrow(
				SecurityError,
			);
		});

		it("should block dangerous file extensions", () => {
			const config = createConfig({
				...defaultConfig,
				allowFunctions: true,
				allowedFunctionPaths: ["./test/fixtures"],
			});

			const dangerousExtensions = [
				"./test/fixtures/malicious.exe",
				"./test/fixtures/script.bat",
				"./test/fixtures/command.sh",
				"./test/fixtures/powershell.ps1",
			];

			for (const path of dangerousExtensions) {
				expect(() => validateFunction(config, path)).toThrow(SecurityError);
			}
		});
	});

	describe("validateS3Path", () => {
		it("should allow valid S3 paths", () => {
			const validPaths = [
				"s3://my-bucket/file.txt",
				"s3://my-bucket/prefix/file.txt",
				"s3://my-bucket/",
				"s3://test-bucket-123/data.json",
			];

			for (const path of validPaths) {
				expect(() => validateS3Path(defaultConfig, path)).not.toThrow();
			}
		});

		it("should block invalid S3 path formats", () => {
			const invalidPaths = [
				"ftp://my-bucket/file.txt",
				"s3://",
				"s3:///file.txt",
				"not-s3://bucket/file.txt",
			];

			for (const path of invalidPaths) {
				expect(() => validateS3Path(defaultConfig, path)).toThrow(
					SecurityError,
				);
			}
		});

		it("should block S3 paths with traversal", () => {
			const maliciousPaths = [
				"s3://bucket/../etc/passwd",
				"s3://bucket/../../secret.txt",
				"s3://bucket/path/../../../malicious",
			];

			for (const path of maliciousPaths) {
				expect(() => validateS3Path(defaultConfig, path)).toThrow(
					SecurityError,
				);
			}
		});

		it("should block invalid bucket names", () => {
			const shortBucketPath = "s3://ab/file.txt"; // too short
			const longBucketPath = `s3://${"a".repeat(64)}/file.txt`; // too long

			expect(() => validateS3Path(defaultConfig, shortBucketPath)).toThrow(
				SecurityError,
			);
			expect(() => validateS3Path(defaultConfig, longBucketPath)).toThrow(
				SecurityError,
			);
		});
	});
});
