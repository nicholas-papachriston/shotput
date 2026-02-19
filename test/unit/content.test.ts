import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { processContent } from "../../src/content";

describe("content", () => {
	describe("processContent", () => {
		it("should return content unchanged when under budget", async () => {
			const content = "Hello World";
			const result = await processContent(content, 100);
			expect(result.content).toBe(content);
			expect(result.truncated).toBe(false);
			expect(result.length).toBe(11);
			expect(result.remainingLength).toBe(89);
		});

		it("should truncate when over budget (character count)", async () => {
			const content = "1234567890";
			const result = await processContent(content, 5);
			expect(result.content).toBe("12345");
			expect(result.truncated).toBe(true);
			expect(result.length).toBe(5);
			expect(result.remainingLength).toBe(0);
		});

		it("should handle empty content", async () => {
			const result = await processContent("", 100);
			expect(result.content).toBe("");
			expect(result.truncated).toBe(false);
			expect(result.length).toBe(0);
			expect(result.remainingLength).toBe(100);
		});

		it("should handle exact budget", async () => {
			const content = "12345";
			const result = await processContent(content, 5);
			expect(result.content).toBe(content);
			expect(result.truncated).toBe(false);
		});

		it("should use tokenizer when config provided", async () => {
			const config = createConfig({
				tokenizer: "openai",
			});
			const content = "Hello World";
			const result = await processContent(content, 100, config);
			expect(result.content).toBe(content);
			expect(result.truncated).toBe(false);
			expect(result.length).toBeGreaterThan(0);
		});

		it("should truncate by tokens when tokenizer set", async () => {
			const config = createConfig({
				tokenizer: "openai",
			});
			const content = "a ".repeat(1000);
			const result = await processContent(content, 10, config);
			expect(result.truncated).toBe(true);
			expect(result.content.length).toBeLessThan(content.length);
		});
	});
});
