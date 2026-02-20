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

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	return `${bytes} B`;
}

const baseProgram = shotput()
	.template(template)
	.templateDir(join(import.meta.dir, ".."))
	.responseDir(join(import.meta.dir, ".."))
	.allowedBasePaths([join(import.meta.dir, "../..")])
	.context(benchmarkContext)
	.enableContentLengthPlanning(false)
	.debug(false)
	.build();

function runOne(): Promise<string> {
	return baseProgram.run().then((r) => r.content ?? "");
}

async function main(): Promise<void> {
	// Warmup
	await runOne();

	const times: number[] = [];
	const heapUsed: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = await runOne();
		const elapsed = performance.now() - start;
		times.push(elapsed);
		heapUsed.push(process.memoryUsage().heapUsed);
		if (i === 0) {
			console.log("Output length:", out.length, "chars");
		}
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	const heapMax = Math.max(...heapUsed);
	const heapAvg = heapUsed.reduce((s, h) => s + h, 0) / RUNS;
	console.log("Shotput (Bun)");
	console.log(
		`  Data: ${ITEM_COUNT} items, ${FLAG_COUNT} flags, ${EXTRA_KEYS} extra keys`,
	);
	console.log(`  Median: ${median.toFixed(2)} ms`);
	console.log(`  Avg: ${avg.toFixed(2)} ms`);
	console.log(`  Heap max: ${formatBytes(heapMax)}`);
	console.log(`  Heap avg: ${formatBytes(heapAvg)}`);
}

main().catch(console.error);
