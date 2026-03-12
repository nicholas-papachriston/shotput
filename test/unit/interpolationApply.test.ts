import { describe, expect, it } from "bun:test";
import {
	getInterpolationMatchesWithIndices,
	inclusionBasePathFor,
	interpolationPattern,
} from "../../src/runtime/interpolationApply";
import { TemplateType } from "../../src/types";

describe("interpolationApply", () => {
	describe("getInterpolationMatchesWithIndices", () => {
		it("should return empty array for content with no placeholders", () => {
			expect(getInterpolationMatchesWithIndices("Hello World")).toEqual([]);
		});

		it("should find single placeholder", () => {
			const result = getInterpolationMatchesWithIndices(
				"Hello {{test/fixtures/file.txt}}!",
			);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				match: "{{test/fixtures/file.txt}}",
				start: 6,
				end: 32,
			});
		});

		it("should find multiple placeholders in document order", () => {
			const result = getInterpolationMatchesWithIndices(
				"{{a}} middle {{b}} end",
			);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ match: "{{a}}", start: 0, end: 5 });
			expect(result[1]).toEqual({ match: "{{b}}", start: 13, end: 18 });
		});

		it("should find adjacent placeholders", () => {
			const result = getInterpolationMatchesWithIndices("{{a}}{{b}}");
			expect(result).toHaveLength(2);
			expect(result[0].match).toBe("{{a}}");
			expect(result[1].match).toBe("{{b}}");
		});

		it("should handle empty content", () => {
			expect(getInterpolationMatchesWithIndices("")).toEqual([]);
		});

		it("should handle content with unclosed placeholder", () => {
			const result = getInterpolationMatchesWithIndices("text {{incomplete");
			expect(result).toEqual([]);
		});
	});

	describe("inclusionBasePathFor", () => {
		const basePath = "/project/root";

		it("should return dirname for File type", () => {
			const path = "/project/root/test/fixtures/a.txt";
			expect(inclusionBasePathFor(TemplateType.File, path, basePath)).toBe(
				"/project/root/test/fixtures",
			);
		});

		it("should return dirname for Glob type", () => {
			const path = "/project/root/data/*.txt";
			expect(inclusionBasePathFor(TemplateType.Glob, path, basePath)).toBe(
				"/project/root/data",
			);
		});

		it("should return dirname for Regex type", () => {
			const path = "/project/root/templates/file.txt";
			expect(inclusionBasePathFor(TemplateType.Regex, path, basePath)).toBe(
				"/project/root/templates",
			);
		});

		it("should return path itself for Directory type", () => {
			const path = "/project/root/data/subdir";
			expect(inclusionBasePathFor(TemplateType.Directory, path, basePath)).toBe(
				"/project/root/data/subdir",
			);
		});

		it("should return basePath for Custom type", () => {
			expect(
				inclusionBasePathFor(TemplateType.Custom, "custom://path", basePath),
			).toBe(basePath);
		});

		it("should return basePath for Http type", () => {
			expect(
				inclusionBasePathFor(
					TemplateType.Http,
					"https://example.com",
					basePath,
				),
			).toBe(basePath);
		});
	});

	describe("interpolationPattern", () => {
		it("should match standard placeholder", () => {
			const match = "Hello {{path/to/file}}!".match(interpolationPattern);
			expect(match).toContain("{{path/to/file}}");
		});

		it("should match placeholder with context", () => {
			const match = "{{context.key}}".match(interpolationPattern);
			expect(match).toContain("{{context.key}}");
		});
	});
});
