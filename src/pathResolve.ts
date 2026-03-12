import { isAbsolute, resolve } from "node:path";
import type { ShotputConfig } from "./config";
import { getMatchingPlugin } from "./sources/plugins";

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

const resolvedPathCache = new WeakMap<ShotputConfig, Map<string, string>>();

function getOrCreatePathCache(config: ShotputConfig): Map<string, string> {
	let cache = resolvedPathCache.get(config);
	if (!cache) {
		cache = new Map();
		resolvedPathCache.set(config, cache);
	}
	return cache;
}

/**
 * Resolve a template path: if it has a special prefix or matches a custom plugin,
 * return as-is; otherwise resolve relative to basePath (or return if absolute).
 */
export const resolveTemplatePath = (
	basePath: string,
	filePath: string,
	config: ShotputConfig,
): string => {
	const cacheKey = `${basePath}\0${filePath}`;
	const cache = getOrCreatePathCache(config);
	const cached = cache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}
	if (SPECIAL_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
		cache.set(cacheKey, filePath);
		return filePath;
	}
	if (getMatchingPlugin(config, filePath)) {
		cache.set(cacheKey, filePath);
		return filePath;
	}
	const resolved = isAbsolute(filePath)
		? filePath
		: resolve(basePath, filePath);
	cache.set(cacheKey, resolved);
	return resolved;
};
