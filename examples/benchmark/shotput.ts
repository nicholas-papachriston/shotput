#!/usr/bin/env bun

/**
 * Benchmark: Shotput (Bun)
 * Same large template + context as other engines; timed.
 */

import { join } from "node:path";
import { shotput } from "../../src/index";
import {
	EXTRA_KEYS,
	FLAG_COUNT,
	ITEM_COUNT,
	benchmarkContext,
	getShotputTemplate,
} from "./data";

const RUNS = 5;
const template = getShotputTemplate();

function runOne(): Promise<string> {
	return shotput({
		template,
		templateDir: join(import.meta.dir, ".."),
		responseDir: join(import.meta.dir, ".."),
		allowedBasePaths: [join(import.meta.dir, "../..")],
		context: benchmarkContext,
		enableContentLengthPlanning: false,
		maxConcurrency: 1,
		debug: false,
	}).then((r) => r.content ?? "");
}

async function main(): Promise<void> {
	// Warmup
	await runOne();

	const times: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = await runOne();
		const elapsed = performance.now() - start;
		times.push(elapsed);
		if (i === 0) {
			console.log("Output length:", out.length, "chars");
		}
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	console.log("Shotput (Bun)");
	console.log(
		`  Data: ${ITEM_COUNT} items, ${FLAG_COUNT} flags, ${EXTRA_KEYS} extra keys`,
	);
	console.log(`  Median: ${median.toFixed(2)} ms`);
	console.log(`  Avg: ${avg.toFixed(2)} ms`);
}

main().catch(console.error);
