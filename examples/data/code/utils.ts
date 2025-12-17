/**
 * Common utility functions for the Shotput demo application
 *
 * This module provides reusable helper functions for:
 * - String manipulation
 * - Data validation
 * - Date formatting
 * - Array operations
 */

/**
 * Capitalizes the first letter of a string
 */
export function capitalize(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a string to title case
 */
export function toTitleCase(str: string): string {
	return str
		.toLowerCase()
		.split(" ")
		.map((word) => capitalize(word))
		.join(" ");
}

/**
 * Truncates a string to a specified length with ellipsis
 */
export function truncate(
	str: string,
	maxLength: number,
	suffix = "...",
): string {
	if (str.length <= maxLength) return str;
	return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Validates an email address format
 */
export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Validates a URL format
 */
export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Formats a date to ISO string
 */
export function formatDate(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toISOString().split("T")[0];
}

/**
 * Formats a date to human-readable string
 */
export function formatDateLong(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/**
 * Calculates the difference in days between two dates
 */
export function daysBetween(
	date1: Date | string,
	date2: Date | string,
): number {
	const d1 = typeof date1 === "string" ? new Date(date1) : date1;
	const d2 = typeof date2 === "string" ? new Date(date2) : date2;
	const diffTime = Math.abs(d2.getTime() - d1.getTime());
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Removes duplicate items from an array
 */
export function unique<T>(array: T[]): T[] {
	return [...new Set(array)];
}

/**
 * Groups array items by a key function
 */
export function groupBy<T, K extends string | number>(
	array: T[],
	keyFn: (item: T) => K,
): Record<K, T[]> {
	return array.reduce(
		(acc, item) => {
			const key = keyFn(item);
			if (!acc[key]) {
				acc[key] = [];
			}
			acc[key].push(item);
			return acc;
		},
		{} as Record<K, T[]>,
	);
}

/**
 * Chunks an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

/**
 * Delays execution for specified milliseconds
 */
export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff
 */
export async function retry<T>(
	fn: () => Promise<T>,
	maxAttempts = 3,
	delayMs = 1000,
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;
			if (attempt < maxAttempts) {
				await sleep(delayMs * 2 ** (attempt - 1));
			}
		}
	}

	throw lastError!;
}

/**
 * Safely parses JSON with fallback value
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

/**
 * Deep clones an object
 */
export function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Merges two objects deeply
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
	const result = { ...target };

	for (const key in source) {
		if (source.hasOwnProperty(key)) {
			const sourceValue = source[key];
			const targetValue = result[key];

			if (
				typeof sourceValue === "object" &&
				sourceValue !== null &&
				!Array.isArray(sourceValue) &&
				typeof targetValue === "object" &&
				targetValue !== null
			) {
				result[key] = deepMerge(targetValue, sourceValue as any);
			} else {
				result[key] = sourceValue as any;
			}
		}
	}

	return result;
}

/**
 * Generates a random string of specified length
 */
export function randomString(length: number, charset = "alphanumeric"): string {
	const charsets = {
		alphanumeric:
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
		alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
		numeric: "0123456789",
		hex: "0123456789abcdef",
	};

	const chars =
		charsets[charset as keyof typeof charsets] || charsets.alphanumeric;
	let result = "";

	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return result;
}

/**
 * Converts bytes to human-readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Debounces a function call
 */
export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	delayMs: number,
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout>;

	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delayMs);
	};
}

/**
 * Throttles a function call
 */
export function throttle<T extends (...args: any[]) => any>(
	fn: T,
	limitMs: number,
): (...args: Parameters<T>) => void {
	let inThrottle = false;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			fn(...args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limitMs);
		}
	};
}
