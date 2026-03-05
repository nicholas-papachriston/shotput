#!/usr/bin/env bun

/**
 * Benchmark: Nunjucks (Bun)
 * Same large template + context as other engines; timed.
 */

import nunjucks from "nunjucks";
import {
	EXTRA_KEYS,
	type EngineResult,
	FLAG_COUNT,
	ITEM_COUNT,
	RUNS,
	WARMUP_RUNS,
	benchmarkContext,
	getNunjucksTemplate,
} from "./data";
import { computeStats } from "./stats";

nunjucks.configure({ autoescape: false });
const templateSrc = getNunjucksTemplate();

function runOne(): string {
	return nunjucks.renderString(templateSrc, { context: benchmarkContext });
}

function formatBytes(bytes: number): string {
	const absBytes = Math.abs(bytes);
	const sign = bytes < 0 ? "-" : "";
	if (absBytes >= 1024 * 1024) {
		return `${sign}${(absBytes / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (absBytes >= 1024) return `${sign}${(absBytes / 1024).toFixed(2)} KB`;
	return `${bytes} B`;
}

function runBenchmark(): EngineResult {
	for (let i = 0; i < WARMUP_RUNS; i++) {
		runOne();
	}
	const times: number[] = [];
	const heapDeltas: number[] = [];
	let outputLength = 0;

	for (let i = 0; i < RUNS; i++) {
		Bun.gc(true);
		const heapBefore = process.memoryUsage().heapUsed;
		const start = performance.now();
		const out = runOne();
		const elapsed = performance.now() - start;
		Bun.gc(true);
		const heapAfter = process.memoryUsage().heapUsed;
		times.push(elapsed);
		heapDeltas.push(heapAfter - heapBefore);
		if (i === 0) outputLength = out.length;
	}

	return {
		name: "Nunjucks (Bun)",
		mode: "runtime",
		timesMs: times,
		heapDeltas,
		outputLength,
	};
}

function main(): void {
	const jsonMode = Bun.argv.includes("--json");
	const result = runBenchmark();
	if (jsonMode) {
		console.log(JSON.stringify(result));
		return;
	}

	const timeStats = computeStats(result.timesMs);
	const heapStats = computeStats(result.heapDeltas);

	console.log(result.name);
	console.log(
		`  Data: ${ITEM_COUNT} items, ${FLAG_COUNT} flags, ${EXTRA_KEYS} extra keys`,
	);
	console.log(`  Output length: ${result.outputLength} chars`);
	console.log(`  Runs: ${RUNS} (${WARMUP_RUNS} warmup)`);
	console.log(`  Median: ${timeStats.median.toFixed(2)} ms`);
	console.log(`  Avg: ${timeStats.mean.toFixed(2)} ms`);
	console.log(`  Stddev: ${timeStats.stddev.toFixed(2)} ms`);
	console.log(
		`  95% CI: [${timeStats.ci95[0].toFixed(2)}, ${timeStats.ci95[1].toFixed(2)}] ms`,
	);
	console.log(
		`  Heap delta avg: ${formatBytes(heapStats.mean)}  p95: ${formatBytes(heapStats.p95)}`,
	);
}

main();
