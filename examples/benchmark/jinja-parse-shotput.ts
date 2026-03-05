#!/usr/bin/env bun

/**
 * Benchmark: Shotput native Jinja parser/compile path (Bun)
 * Measures parse+compile cost (no render) by compiling salted templates.
 */

import { compileShotputTemplate } from "../../src/index";
import {
	EXTRA_KEYS,
	type EngineResult,
	FLAG_COUNT,
	ITEM_COUNT,
	getJinja2TemplateWithCounts,
} from "./data";
import { computeStats } from "./stats";

const PARSE_FLAG_COUNT = 1_500;
const PARSE_EXTRA_KEYS = 250;
const PARSE_RUNS = 8;
const PARSE_WARMUP_RUNS = 2;
const template = getJinja2TemplateWithCounts(
	PARSE_FLAG_COUNT,
	PARSE_EXTRA_KEYS,
);

function formatBytes(bytes: number): string {
	const absBytes = Math.abs(bytes);
	const sign = bytes < 0 ? "-" : "";
	if (absBytes >= 1024 * 1024) {
		return `${sign}${(absBytes / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (absBytes >= 1024) return `${sign}${(absBytes / 1024).toFixed(2)} KB`;
	return `${bytes} B`;
}

function saltedTemplate(run: number): string {
	return `${template}\n{# shotput-parse-${run} #}`;
}

function runParse(run: number): number {
	const src = saltedTemplate(run);
	const start = performance.now();
	compileShotputTemplate(src, {
		templateSyntax: "jinja2",
		debug: false,
		enableContentLengthPlanning: false,
	});
	return performance.now() - start;
}

function runParseBenchmark(): EngineResult {
	for (let i = 0; i < PARSE_WARMUP_RUNS; i++) {
		runParse(i);
	}

	const timesMs: number[] = [];
	const heapDeltas: number[] = [];
	const outputLength = template.length;

	for (let i = 0; i < PARSE_RUNS; i++) {
		Bun.gc(true);
		const heapBefore = process.memoryUsage().heapUsed;
		const elapsed = runParse(i + PARSE_WARMUP_RUNS);
		Bun.gc(true);
		const heapAfter = process.memoryUsage().heapUsed;
		timesMs.push(elapsed);
		heapDeltas.push(heapAfter - heapBefore);
	}

	return {
		name: "Shotput Jinja parse (Bun)",
		mode: "parse",
		timesMs,
		heapDeltas,
		outputLength,
	};
}

function printResult(result: EngineResult): void {
	const timeStats = computeStats(result.timesMs);
	const heapStats = computeStats(result.heapDeltas);
	console.log(result.name);
	console.log(
		`  Data: ${ITEM_COUNT} items, ${FLAG_COUNT} flags, ${EXTRA_KEYS} extra keys`,
	);
	console.log(
		`  Parse template shape: ${PARSE_FLAG_COUNT} flags, ${PARSE_EXTRA_KEYS} extra keys`,
	);
	console.log(`  Template length: ${result.outputLength} chars`);
	console.log(`  Runs: ${PARSE_RUNS} (${PARSE_WARMUP_RUNS} warmup)`);
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

function main(): void {
	const jsonMode = Bun.argv.includes("--json");
	const result = runParseBenchmark();
	if (jsonMode) {
		console.log(JSON.stringify(result));
		return;
	}
	printResult(result);
}

main();
