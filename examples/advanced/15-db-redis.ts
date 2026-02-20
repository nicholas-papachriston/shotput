#!/usr/bin/env bun

/**
 * Example 15: Redis Database (first-class)
 *
 * Demonstrates built-in Redis support via .redis(): {{redis:///get:key}} and
 * {{redis://host/get:key}} / {{redis:///keys:pattern}}. Uses Bun's built-in
 * Redis client. When the placeholder has no host (redis:///get:key), the
 * connection comes from .redis(url), REDIS_URL, or VALKEY_URL env var.
 *
 * Usage:
 *   bun run examples/advanced/15-db-redis.ts
 *
 * Set REDIS_URL or pass a URL to .redis() for redis:///get:key.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("15-db-redis");
const outputDir = join(import.meta.dir, "../output/15-db-redis");
mkdirSync(outputDir, { recursive: true });

const redisUrl =
	typeof process !== "undefined"
		? (process.env["REDIS_URL"] ?? process.env["VALKEY_URL"])
		: undefined;

const template = `# DB Demo (Redis)

## Get key (uses .redis() URL or REDIS_URL env var)
{{redis:///get:shotput:demo}}

## Keys pattern
{{redis:///keys:*}}
`;

try {
	const builder = shotput()
		.template(template)
		.templateDir(outputDir)
		.responseDir(outputDir)
		.allowedBasePaths([outputDir])
		.debug(true)
		.debugFile(join(outputDir, "db-redis-debug.txt"));

	const result = await (redisUrl ? builder.redis(redisUrl) : builder).run();
	log.info(result.metadata);
	console.log("Output:", result.content?.slice(0, 600));
} catch (error) {
	log.error(error);
	throw error;
}
