import { isAbsolute, resolve } from "node:path";
import type { ShotputConfig } from "./config";
import { getMatchingPlugin } from "./plugins";

/**
 * Prefixes that should NOT have path resolution applied.
 * Paths starting with these are returned as-is (e.g. skill:, http://, s3://).
 */
export const SPECIAL_PREFIXES = [
	"skill:",
	"TemplateType.Function:",
	"http://",
	"https://",
	"s3://",
];

/**
 * Resolve a template path: if it has a special prefix or matches a custom plugin,
 * return as-is; otherwise resolve relative to basePath (or return if absolute).
 */
export const resolveTemplatePath = (
	basePath: string,
	filePath: string,
	config: ShotputConfig,
): string => {
	if (SPECIAL_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
		return filePath;
	}
	if (getMatchingPlugin(config, filePath)) {
		return filePath;
	}
	return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
};
