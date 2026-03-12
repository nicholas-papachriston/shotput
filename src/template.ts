import { stat } from "node:fs/promises";
import type { ShotputConfig } from "./config";
import { FUNCTION_TEMPLATE } from "./function";
import { SKILL_TEMPLATE } from "./skill";
import { getMatchingPlugin } from "./sources/plugins";
import { TemplateType } from "./types";

const GLOB_CHARS = /[*?\[\]]/;
const HTTP_PREFIX = /^https?:\/\/.+/;
const S3_PREFIX = /^s3:\/\/.+/;

const regexIndicators = [
	/^\/.+\/[gimyus]*$/, // Pattern enclosed in forward slashes
	/[\^\$\(\)\+\{\}]/, // Common regex special characters
];

const statCache = new Map<string, { isFile: boolean; isDirectory: boolean }>();

export function clearStatCache(): void {
	statCache.clear();
}

export const findTemplateType = async (
	path: string,
	rawPath?: string,
	config?: ShotputConfig,
): Promise<TemplateType> => {
	try {
		let statResult = statCache.get(path);
		if (!statResult) {
			try {
				const stats = await stat(path);
				statResult = {
					isFile: stats.isFile(),
					isDirectory: stats.isDirectory(),
				};
				statCache.set(path, statResult);
			} catch {
				// Ignore stat errors
			}
		}
		if (statResult) {
			if (statResult.isFile) return TemplateType.File;
			if (statResult.isDirectory) return TemplateType.Directory;
		}

		if (path.startsWith(SKILL_TEMPLATE)) {
			return TemplateType.Skill;
		}

		// Section blocks are post-interpolation; leave as literal
		const pathForSection = rawPath ?? path;
		if (
			pathForSection.startsWith("#section:") ||
			pathForSection.trim() === "/section"
		) {
			return TemplateType.String;
		}

		if (path.includes(FUNCTION_TEMPLATE)) {
			return TemplateType.Function;
		}

		// Custom source plugins (before Glob/Http so schemes like sqlite://.../query:SELECT * are not treated as glob)
		if (config?.customSources?.length) {
			const pathForMatch = rawPath ?? path;
			if (getMatchingPlugin(config, pathForMatch)) {
				return TemplateType.Custom;
			}
		}

		if (GLOB_CHARS.test(path)) {
			return TemplateType.Glob;
		}

		if (HTTP_PREFIX.test(path)) {
			return TemplateType.Http;
		}

		if (S3_PREFIX.test(path)) {
			return TemplateType.S3;
		}

		if (regexIndicators.some((pattern) => pattern.test(path))) {
			return TemplateType.Regex;
		}

		// Fallback for paths that don't exist yet but look like paths
		// Use rawPath if provided to avoid treating simple strings as files
		const pathToTest = rawPath ?? path;
		if (
			pathToTest.includes("/") ||
			pathToTest.includes("\\") ||
			pathToTest.startsWith(".")
		) {
			return TemplateType.File;
		}

		return TemplateType.String;
	} catch (error) {
		return TemplateType.String;
	}
};
