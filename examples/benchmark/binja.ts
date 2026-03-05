#!/usr/bin/env bun

/**
 * Benchmark: Binja (Bun)
 * Same large template + context as other engines; timed.
 * Tests both runtime render() and AOT compile() modes.
 */

import { Environment, compile } from "binja";
import {
	EXTRA_KEYS,
	FLAG_COUNT,
	ITEM_COUNT,
	RUNS,
	WARMUP_RUNS,
	benchmarkContext,
	type EngineResult,
	getBinjaTemplate,
} from "./data";
import { computeStats } from "./stats";

const templateSrc = getBinjaTemplate();
const env = new Environment({ autoescape: false });

function formatBytes(bytes: number): string {
	const absBytes = Math.abs(bytes);
	const sign = bytes < 0 ? "-" : "";
	if (absBytes >= 1024 * 1024) {
		return `${sign}${(absBytes / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (absBytes >= 1024) return `${sign}${(absBytes / 1024).toFixed(2)} KB`;
	return `${bytes} B`;
}

async function runRuntime(): Promise<string> {
	return await env.renderString(templateSrc, { context: benchmarkContext });
}

function runCompiled(fn: (ctx: { context: typeof benchmarkContext }) => string): string {
	return fn({ context: benchmarkContext });
}

async function runRuntimeBenchmark(): Promise<EngineResult> {
	for (let i = 0; i < WARMUP_RUNS; i++) {
		await runRuntime();
	}

	const runtimeTimes: number[] = [];
	const runtimeHeapDeltas: number[] = [];
	let outputLength = 0;

	for (let i = 0; i < RUNS; i++) {
		Bun.gc(true);
		const heapBefore = process.memoryUsage().heapUsed;
		const start = performance.now();
		const out = await runRuntime();
		Bun.gc(true);
		const heapAfter = process.memoryUsage().heapUsed;
		runtimeTimes.push(performance.now() - start);
		runtimeHeapDeltas.push(heapAfter - heapBefore);
		if (i === 0) outputLength = out.length;
	}

	return {
		name: "Binja (Bun)",
		mode: "runtime",
		timesMs: runtimeTimes,
		heapDeltas: runtimeHeapDeltas,
		outputLength,
	};
}

function runCompiledBenchmark(): EngineResult {
	const compiled = compile(templateSrc);
	for (let i = 0; i < WARMUP_RUNS; i++) {
		runCompiled(compiled);
	}

	const compiledTimes: number[] = [];
	const compiledHeapDeltas: number[] = [];
	let outputLength = 0;

	for (let i = 0; i < RUNS; i++) {
		Bun.gc(true);
		const heapBefore = process.memoryUsage().heapUsed;
		const start = performance.now();
		const out = runCompiled(compiled);
		Bun.gc(true);
		const heapAfter = process.memoryUsage().heapUsed;
		compiledTimes.push(performance.now() - start);
		compiledHeapDeltas.push(heapAfter - heapBefore);
		if (i === 0) outputLength = out.length;
	}

	return {
		name: "Binja AOT (Bun)",
		mode: "precompiled",
		timesMs: compiledTimes,
		heapDeltas: compiledHeapDeltas,
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

async function main(): Promise<void> {
	const runtime = await runRuntimeBenchmark();
	const compiled = runCompiledBenchmark();
	const results = [runtime, compiled];
	const jsonMode = Bun.argv.includes("--json");

	if (jsonMode) {
		console.log(JSON.stringify(results));
		return;
	}

	printResult(runtime);
	console.log();
	printResult(compiled);
}

main().catch(console.error);
