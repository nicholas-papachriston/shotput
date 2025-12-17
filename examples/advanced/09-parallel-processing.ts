#!/usr/bin/env bun
/**
 * Example 10: Parallel Processing with Content Length Planning
 *
 * This example demonstrates shotput's advanced parallel processing capabilities:
 * - Planning phase to determine all files to be interpolated
 * - Content length detection before processing
 * - Parallel fetching with configurable concurrency
 * - Retry handling with exponential backoff
 * - Progress tracking
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("10-parallel-simple");

const EXAMPLE_DIR = join(process.cwd(), "examples");
const DATA_DIR = join(EXAMPLE_DIR, "data", "parallel");
const OUTPUT_DIR = join(EXAMPLE_DIR, "output", "09-parallel-processing");

// Setup: Create test data files
function setupTestData() {
	mkdirSync(DATA_DIR, { recursive: true });
	mkdirSync(OUTPUT_DIR, { recursive: true });

	// Create various sized files to demonstrate parallel processing
	writeFileSync(
		join(DATA_DIR, "small1.txt"),
		"This is a small file with minimal content.",
	);

	writeFileSync(
		join(DATA_DIR, "small2.txt"),
		"Another small file for testing.",
	);

	writeFileSync(
		join(DATA_DIR, "medium1.txt"),
		"Medium sized content.\n".repeat(50),
	);

	writeFileSync(
		join(DATA_DIR, "medium2.txt"),
		"More medium content.\n".repeat(50),
	);

	writeFileSync(
		join(DATA_DIR, "large1.txt"),
		"Large file content.\n".repeat(200),
	);

	writeFileSync(
		join(DATA_DIR, "large2.txt"),
		"Another large file.\n".repeat(200),
	);

	// Create a config file
	writeFileSync(
		join(DATA_DIR, "config.json"),
		JSON.stringify(
			{
				project: "Parallel Processing Demo",
				version: "1.0.0",
				features: ["planning", "retry", "concurrency"],
			},
			null,
			2,
		),
	);
}

async function example1_basicParallel() {
	const template = `# Parallel Processing Demo

## Small Files
File 1: {{${join(DATA_DIR, "small1.txt")}}}
File 2: {{${join(DATA_DIR, "small2.txt")}}}

## Medium Files
File 3: {{${join(DATA_DIR, "medium1.txt")}}}
File 4: {{${join(DATA_DIR, "medium2.txt")}}}

## Configuration
{{${join(DATA_DIR, "config.json")}}}`;

	const result = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 4,
		enableContentLengthPlanning: true,
		debug: true,
		debugFile: join(OUTPUT_DIR, "parallel-basic-debug.txt"),
	});

	log.info(result.metadata);
}

async function example2_contentLengthPlanning() {
	const template = `# Content Length Demo

## All Files (with planning)
{{${join(DATA_DIR, "small1.txt")}}}
{{${join(DATA_DIR, "medium1.txt")}}}
{{${join(DATA_DIR, "large1.txt")}}}
{{${join(DATA_DIR, "large2.txt")}}}`;

	const result = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 4,
		maxPromptLength: 5000,
		enableContentLengthPlanning: true,
		debug: true,
		debugFile: join(OUTPUT_DIR, "length-planning-debug.txt"),
	});

	log.info(result.metadata);
}

async function example3_retryLogic() {
	const template = `# Retry Demo

## Existing Files
{{${join(DATA_DIR, "small1.txt")}}}
{{${join(DATA_DIR, "config.json")}}}

## This file might not exist (will retry)
{{${join(DATA_DIR, "maybe-missing.txt")}}}`;

	const result = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 2,
		maxRetries: 3,
		retryDelay: 500,
		retryBackoffMultiplier: 2,
		enableContentLengthPlanning: true,
		debug: true,
		debugFile: join(OUTPUT_DIR, "retry-debug.txt"),
	});

	log.info(result.metadata);
}

async function example4_performanceComparison() {
	const template = `# Performance Test

{{${join(DATA_DIR, "small1.txt")}}}
{{${join(DATA_DIR, "small2.txt")}}}
{{${join(DATA_DIR, "medium1.txt")}}}
{{${join(DATA_DIR, "medium2.txt")}}}
{{${join(DATA_DIR, "large1.txt")}}}
{{${join(DATA_DIR, "large2.txt")}}}`;

	const sequentialResult = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 1,
		enableContentLengthPlanning: false,
		debug: true,
		debugFile: join(OUTPUT_DIR, "sequential-debug.txt"),
	});

	log.info(sequentialResult.metadata);

	const parallelResult = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 4,
		enableContentLengthPlanning: true,
		debug: true,
		debugFile: join(OUTPUT_DIR, "parallel-debug.txt"),
	});

	log.info(parallelResult.metadata);
}

async function example5_highConcurrency() {
	const template = `# High Concurrency Test

{{${join(DATA_DIR, "small1.txt")}}}
{{${join(DATA_DIR, "small2.txt")}}}
{{${join(DATA_DIR, "medium1.txt")}}}
{{${join(DATA_DIR, "medium2.txt")}}}
{{${join(DATA_DIR, "large1.txt")}}}
{{${join(DATA_DIR, "large2.txt")}}}`;
	for (const concurrency of [1, 2, 4, 8]) {
		const result = await shotput({
			template,
			templateDir: DATA_DIR,
			allowedBasePaths: [DATA_DIR],
			maxConcurrency: concurrency,
			enableContentLengthPlanning: true,
			debug: true,
			debugFile: join(OUTPUT_DIR, `high-concurrency-${concurrency}-debug.txt`),
		});

		log.info(result.metadata);
	}
}

async function example6_globParallel() {
	const template = `# Glob Pattern Demo

## All Text Files
{{${join(DATA_DIR, "*.txt")}}}

## Specific Config
{{${join(DATA_DIR, "config.json")}}}`;

	const result = await shotput({
		template,
		templateDir: DATA_DIR,
		allowedBasePaths: [DATA_DIR],
		maxConcurrency: 6,
		enableContentLengthPlanning: true,
		debug: true,
		debugFile: join(OUTPUT_DIR, "glob-parallel-debug.txt"),
	});

	log.info(result.metadata);
}

async function main() {
	setupTestData();
	await example1_basicParallel();
	await example2_contentLengthPlanning();
	await example3_retryLogic();
	await example4_performanceComparison();
	await example5_highConcurrency();
	await example6_globParallel();
}

main();
