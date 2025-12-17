import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { CONFIG } from "../../src/config";
import { handleHttp } from "../../src/http";
import { SecurityValidator } from "../../src/security";

describe("handleHttp", () => {
	let originalFetch: typeof global.fetch;
	let originalConfig: typeof CONFIG;

	beforeEach(() => {
		originalFetch = global.fetch;
		originalConfig = { ...CONFIG };

		// Configure security
		const validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd()],
			allowHttp: true,
			allowedDomains: [],
			allowFunctions: false,
		});
	});

	afterEach(() => {
		global.fetch = originalFetch;
		Object.assign(CONFIG, originalConfig);
	});

	it("should successfully fetch and process HTTP content", async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => "Test content from API",
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Template: {{url}}",
			"https://api.example.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain(
			"path: https://api.example.com/data",
		);
		expect(result.operationResults).toContain(
			"httpResults: Test content from API",
		);
		expect(result.combinedRemainingCount).toBeLessThan(10000);
	});

	it("should handle JSON responses", async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ key: "value", number: 42 }),
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"https://api.example.com/json",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain('"key":"value"');
		expect(result.operationResults).toContain('"number":42');
	});

	it("should handle HTTP 404 errors", async () => {
		const mockResponse = {
			ok: false,
			status: 404,
			statusText: "Not Found",
			text: async () => "",
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"https://api.example.com/missing",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain(
			"[HTTP Error: https://api.example.com/missing]",
		);
		expect(result.combinedRemainingCount).toBe(10000);
	});

	it("should handle HTTP 500 errors", async () => {
		const mockResponse = {
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
			text: async () => "",
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"https://api.example.com/error",
			"{{url}}",
			5000,
		);

		expect(result.operationResults).toContain("[HTTP Error:");
		expect(result.combinedRemainingCount).toBe(5000);
	});

	it("should handle timeout errors", async () => {
		global.fetch = mock(async () => {
			const error = new Error("The operation timed out");
			error.name = "TimeoutError";
			throw error;
		});

		const result = await handleHttp(
			"Data: {{url}}",
			"https://slow-api.example.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain("[HTTP Timeout:");
		expect(result.combinedRemainingCount).toBe(10000);
	});

	it("should handle network errors", async () => {
		global.fetch = mock(async () => {
			throw new Error("Network error");
		});

		const result = await handleHttp(
			"Data: {{url}}",
			"https://unreachable.example.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain("[HTTP Error:");
		expect(result.combinedRemainingCount).toBe(10000);
	});

	it("should handle security validation errors for disallowed domains", async () => {
		const validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd()],
			allowHttp: true,
			allowedDomains: ["allowed-domain.com"],
			allowFunctions: false,
		});

		const result = await handleHttp(
			"Data: {{url}}",
			"https://forbidden.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain("[Security Error:");
		expect(result.combinedRemainingCount).toBe(10000);
	});

	it("should handle security validation errors when HTTP is disabled", async () => {
		const validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd()],
			allowHttp: false,
			allowedDomains: [],
			allowFunctions: false,
		});

		const result = await handleHttp(
			"Data: {{url}}",
			"https://example.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain("[Security Error:");
		expect(result.combinedRemainingCount).toBe(10000);
	});

	it("should truncate content when it exceeds remaining length", async () => {
		const longContent = "A".repeat(5000);
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => longContent,
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"https://api.example.com/large",
			"{{url}}",
			100, // Small remaining length
		);

		expect(result.operationResults.length).toBeLessThan(
			longContent.length + 100,
		);
		expect(result.combinedRemainingCount).toBeLessThanOrEqual(100);
	});

	it("should use default timeout when CONFIG.httpTimeout is undefined", async () => {
		CONFIG.httpTimeout = undefined as unknown as number;

		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => "Content",
		};

		let capturedSignal: AbortSignal | undefined;
		global.fetch = mock(async (_url, options) => {
			capturedSignal = options?.signal as AbortSignal;
			return mockResponse as Response;
		});

		await handleHttp(
			"Data: {{url}}",
			"https://api.example.com/data",
			"{{url}}",
			10000,
		);

		// Verify fetch was called (signal will be defined)
		expect(capturedSignal).toBeDefined();
	});

	it("should handle HTTPS URLs", async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => "Secure content",
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"https://secure.example.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain("Secure content");
	});

	it("should handle HTTP URLs (not just HTTPS)", async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => "Non-secure content",
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"http://example.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain("Non-secure content");
	});

	it("should preserve template structure when replacing match", async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => "API Response",
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Start {{url}} End",
			"https://api.example.com/data",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain("Start ");
		expect(result.operationResults).toContain(" End");
		expect(result.operationResults).toContain("API Response");
		expect(result.operationResults).not.toContain("{{url}}");
	});

	it("should handle empty response body", async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => "",
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"https://api.example.com/empty",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain(
			"path: https://api.example.com/empty",
		);
		expect(result.operationResults).toContain("httpResults: ");
	});

	it("should handle content with special characters", async () => {
		const specialContent = "Content with <tags> & \"quotes\" and 'apostrophes'";
		const mockResponse = {
			ok: true,
			status: 200,
			text: async () => specialContent,
		};

		global.fetch = mock(async () => mockResponse as Response);

		const result = await handleHttp(
			"Data: {{url}}",
			"https://api.example.com/special",
			"{{url}}",
			10000,
		);

		expect(result.operationResults).toContain(specialContent);
	});
});
