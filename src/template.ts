import { stat } from "node:fs/promises";
import type { ShotputConfig } from "./config";
import { FUNCTION_TEMPLATE } from "./function";
import { getMatchingPlugin } from "./plugins";
import { SKILL_TEMPLATE } from "./skill";
import { TemplateType } from "./types";

const regexIndicators = [
	/^\/.+\/[gimyus]*$/, // Pattern enclosed in forward slashes
	/[\^\$\(\)\+\{\}]/, // Common regex special characters
];

export const findTemplateType = async (
	path: string,
	rawPath?: string,
	config?: ShotputConfig,
): Promise<TemplateType> => {
	try {
		try {
			const stats = await stat(path);
			if (stats.isFile()) {
				return TemplateType.File;
			}

			if (stats.isDirectory()) {
				return TemplateType.Directory;
			}
		} catch {
			// Ignore stat errors
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

		if (/[\*\?\[\]]/.test(path)) {
			return TemplateType.Glob;
		}

		if (/^https?:\/\/.+/.test(path)) {
			return TemplateType.Http;
		}

		if (/^s3:\/\/.+/.test(path)) {
			return TemplateType.S3;
		}

		if (regexIndicators.some((pattern) => pattern.test(path))) {
			return TemplateType.Regex;
		}

		// Custom source plugins (check before file fallback so custom URLs are not treated as paths)
		if (config?.customSources?.length) {
			const pathForMatch = rawPath ?? path;
			if (getMatchingPlugin(config, pathForMatch)) {
				return TemplateType.Custom;
			}
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
