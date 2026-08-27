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
const STAT_CACHE_CAP = 10_000;

type PathStat = { isFile: boolean; isDirectory: boolean };

export function clearStatCache(): void {
	statCache.clear();
}

async function lookupPathStat(path: string): Promise<PathStat | undefined> {
	const cached = statCache.get(path);
	if (cached) return cached;
	try {
		const stats = await stat(path);
		const statResult = {
			isFile: stats.isFile(),
			isDirectory: stats.isDirectory(),
		};
		if (statCache.size >= STAT_CACHE_CAP) {
			const first = statCache.keys().next().value;
			if (first !== undefined) statCache.delete(first);
		}
		statCache.set(path, statResult);
		return statResult;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "ENOENT" && code !== "ENOTDIR") {
			throw error;
		}
		return undefined;
	}
}

function typeFromStat(
	statResult: PathStat | undefined,
): TemplateType | undefined {
	if (!statResult) return undefined;
	if (statResult.isFile) return TemplateType.File;
	if (statResult.isDirectory) return TemplateType.Directory;
	return undefined;
}

function isSectionLiteral(pathForSection: string): boolean {
	return (
		pathForSection.startsWith("#section:") ||
		pathForSection.trim() === "/section"
	);
}

function matchesCustomSource(
	path: string,
	rawPath: string | undefined,
	config: ShotputConfig | undefined,
): boolean {
	if (config === undefined) return false;
	const sources = config.customSources;
	if (sources === undefined || sources.length === 0) return false;
	const pathForMatch = rawPath ?? path;
	return getMatchingPlugin(config, pathForMatch) !== undefined;
}

function typeFromScheme(
	path: string,
	rawPath: string | undefined,
	config: ShotputConfig | undefined,
): TemplateType | undefined {
	if (path.startsWith(SKILL_TEMPLATE)) return TemplateType.Skill;
	const pathForSection = rawPath ?? path;
	if (isSectionLiteral(pathForSection)) return TemplateType.String;
	if (path.includes(FUNCTION_TEMPLATE)) return TemplateType.Function;
	if (matchesCustomSource(path, rawPath, config)) return TemplateType.Custom;
	if (GLOB_CHARS.test(path)) return TemplateType.Glob;
	if (HTTP_PREFIX.test(path)) return TemplateType.Http;
	if (S3_PREFIX.test(path)) return TemplateType.S3;
	if (regexIndicators.some((pattern) => pattern.test(path))) {
		return TemplateType.Regex;
	}
	return undefined;
}

function typeFromPathShape(
	path: string,
	rawPath: string | undefined,
): TemplateType {
	const pathToTest = rawPath ?? path;
	if (
		pathToTest.includes("/") ||
		pathToTest.includes("\\") ||
		pathToTest.startsWith(".")
	) {
		return TemplateType.File;
	}
	return TemplateType.String;
}

export const findTemplateType = async (
	path: string,
	rawPath?: string,
	config?: ShotputConfig,
): Promise<TemplateType> => {
	try {
		const statResult = await lookupPathStat(path);
		const fromStat = typeFromStat(statResult);
		if (fromStat !== undefined) return fromStat;
		const fromScheme = typeFromScheme(path, rawPath, config);
		if (fromScheme !== undefined) return fromScheme;
		return typeFromPathShape(path, rawPath);
	} catch (error) {
		const errno = error as NodeJS.ErrnoException;
		if (errno.code !== "ENOENT" && errno.code !== "ENOTDIR") {
			throw error;
		}
		return TemplateType.String;
	}
};
