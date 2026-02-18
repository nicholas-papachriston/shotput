import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { processContent } from "../../src/content";
import { getCountFn } from "../../src/tokens";

describe("tokens", () => {
	describe("getCountFn", () => {
		it("should return character length when tokenizer is undefined", () => {
			const config = createConfig({});
			const count = getCountFn(config);
			expect(count("hello")).toBe(5);
			expect(count("")).toBe(0);
		});

		it("should use heuristic for tokenizer openai", () => {
			const config = createConfig({ tokenizer: "openai" });
			const count = getCountFn(config);
			// ~4 chars per token: 8 chars -> 2 tokens
			expect(count("12345678")).toBe(2);
			expect(count("ab")).toBe(1);
		});

		it("should use heuristic for tokenizer cl100k_base", () => {
			const config = createConfig({ tokenizer: "cl100k_base" });
			const count = getCountFn(config);
			expect(count("1234")).toBe(1);
			expect(count("12345")).toBe(2);
		});

		it("should use custom function when tokenizer is function", () => {
			const config = createConfig({
				tokenizer: (text: string) => text.split(/\s+/).length,
			});
			const count = getCountFn(config);
			expect(count("one two three")).toBe(3);
			expect(count("single")).toBe(1);
		});
	});

	describe("processContent with tokenizer", () => {
		it("should truncate by token budget when tokenizer set", async () => {
			const config = createConfig({
				tokenizer: (t: string) => t.length, // 1 char = 1 token for test
			});
			const content = "abcdefghij";
			const result = await processContent(content, 4, config);
			expect(result.truncated).toBe(true);
			expect(result.content).toBe("abcd");
			expect(result.length).toBe(4);
			expect(result.remainingLength).toBe(0);
		});

		it("should not truncate when under budget (tokenizer set)", async () => {
			const config = createConfig({
				tokenizer: (t: string) => t.length,
			});
			const content = "abc";
			const result = await processContent(content, 10, config);
			expect(result.truncated).toBe(false);
			expect(result.content).toBe("abc");
			expect(result.remainingLength).toBe(7);
		});

		it("should use character length when config not passed", async () => {
			const content = "hello world";
			const result = await processContent(content, 5);
			expect(result.truncated).toBe(true);
			expect(result.content).toBe("hello");
			expect(result.remainingLength).toBe(0);
		});
	});
});
