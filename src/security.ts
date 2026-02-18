import { isAbsolute, resolve } from "node:path";
import { URL } from "node:url";
import type { ShotputConfig } from "./config";

export class SecurityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SecurityError";
	}
}

const resolvedAllowedPathsCache = new WeakMap<ShotputConfig, string[]>();

function getResolvedAllowedPaths(config: ShotputConfig): string[] {
	let resolved = resolvedAllowedPathsCache.get(config);
	if (!resolved) {
		resolved = config.allowedBasePaths.map((p) => resolve(p));
		resolvedAllowedPathsCache.set(config, resolved);
	}
	return resolved;
}

/**
 * Validates that a file path is within the allowed base paths.
 */
export const validatePath = (
	config: ShotputConfig,
	filePath: string,
	basePath?: string,
): string => {
	const resolvedPath = isAbsolute(filePath)
		? resolve(filePath)
		: resolve(basePath || process.cwd(), filePath);

	const resolvedAllowed = getResolvedAllowedPaths(config);
	const isAllowed = resolvedAllowed.some((allowedPath) =>
		resolvedPath.startsWith(allowedPath),
	);

	if (!isAllowed) {
		throw new SecurityError(
			`Path traversal detected: ${filePath} resolves to ${resolvedPath}, which is outside allowed paths`,
		);
	}

	// Check for dangerous path patterns
	if (filePath.includes("..") || filePath.includes("~")) {
		throw new SecurityError(
			`Potentially dangerous path pattern detected: ${filePath}`,
		);
	}

	return resolvedPath;
};

/**
 * Checks if a hostname belongs to a private network.
 */
const isPrivateNetwork = (hostname: string): boolean => {
	// Check for localhost
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1"
	) {
		return true;
	}

	// Check for private IP ranges
	const privateRanges = [
		/^10\./,
		/^172\.(1[6-9]|2[0-9]|3[0-1])\./,
		/^192\.168\./,
		/^169\.254\./, // link-local
		/^fc00:/, // IPv6 unique local
		/^fe80:/, // IPv6 link-local
	];

	return privateRanges.some((range) => range.test(hostname));
};

/**
 * Validates a URL against allowed domains and security policies.
 */
export const validateUrl = (config: ShotputConfig, url: string): void => {
	if (!config.allowHttp) {
		throw new SecurityError(`HTTP requests are disabled. URL: ${url}`);
	}

	try {
		const parsedUrl = new URL(url);

		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			throw new SecurityError(
				`Only HTTP/HTTPS protocols are allowed. Got: ${parsedUrl.protocol}`,
			);
		}

		// Block private/local network ranges
		const hostname = parsedUrl.hostname;
		if (isPrivateNetwork(hostname)) {
			throw new SecurityError(
				`Access to private networks is not allowed: ${hostname}`,
			);
		}

		// Check against allowed domains if specified
		if (config.allowedDomains.length > 0) {
			const allowedRegexes = config.allowedDomains.map((domain) => {
				const regexPattern = domain.startsWith(".")
					? `^https?://[^/]+\\${domain}(/.*)?$`
					: `^https?://${domain.replace(/\./g, "\\.")}(?:/.*)?$`;
				return new RegExp(regexPattern);
			});

			const isAllowed = allowedRegexes.some((pattern) => pattern.test(url));
			if (!isAllowed) {
				throw new SecurityError(`Domain not in allowlist: ${hostname}`);
			}
		}
	} catch (error) {
		if (error instanceof SecurityError) {
			throw error;
		}
		throw new SecurityError(`Invalid URL format: ${url}`);
	}
};

/**
 * Validates a function path against security policies.
 */
export const validateFunction = (
	config: ShotputConfig,
	functionPath: string,
): string => {
	if (!config.allowFunctions) {
		throw new SecurityError(
			`Function execution is disabled. Path: ${functionPath}`,
		);
	}

	const resolvedPath = resolve(functionPath);

	if (config.allowedFunctionPaths.length > 0) {
		const isAllowed = config.allowedFunctionPaths.some((allowedPath) =>
			resolvedPath.startsWith(resolve(allowedPath)),
		);
		if (!isAllowed) {
			throw new SecurityError(
				`Function path not in allowlist: ${functionPath}`,
			);
		}
	}

	// Check for dangerous file extensions
	const dangerousExts = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".py"];
	const ext = resolvedPath.split(".").pop()?.toLowerCase();
	if (ext && dangerousExts.includes(`.${ext}`)) {
		throw new SecurityError(`Dangerous file extension not allowed: .${ext}`);
	}

	return resolvedPath;
};

/**
 * Validates an S3 path.
 */
export const validateS3Path = (_config: ShotputConfig, path: string): void => {
	if (!path.startsWith("s3://")) {
		throw new SecurityError(`Invalid S3 path format: ${path}`);
	}

	const match = path.match(/^s3:\/\/([^\/]+)\/?(.*)?$/);
	if (!match) {
		throw new SecurityError(`Malformed S3 path: ${path}`);
	}

	const [, bucket, key] = match;

	// Check if it's a directory bucket (format: bucket-name--azid--x-s3)
	const isDirectoryBucket = /^[a-z0-9][a-z0-9-]*--[a-z0-9]+-az\d+--x-s3$/.test(
		bucket,
	);

	if (isDirectoryBucket) {
		// Directory buckets can be up to 255 characters
		if (!bucket || bucket.length < 3 || bucket.length > 255) {
			throw new SecurityError(
				`Invalid S3 directory bucket name length: ${bucket}`,
			);
		}
	} else {
		// Standard bucket name validation (3-63 characters)
		if (!bucket || bucket.length < 3 || bucket.length > 63) {
			throw new SecurityError(`Invalid S3 bucket name: ${bucket}`);
		}

		// Standard buckets should only contain lowercase alphanumeric and hyphens
		if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket)) {
			throw new SecurityError(`Invalid S3 bucket name format: ${bucket}`);
		}
	}

	// Check for dangerous S3 operations
	if (key?.includes("../") || key?.includes("..\\")) {
		throw new SecurityError(`Path traversal in S3 key not allowed: ${key}`);
	}
};

/**
 * Validates a skill source against allowed list.
 */
export const validateSkillSource = (
	config: ShotputConfig,
	source: string,
): void => {
	if (
		config.allowedSkillSources &&
		config.allowedSkillSources.length > 0 &&
		!config.allowedSkillSources.includes(source)
	) {
		throw new SecurityError(
			`Remote skill source not allowed: ${source}. Allowed sources: ${config.allowedSkillSources.join(", ")}`,
		);
	}
};
