#!/usr/bin/env bun

/**
 * Benchmark: Shotput (Bun)
 * Same large template + context as other engines; timed.
 */

import { join } from "node:path";
import { compileShotputTemplate, shotput } from "../../src/index";
import {
	EXTRA_KEYS,
	type EngineResult,
	FLAG_COUNT,
	ITEM_COUNT,
	RUNS,
	WARMUP_RUNS,
	benchmarkContext,
	getShotputTemplate,
} from "./data";
import { computeStats } from "./stats";

const template = getShotputTemplate();

function formatBytes(bytes: number): string {
	const absBytes = Math.abs(bytes);
	const sign = bytes < 0 ? "-" : "";
	if (absBytes >= 1024 * 1024) {
		return `${sign}${(absBytes / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (absBytes >= 1024) return `${sign}${(absBytes / 1024).toFixed(2)} KB`;
	return `${bytes} B`;
}

const runtimeProgram = shotput()
	.template(template)
	.templateDir(join(import.meta.dir, ".."))
	.responseDir(join(import.meta.dir, ".."))
	.allowedBasePaths([join(import.meta.dir, "../..")])
	.context(benchmarkContext)
	.enableContentLengthPlanning(false)
	.debug(false)
	.build();

const compiledProgram = compileShotputTemplate(template, {
	templateDir: join(import.meta.dir, ".."),
	responseDir: join(import.meta.dir, ".."),
	allowedBasePaths: [join(import.meta.dir, "../..")],
	enableContentLengthPlanning: false,
	maxConcurrency: 1,
	debug: false,
});

function runRuntime(): Promise<string> {
	return runtimeProgram.run().then((r) => r.content ?? "");
}

function runCompiled(): Promise<string> {
	return compiledProgram
		.context(benchmarkContext)
		.run()
		.then((r) => r.content ?? "");
}

async function runRuntimeBenchmark(): Promise<EngineResult> {
	for (let i = 0; i < WARMUP_RUNS; i++) {
		await runRuntime();
	}
	const times: number[] = [];
	const heapDeltas: number[] = [];
	let outputLength = 0;

	for (let i = 0; i < RUNS; i++) {
		Bun.gc(true);
		const heapBefore = process.memoryUsage().heapUsed;
		const start = performance.now();
		const out = await runRuntime();
		const elapsed = performance.now() - start;
		Bun.gc(true);
		const heapAfter = process.memoryUsage().heapUsed;
		times.push(elapsed);
		heapDeltas.push(heapAfter - heapBefore);
		if (i === 0) outputLength = out.length;
	}

	return {
		name: "Shotput (Bun)",
		mode: "runtime",
		timesMs: times,
		heapDeltas,
		outputLength,
	};
}

async function runCompiledBenchmark(): Promise<EngineResult> {
	for (let i = 0; i < WARMUP_RUNS; i++) {
		await runCompiled();
	}
	const times: number[] = [];
	const heapDeltas: number[] = [];
	let outputLength = 0;

	for (let i = 0; i < RUNS; i++) {
		Bun.gc(true);
		const heapBefore = process.memoryUsage().heapUsed;
		const start = performance.now();
		const out = await runCompiled();
		const elapsed = performance.now() - start;
		Bun.gc(true);
		const heapAfter = process.memoryUsage().heapUsed;
		times.push(elapsed);
		heapDeltas.push(heapAfter - heapBefore);
		if (i === 0) outputLength = out.length;
	}

	return {
		name: "Shotput compiled (Bun)",
		mode: "precompiled",
		timesMs: times,
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
	const jsonMode = Bun.argv.includes("--json");
	const runtime = await runRuntimeBenchmark();
	const compiled = await runCompiledBenchmark();
	const results = [runtime, compiled];

	if (jsonMode) {
		console.log(JSON.stringify(results));
		return;
	}

	printResult(runtime);
	console.log();
	printResult(compiled);
}

main().catch(console.error);
