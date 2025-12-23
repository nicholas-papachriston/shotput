#!/usr/bin/env bun
/**
 * Example 10: Nested Templates (Recursive Interpolation)
 *
 * This example demonstrates shotput's support for nested templates:
 * - Recursive interpolation of template markers found in included content
 * - Configurable recursion depth with `maxNestingDepth`
 * - Support for infinite layers (though default is 3)
 * - Interaction between nesting and parallel processing
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("10-nested-templates");

const EXAMPLE_DIR = join(process.cwd(), "examples");
const DATA_DIR = join(EXAMPLE_DIR, "data", "nested");
const OUTPUT_DIR = join(EXAMPLE_DIR, "output", "10-nested-templates");

/**
 * Setup: Create a chain of nested files
 * Level 0 (Template) -> Level 1 -> Level 2 -> Level 3 -> Final Content
 */
function setupTestData() {
	try {
		rmSync(DATA_DIR, { recursive: true, force: true });
	} catch (e) {
		// Ignore if directory doesn't exist
	}

	mkdirSync(DATA_DIR, { recursive: true });
	mkdirSync(OUTPUT_DIR, { recursive: true });

	// Level 1: Contains a marker for Level 2
	writeFileSync(
		join(DATA_DIR, "level1.md"),
		"## Level 1 Content\nThis content was loaded from level1.md.\n\n{{./level2.md}}",
	);

	// Level 2: Contains a marker for Level 3
	writeFileSync(
		join(DATA_DIR, "level2.md"),
		"### Level 2 Content\nThis content was loaded from level2.md.\n\n{{./level3.md}}",
	);

	// Level 3: Final content
	writeFileSync(
		join(DATA_DIR, "level3.md"),
		"#### Level 3 Content\nThis is the deepest level of our nested example.",
	);
}

async function runNestedExample() {
	const template = "# Nested Templates Demo\n\n{{./level1.md}}";

	const result = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		debug: true,
		debugFile: join(OUTPUT_DIR, "nested-full-debug.txt"),
	});

	log.info(result.metadata);
}

async function runDepthLimitExample() {
	log.info("--- Example 2: Limited Recursion Depth (maxNestingDepth: 1) ---");

	const template = "# Depth Limit Demo\n\n{{./level1.md}}";

	const result = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxNestingDepth: 1, // Only resolve the first level of nesting
		debug: true,
		debugFile: join(OUTPUT_DIR, "nested-limited-debug.txt"),
	});

	log.info(result.metadata);
}

async function runParallelNestedExample() {
	const template = "# Parallel Nested Demo\n\n{{./level1.md}}\n{{./level1.md}}";

	const result = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 4,
		enableContentLengthPlanning: true, // Use parallel mode
		debug: true,
		debugFile: join(OUTPUT_DIR, "nested-parallel-debug.txt"),
	});

	log.info(result.metadata);
}

async function main() {
	setupTestData();

	try {
		await runNestedExample();
		await runDepthLimitExample();
		await runParallelNestedExample();
	} catch (error) {
		log.error(`Example failed: ${error}`);
	}
}

main();
