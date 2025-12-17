import { isAbsolute, resolve } from "node:path";
import { URL } from "node:url";

export class SecurityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SecurityError";
	}
}

export class SecurityValidator {
	private static instance: SecurityValidator;
	private allowedBasePaths = new Set([process.cwd()]);
	private allowedDomains: RegExp[] = [];
	private allowHttp = false;
	private allowFunctions = false;
	private allowedFunctionPaths = new Set<string>();

	private constructor() {}

	static getInstance(): SecurityValidator {
		if (!SecurityValidator.instance) {
			SecurityValidator.instance = new SecurityValidator();
		}
		return SecurityValidator.instance;
	}

	configure(options: {
		allowedBasePaths?: string[];
		allowedDomains?: string[];
		allowHttp?: boolean;
		allowFunctions?: boolean;
		allowedFunctionPaths?: string[];
	}): void {
		if (options.allowedBasePaths) {
			this.allowedBasePaths = new Set(
				options.allowedBasePaths.map((p) => resolve(p)),
			);
		}
		if (options.allowedDomains) {
			this.allowedDomains = options.allowedDomains.map((domain) => {
				const regexPattern = domain.startsWith(".")
					? `^https?://[^/]+\\${domain}(/.*)?$`
					: `^https?://${domain.replace(/\./g, "\\.")}(?:/.*)?$`;
				return new RegExp(regexPattern);
			});
		}
		if (options.allowHttp !== undefined) {
			this.allowHttp = options.allowHttp;
		}
		if (options.allowFunctions !== undefined) {
			this.allowFunctions = options.allowFunctions;
		}
		if (options.allowedFunctionPaths) {
			this.allowedFunctionPaths = new Set(
				options.allowedFunctionPaths.map((p) => resolve(p)),
			);
		}
	}

	validatePath(filePath: string, basePath?: string): string {
		const resolvedPath = isAbsolute(filePath)
			? resolve(filePath)
			: resolve(basePath || process.cwd(), filePath);

		const isAllowed = Array.from(this.allowedBasePaths).some((allowedPath) =>
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
	}

	validateUrl(url: string): void {
		if (!this.allowHttp) {
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
			if (this.isPrivateNetwork(hostname)) {
				throw new SecurityError(
					`Access to private networks is not allowed: ${hostname}`,
				);
			}

			// Check against allowed domains if specified
			if (this.allowedDomains.length > 0) {
				const isAllowed = this.allowedDomains.some((pattern) =>
					pattern.test(url),
				);
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
	}

	validateFunction(functionPath: string): string {
		if (!this.allowFunctions) {
			throw new SecurityError(
				`Function execution is disabled. Path: ${functionPath}`,
			);
		}

		const resolvedPath = resolve(functionPath);

		if (this.allowedFunctionPaths.size > 0) {
			const isAllowed = Array.from(this.allowedFunctionPaths).some(
				(allowedPath) => resolvedPath.startsWith(allowedPath),
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
	}

	private isPrivateNetwork(hostname: string): boolean {
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
	}

	validateS3Path(path: string): void {
		// Basic S3 path validation
		if (!path.startsWith("s3://")) {
			throw new SecurityError(`Invalid S3 path format: ${path}`);
		}

		const match = path.match(/^s3:\/\/([^\/]+)\/?(.*)?$/);
		if (!match) {
			throw new SecurityError(`Malformed S3 path: ${path}`);
		}

		const [, bucket, key] = match;

		// Check if it's a directory bucket (format: bucket-name--azid--x-s3)
		const isDirectoryBucket =
			/^[a-z0-9][a-z0-9-]*--[a-z0-9]+-az\d+--x-s3$/.test(bucket);

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
	}
}

// Default security configuration
export const securityValidator = SecurityValidator.getInstance();
