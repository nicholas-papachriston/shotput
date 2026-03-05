import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { shotput } from "../../src";
import { createConfig } from "../../src/config";
import { handleFileStream } from "../../src/fileStream";

describe("Shotput Integration Tests", () => {
	let tempDir: string;
	let originalEnv: Record<string, string | undefined>;

	beforeEach(async () => {
		originalEnv = {};
		// Store original env vars
		const envVars = [
			"DEBUG",
			"TEMPLATE_DIR",
			"TEMPLATE_PATH",
			"RESPONSE_DIR",
			"ALLOWED_BASE_PATHS",
		];
		for (const envVar of envVars) {
			originalEnv[envVar] = process.env[envVar];
		}

		// Create temp directory
		tempDir = `${process.cwd()}/test-temp-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;
		await Bun.write(`${tempDir}/template.md`, `Hello {{${tempDir}/test.txt}}!`);
		await Bun.write(`${tempDir}/test.txt`, "World!");
	});

	afterEach(async () => {
		// Restore env vars
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}

		// Clean up temp dir
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should process a complete template workflow", async () => {
		const result = await shotput()
			.with({
				debug: true,
				debugFile: `${tempDir}/debug.txt`,
				templateDir: `${tempDir}/`,
				templateFile: "template.md",
				responseDir: `${tempDir}/responses`,
				allowFunctions: true,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();
		expect(result.content).toContain("Hello filename:");
		expect(result.content).toContain("World!");
	});

	it("shotputStreaming produces same content as shotput when consumed to string", async () => {
		const normal = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();
		const streaming = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.stream();
		expect(streaming.error).toBeUndefined();
		let streamedContent = "";
		const reader = streaming.stream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			streamedContent += value;
		}
		expect(streamedContent).toBe(normal.content ?? "");
		const streamingMeta = await streaming.metadata;
		expect(streamingMeta.resultMetadata?.length).toBe(
			normal.metadata.resultMetadata?.length ?? 0,
		);
	});

	it("should work with explicit configuration", async () => {
		// Create a fresh template for this test
		await Bun.write(`${tempDir}/explicit.md`, `Test: {{${tempDir}/test.txt}}`);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "explicit.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content).toContain("Test: filename:");
		expect(result.content).toContain("World!");
	});

	it("should respect security restrictions for path traversal", async () => {
		// Use an absolute path that exists but is outside allowed paths
		const maliciousTemplate = "Hello {{/etc/hosts}}!";
		await Bun.write(`${tempDir}/malicious.md`, maliciousTemplate);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "malicious.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [tempDir],
			})
			.run();

		// Should contain security error or error reading message
		expect(
			result.content?.includes("Security Error") ||
				result.content?.includes("Error reading"),
		).toBe(true);
		expect(result.content).not.toContain("127.0.0.1");
	});

	it("should block absolute paths outside allowed base paths", async () => {
		const maliciousTemplate = "Hello {{/etc/passwd}}!";
		await Bun.write(`${tempDir}/absolute-path.md`, maliciousTemplate);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "absolute-path.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [tempDir],
			})
			.run();

		expect(
			result.content?.includes("Security Error") ||
				result.content?.includes("Error reading"),
		).toBe(true);
	});

	it("should handle length limits properly", async () => {
		// Create a large file
		const largeContent = "x".repeat(2000);
		await Bun.write(`${tempDir}/large.txt`, largeContent);

		const template = `{{${tempDir}/large.txt}}`;
		await Bun.write(`${tempDir}/length-test.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "length-test.md",
				responseDir: `${tempDir}/responses`,
				maxPromptLength: 100,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content?.length).toBeLessThan(150);
	});

	it("should handle glob patterns with absolute path in template", async () => {
		// Create multiple files
		await Bun.write(`${tempDir}/globfile1.txt`, "GlobContent 1");
		await Bun.write(`${tempDir}/globfile2.txt`, "GlobContent 2");

		// Use absolute glob pattern
		const template = `{{${tempDir}/globfile*.txt}}`;
		await Bun.write(`${tempDir}/glob-test.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "glob-test.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// Should contain content from glob-matched files or handle the glob
		expect(result.content?.length).toBeGreaterThan(0);
	});

	it("should handle multiple file references in template", async () => {
		await Bun.write(`${tempDir}/file1.txt`, "First");
		await Bun.write(`${tempDir}/file2.txt`, "Second");

		const template = `Start {{${tempDir}/file1.txt}} Middle {{${tempDir}/file2.txt}} End`;
		await Bun.write(`${tempDir}/multi.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "multi.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content).toContain("Start filename:");
		expect(result.content).toContain("First");
		expect(result.content).toContain("Middle filename:");
		expect(result.content).toContain("Second");
		expect(result.content).toContain("End");
	});

	it("should handle non-existent file gracefully", async () => {
		// When a file doesn't exist, the template type detection returns String type
		// and the marker is left as-is or processed as a string
		const template = `Hello {{${tempDir}/nonexistent.txt}}!`;
		await Bun.write(`${tempDir}/missing.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "missing.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// The template returns String type for non-existent paths, leaving marker or empty
		expect(result.content).toContain("Hello");
		// Should not crash
		expect(typeof result).toBe("object");
	});

	it("should handle empty template file", async () => {
		await Bun.write(`${tempDir}/empty.md`, "");

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "empty.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content).toBe("");
	});

	it("should handle template with no interpolation markers", async () => {
		await Bun.write(`${tempDir}/plain.md`, "Just plain text");

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "plain.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content).toBe("Just plain text");
	});

	it("should write debug output when debug is enabled", async () => {
		const debugFile = `${tempDir}/debug-output.txt`;

		await shotput()
			.with({
				debug: true,
				debugFile: debugFile,
				templateDir: `${tempDir}/`,
				templateFile: "template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		const debugExists = await Bun.file(debugFile).exists();
		expect(debugExists).toBe(true);

		const debugContent = await Bun.file(debugFile).text();
		expect(debugContent).toContain("World!");
	});
});

describe("FileStream Integration Tests", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-stream-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;
	});

	afterEach(async () => {
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should handle file stream for small files", async () => {
		const testContent = "Hello from file stream!";
		await Bun.write(`${tempDir}/stream-test.txt`, testContent);

		const result = "Test {{file}}!";
		const path = `${tempDir}/stream-test.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Test filename:");
		expect(response.operationResults).toContain("Hello from file stream");
		expect(response.combinedRemainingCount).toBeGreaterThan(0);
	});

	it("should handle file stream with length truncation", async () => {
		const largeContent = "x".repeat(500);
		await Bun.write(`${tempDir}/large-stream.txt`, largeContent);

		const result = "Content: {{file}}";
		const path = `${tempDir}/large-stream.txt`;
		const match = "{{file}}";
		const remainingLength = 50;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		// Content should be truncated
		expect(response.combinedRemainingCount).toBe(0);
	});

	it("should handle file stream with zero remaining length", async () => {
		await Bun.write(`${tempDir}/zero-length.txt`, "Some content");

		const result = "Test {{file}}!";
		const path = `${tempDir}/zero-length.txt`;
		const match = "{{file}}";
		const remainingLength = 0;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.combinedRemainingCount).toBe(0);
	});

	it("should return security error for path traversal in file stream", async () => {
		const result = "Test {{file}}!";
		const path = "../../../etc/passwd";
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Security Error:");
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should return error for non-existent file in file stream", async () => {
		const result = "Test {{file}}!";
		const path = `${tempDir}/does-not-exist.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("[Error reading");
		expect(response.combinedRemainingCount).toBe(remainingLength);
	});

	it("should stream large files efficiently", async () => {
		// Create a moderately large file
		const content = "Line of content\n".repeat(1000);
		await Bun.write(`${tempDir}/large-file.txt`, content);

		const result = "{{file}}";
		const path = `${tempDir}/large-file.txt`;
		const match = "{{file}}";
		const remainingLength = 500;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		// Should be truncated to respect remaining length
		expect(response.combinedRemainingCount).toBe(0);
		expect(response.operationResults.length).toBeLessThanOrEqual(500 + 100); // Some buffer for filename prefix
	});

	it("should handle text content in file stream", async () => {
		const textContent = "Hello World";
		await Bun.write(`${tempDir}/text.txt`, textContent);

		const result = "Content: {{file}}";
		const path = `${tempDir}/text.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Content: filename:");
		expect(response.operationResults).toContain("Hello World");
	});

	it("should handle empty file in file stream", async () => {
		await Bun.write(`${tempDir}/empty.txt`, "");

		const result = "Before {{file}} After";
		const path = `${tempDir}/empty.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Before filename:");
		expect(response.operationResults).toContain("After");
	});

	it("should handle file with special characters in content", async () => {
		const specialContent = "Hello world & more special chars";
		await Bun.write(`${tempDir}/special.txt`, specialContent);

		const result = "Test {{file}}";
		const path = `${tempDir}/special.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Hello world");
		expect(response.operationResults).toContain("& more");
	});

	it("should handle unicode content in file stream", async () => {
		const unicodeContent = "Hello unicode test";
		await Bun.write(`${tempDir}/unicode.txt`, unicodeContent);

		const result = "Content: {{file}}";
		const path = `${tempDir}/unicode.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("Content: filename:");
		expect(response.operationResults).toContain("Hello unicode test");
	});

	it("should preserve file path in output", async () => {
		await Bun.write(`${tempDir}/path-test.txt`, "content");

		const result = "{{file}}";
		const path = `${tempDir}/path-test.txt`;
		const match = "{{file}}";
		const remainingLength = 1000;

		const config = createConfig({
			allowedBasePaths: [process.cwd(), tempDir],
		});

		const response = await handleFileStream(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain(
			`filename:${tempDir}/path-test.txt`,
		);
	});
});

describe("Shotput Edge Cases", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-edge-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;
	});

	afterEach(async () => {
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should handle nested interpolation markers in content", async () => {
		await Bun.write(`${tempDir}/nested.txt`, "Content with {{markers}}");

		const template = `Outer: {{${tempDir}/nested.txt}}`;
		await Bun.write(`${tempDir}/nested-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "nested-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// Should contain the literal {{markers}} from the file content
		expect(result.content).toContain("{{markers}}");
	});

	it("should handle whitespace in template markers", async () => {
		await Bun.write(`${tempDir}/whitespace.txt`, "Content");

		// Template with whitespace around path
		const template = `Test: {{  ${tempDir}/whitespace.txt  }}`;
		await Bun.write(`${tempDir}/whitespace-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "whitespace-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// Should trim whitespace and process the file
		expect(result.content).toContain("Content");
	});

	it("should handle consecutive template markers", async () => {
		await Bun.write(`${tempDir}/a.txt`, "A");
		await Bun.write(`${tempDir}/b.txt`, "B");

		const template = `{{${tempDir}/a.txt}}{{${tempDir}/b.txt}}`;
		await Bun.write(`${tempDir}/consecutive.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "consecutive.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content).toContain("A");
		expect(result.content).toContain("B");
	});

	it("should handle very small max prompt length", async () => {
		await Bun.write(`${tempDir}/content.txt`, "Some content here");

		const template = `{{${tempDir}/content.txt}}`;
		await Bun.write(`${tempDir}/small-limit.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "small-limit.md",
				responseDir: `${tempDir}/responses`,
				maxPromptLength: 10,
				maxConcurrency: 1,
				enableContentLengthPlanning: false, // Process then truncate (planning would skip and leave template)
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// Result should be truncated when we process and apply length limit
		expect(result.content?.length).toBeLessThanOrEqual(10);
	});

	it("should handle template with only whitespace", async () => {
		await Bun.write(`${tempDir}/whitespace-only.md`, "   \n\t\n   ");

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "whitespace-only.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// Result is trimmed, whitespace-only content becomes empty or minimal
		expect(result.content?.trim()).toBe("");
	});

	it("should handle malformed template markers gracefully", async () => {
		const template = "Start {{ incomplete } and {no close and {{valid}}";
		await Bun.write(`${tempDir}/malformed.md`, template);
		await Bun.write(`${tempDir}/valid`, "valid content");

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "malformed.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// Should handle gracefully without crashing
		expect(result.content).toContain("Start");
		expect(result.content).toContain("incomplete");
	});

	it("should handle file with newlines properly", async () => {
		const multilineContent = "Line 1\nLine 2\nLine 3";
		await Bun.write(`${tempDir}/multiline.txt`, multilineContent);

		const template = `Content:\n{{${tempDir}/multiline.txt}}`;
		await Bun.write(`${tempDir}/multiline-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "multiline-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 1000,
			})
			.run();

		expect(result.content).toContain("Line 1");
		expect(result.content).toContain("Line 2");
		expect(result.content).toContain("Line 3");
	});
});

describe("Skill Integration Tests", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-skill-integration-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;
		await Bun.$`mkdir -p ${tempDir}/skills/integration-test-skill`;

		// Create a test skill
		const skillContent = `---
name: integration-test-skill
description: A skill for integration testing
---

# Integration Test Skill

This skill is used for integration testing.

## Guidelines
- Test thoroughly
- Follow best practices
`;
		await Bun.write(
			`${tempDir}/skills/integration-test-skill/SKILL.md`,
			skillContent,
		);
	});

	afterEach(async () => {
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should load a skill in template using skill: syntax", async () => {
		const template =
			"# My Template\n\n{{skill:integration-test-skill}}\n\n## End";
		await Bun.write(`${tempDir}/skill-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "skill-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
				skillsDir: `${tempDir}/skills`,
			})
			.run();

		expect(result.content).toContain("# My Template");
		expect(result.content).toContain("## Skill: integration-test-skill");
		expect(result.content).toContain("A skill for integration testing");
		expect(result.content).toContain("## End");
	});

	it("should combine skills with file templates", async () => {
		await Bun.write(`${tempDir}/data.txt`, "Important data content");

		const template = `{{skill:integration-test-skill}}

## Data File
{{${tempDir}/data.txt}}
`;
		await Bun.write(`${tempDir}/combined-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "combined-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
				skillsDir: `${tempDir}/skills`,
			})
			.run();

		expect(result.content).toContain("## Skill: integration-test-skill");
		expect(result.content).toContain("## Data File");
		expect(result.content).toContain("Important data content");
	});

	it("should handle skill not found gracefully in template", async () => {
		const template = "Start {{skill:nonexistent-skill}} End";
		await Bun.write(`${tempDir}/missing-skill-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "missing-skill-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
				skillsDir: `${tempDir}/skills`,
			})
			.run();

		expect(result.content).toContain("Start");
		expect(result.content).toContain("[Error loading skill:");
		expect(result.content).toContain("End");
	});

	it("should load fixture example skill", async () => {
		const template = "{{skill:example-skill}}";
		await Bun.write(`${tempDir}/fixture-skill-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "fixture-skill-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
				skillsDir: "./test/fixtures/skills",
			})
			.run();

		expect(result.content).toContain("## Skill: example-skill");
		expect(result.content).toContain("An example skill for testing");
		expect(result.content).toContain("## Guidelines");
	});

	it("should handle multiple skills in same template", async () => {
		// Create a second skill
		await Bun.$`mkdir -p ${tempDir}/skills/second-skill`;
		const secondSkill = `---
name: second-skill
description: Another test skill
---

# Second Skill

Different content here.
`;
		await Bun.write(`${tempDir}/skills/second-skill/SKILL.md`, secondSkill);

		const template = `## First
{{skill:integration-test-skill}}

## Second
{{skill:second-skill}}
`;
		await Bun.write(`${tempDir}/multi-skill-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "multi-skill-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
				skillsDir: `${tempDir}/skills`,
				maxPromptLength: 10000,
			})
			.run();

		expect(result.content).toContain("## Skill: integration-test-skill");
		expect(result.content).toContain("## Skill: second-skill");
		expect(result.content).toContain("Different content here");
	});

	it("should respect length limits with skill content", async () => {
		const template = "{{skill:integration-test-skill}}";
		await Bun.write(`${tempDir}/limited-skill-template.md`, template);

		const result = await shotput()
			.with({
				templateDir: `${tempDir}/`,
				templateFile: "limited-skill-template.md",
				responseDir: `${tempDir}/responses`,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 100,
				skillsDir: `${tempDir}/skills`,
			})
			.run();

		// Result should be truncated to at most maxPromptLength
		expect(result.content?.length).toBeLessThanOrEqual(100);
	});
});

describe("Inline Template Tests", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-inline-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;
		await Bun.write(`${tempDir}/data.txt`, "Test Data Content");
		await Bun.write(`${tempDir}/other.txt`, "Other Content");
	});

	afterEach(async () => {
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should process inline template with file reference", async () => {
		const template = `# Inline Template\n\n{{${tempDir}/data.txt}}\n\nEnd`;

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 1000,
			})
			.run();

		expect(result.content).toContain("# Inline Template");
		expect(result.content).toContain("Test Data Content");
		expect(result.content).toContain("End");
	});

	it("should process inline template with multiple file references", async () => {
		const template = `Start\n{{${tempDir}/data.txt}}\nMiddle\n{{${tempDir}/other.txt}}\nEnd`;

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 1000,
			})
			.run();

		expect(result.content).toContain("Start");
		expect(result.content).toContain("Test Data Content");
		expect(result.content).toContain("Middle");
		expect(result.content).toContain("Other Content");
		expect(result.content).toContain("End");
	});

	it("should process inline template with no interpolation markers", async () => {
		const template = "Just plain text in inline template";

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content).toBe("Just plain text in inline template");
	});

	it("should override templateFile when template is provided", async () => {
		// Create a template file
		await Bun.write(`${tempDir}/file-template.md`, "File Template Content");

		const inlineTemplate = "Inline Template Content";

		const result = await shotput()
			.with({
				template: inlineTemplate,
				templateDir: tempDir,
				templateFile: "file-template.md",
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		// Should use inline template, not file template
		expect(result.content).toBe("Inline Template Content");
		expect(result.content).not.toContain("File Template Content");
	});

	it("should handle empty inline template", async () => {
		const template = "";

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
			})
			.run();

		expect(result.content).toBe("");
	});

	it("should resolve relative paths in inline template", async () => {
		await Bun.write(`${tempDir}/subdir/nested.txt`, "Nested Content");

		const template = "{{./subdir/nested.txt}}";

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 1000,
			})
			.run();

		expect(result.content).toContain("Nested Content");
	});

	it("should handle inline template with glob patterns", async () => {
		// Create unique files for this test
		await Bun.write(`${tempDir}/glob1.txt`, "Glob File 1");
		await Bun.write(`${tempDir}/glob2.txt`, "Glob File 2");

		const template = `Files:\n{{${tempDir}/glob*.txt}}`;

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 1000,
			})
			.run();

		expect(result.content).toContain("Files:");
		// Check for actual file content that was matched by glob
		expect(result.content).toContain("Glob File 1");
		expect(result.content).toContain("Glob File 2");
	});

	it("should respect security restrictions in inline template", async () => {
		const template = "{{/etc/passwd}}";

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [tempDir],
			})
			.run();

		expect(
			result.content?.includes("[Security Error:") ||
				result.content?.includes("[Error reading"),
		).toBe(true);
	});

	it("should handle inline template with length limits", async () => {
		await Bun.write(`${tempDir}/long.txt`, "A".repeat(1000));

		const template = `{{${tempDir}/long.txt}}`;

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 100,
			})
			.run();

		// Output is truncated to budget; allow extra for "filename:<path>:\n" prefix on long CI paths
		expect(result.content?.length).toBeLessThanOrEqual(250);
	});

	it("should work with dynamically generated template content", async () => {
		const timestamp = Date.now();
		const template = `Generated at ${timestamp}\n{{${tempDir}/data.txt}}`;

		const result = await shotput()
			.with({
				template,
				templateDir: tempDir,
				responseDir: tempDir,
				allowedBasePaths: [process.cwd(), tempDir],
				maxPromptLength: 1000,
			})
			.run();

		expect(result.content).toContain(`Generated at ${timestamp}`);
		expect(result.content).toContain("Test Data Content");
	});
});
