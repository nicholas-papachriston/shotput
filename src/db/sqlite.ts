import { Database } from "bun:sqlite";
import { isAbsolute, resolve } from "node:path";
import type { ShotputConfig } from "../config";

const SQLITE_PREFIX = "sqlite://";
const QUERY_PART = "/query:";

export interface SqliteParsed {
	path: string;
	query: string;
}

/**
 * Parse sqlite://path/to/db.sqlite/query:SELECT ...
 * Path may contain segments; we split on the last /query:
 */
export function parseSqliteUrl(rawPath: string): SqliteParsed | null {
	if (!rawPath.startsWith(SQLITE_PREFIX)) return null;
	const after = rawPath.slice(SQLITE_PREFIX.length);
	const queryIndex = after.lastIndexOf(QUERY_PART);
	if (queryIndex === -1) return null;
	const path = after.slice(0, queryIndex).trim();
	const query = after.slice(queryIndex + QUERY_PART.length).trim();
	if (!path || !query) return null;
	return { path, query };
}

/**
 * Resolve path relative to basePath and ensure it is under one of config.allowedBasePaths.
 */
export function validateSqlitePath(
	config: ShotputConfig,
	filePath: string,
	basePath: string,
): string {
	if (filePath.includes("..") || filePath.includes("~")) {
		throw new Error(`Potentially dangerous path pattern detected: ${filePath}`);
	}
	const resolvedPath = isAbsolute(filePath)
		? resolve(filePath)
		: resolve(basePath, filePath);
	const allowed = config.allowedBasePaths.map((p) => resolve(p));
	const isAllowed = allowed.some((a) => resolvedPath.startsWith(a));
	if (!isAllowed) {
		throw new Error(
			`Path traversal detected: ${filePath} resolves to ${resolvedPath}, which is outside allowed paths`,
		);
	}
	return resolvedPath;
}

/**
 * Run SQLite query and return rows as JSON string.
 */
export function runSqliteQuery(dbPath: string, sql: string): string {
	const db = new Database(dbPath, { readonly: true });
	try {
		const rows = db.query(sql).all();
		return JSON.stringify(rows);
	} finally {
		db.close();
	}
}

/**
 * Resolve sqlite:// placeholder: validate path, run query, return content.
 */
export function resolveSqlite(
	rawPath: string,
	basePath: string,
	config: ShotputConfig,
): string {
	const parsed = parseSqliteUrl(rawPath);
	if (!parsed) {
		throw new Error(`Invalid sqlite URL: ${rawPath}`);
	}
	const validatedPath = validateSqlitePath(config, parsed.path, basePath);
	return runSqliteQuery(validatedPath, parsed.query);
}
