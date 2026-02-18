#!/usr/bin/env bun

/**
 * Benchmark: Handlebars (Bun)
 * Same large template + context as other engines; timed.
 */

import Handlebars from "handlebars";
import {
	EXTRA_KEYS,
	FLAG_COUNT,
	ITEM_COUNT,
	benchmarkContext,
	getHandlebarsTemplate,
} from "./data";

const RUNS = 5;
const templateSrc = getHandlebarsTemplate();
const template = Handlebars.compile(templateSrc);

function runOne(): string {
	return template({ context: benchmarkContext });
}

function main(): void {
	// Warmup
	runOne();

	const times: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = runOne();
		const elapsed = performance.now() - start;
		times.push(elapsed);
		if (i === 0) {
			console.log("Output length:", out.length, "chars");
		}
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	console.log("Handlebars (Bun)");
	console.log(
		`  Data: ${ITEM_COUNT} items, ${FLAG_COUNT} flags, ${EXTRA_KEYS} extra keys`,
	);
	console.log(`  Median: ${median.toFixed(2)} ms`);
	console.log(`  Avg: ${avg.toFixed(2)} ms`);
}

main();
