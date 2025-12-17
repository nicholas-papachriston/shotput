#!/usr/bin/env bun
/**
 * Example 10: Simple Parallel Processing
 *
 * This example shows how to enable parallel processing in shotput
 * for faster template interpolation.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("10-parallel-simple");

const EXAMPLE_DIR = join(process.cwd(), "examples");
const DATA_DIR = join(EXAMPLE_DIR, "data", "parallel-simple");
const OUTPUT_DIR = join(EXAMPLE_DIR, "output", "10-parallel-simple");

// Setup test files
function setup() {
	mkdirSync(DATA_DIR, { recursive: true });
	mkdirSync(OUTPUT_DIR, { recursive: true });

	writeFileSync(join(DATA_DIR, "intro.txt"), "Welcome to parallel processing!");
	writeFileSync(
		join(DATA_DIR, "feature1.txt"),
		"Feature 1: Automatic planning phase",
	);
	writeFileSync(
		join(DATA_DIR, "feature2.txt"),
		"Feature 2: Content length detection",
	);
	writeFileSync(join(DATA_DIR, "feature3.txt"), "Feature 3: Parallel fetching");
	writeFileSync(
		join(DATA_DIR, "feature4.txt"),
		"Feature 4: Retry with backoff",
	);
	writeFileSync(
		join(DATA_DIR, "conclusion.txt"),
		"All features work together seamlessly!",
	);
}

async function main() {
	setup();

	// Create a template with multiple file references
	const template = `# Parallel Processing Features

## Introduction
{{${join(DATA_DIR, "intro.txt")}}}

## Features
{{${join(DATA_DIR, "feature1.txt")}}}
{{${join(DATA_DIR, "feature2.txt")}}}
{{${join(DATA_DIR, "feature3.txt")}}}
{{${join(DATA_DIR, "feature4.txt")}}}

## Conclusion
{{${join(DATA_DIR, "conclusion.txt")}}}`;
	const parallelResult = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 4, // Process 4 files at once
		enableContentLengthPlanning: true, // Enable smart planning
		maxRetries: 3, // Retry up to 3 times on failure
		retryDelay: 1000, // Wait 1s before first retry
		retryBackoffMultiplier: 2, // Double delay each retry
		debug: true,
		debugFile: join(OUTPUT_DIR, "parallel-simple-output-debug.txt"),
	});

	log.info(parallelResult.metadata);

	const sequentialResult = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 1, // Process 1 file at a time
		enableContentLengthPlanning: false, // Disable parallel features
		debug: true,
		debugFile: join(OUTPUT_DIR, "sequential-output-debug.txt"),
	});

	log.info(sequentialResult.metadata);
}

main();
