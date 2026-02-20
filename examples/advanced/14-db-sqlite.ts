#!/usr/bin/env bun

/**
 * Example 14: SQLite Database (first-class)
 *
 * Demonstrates built-in SQLite support via .sqlite(): {{sqlite://path/query:SQL}}.
 * Uses Bun's built-in SQLite client (bun:sqlite).
 *
 * Usage:
 *   bun run examples/advanced/14-db-sqlite.ts
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("14-db-sqlite");
const outputDir = join(import.meta.dir, "../output/14-db-sqlite");
mkdirSync(outputDir, { recursive: true });

const dbPath = join(outputDir, "demo.sqlite");
const db = new Database(dbPath);
db.run("CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)");
db.run("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", [
	"app",
	"shotput-demo",
]);
db.run("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", [
	"version",
	"1.0",
]);
db.close();

const template = `# DB Demo (SQLite)

## Config table
{{sqlite://demo.sqlite/query:SELECT * FROM config}}
`;

try {
	const result = await shotput()
		.template(template)
		.templateDir(outputDir)
		.responseDir(outputDir)
		.allowedBasePaths([outputDir])
		.sqlite()
		.debug(true)
		.debugFile(join(outputDir, "db-sqlite-debug.txt"))
		.run();
	log.info(result.metadata);
	console.log("Output:", result.content?.slice(0, 600));
} catch (error) {
	log.error(error);
	throw error;
}
