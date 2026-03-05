#!/usr/bin/env bun

/**
 * Run all templating benchmarks in isolated subprocesses and print
 * grouped comparisons for runtime vs pre-compiled modes.
 */

import {
	EXTRA_KEYS,
	FLAG_COUNT,
	ITEM_COUNT,
	RUNS,
	WARMUP_RUNS,
	type BenchmarkMode,
	type EngineResult,
} from "./data";
import { computeStats } from "./stats";

function formatBytes(bytes: number): string {
	const absBytes = Math.abs(bytes);
	const sign = bytes < 0 ? "-" : "";
	if (absBytes >= 1024 * 1024) {
		return `${sign}${(absBytes / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (absBytes >= 1024) return `${sign}${(absBytes / 1024).toFixed(2)} KB`;
	return `${bytes.toFixed(0)} B`;
}

interface BenchCommand {
	name: string;
	command: string[];
}

interface AggregatedResult extends EngineResult {
	medianMs: number;
	avgMs: number;
	stddevMs: number;
	ci95: [number, number];
	p95Ms: number;
	heapAvgDelta: number;
	heapP95Delta: number;
}

const commands: BenchCommand[] = [
	{
		name: "Shotput",
		command: ["bun", "run", "examples/benchmark/shotput.ts", "--json"],
	},
	{ name: "EJS", command: ["bun", "run", "examples/benchmark/ejs.ts", "--json"] },
	{
		name: "Handlebars",
		command: ["bun", "run", "examples/benchmark/handlebars.ts", "--json"],
	},
	{
		name: "Nunjucks",
		command: ["bun", "run", "examples/benchmark/nunjucks.ts", "--json"],
	},
	{
		name: "Mustache",
		command: ["bun", "run", "examples/benchmark/mustache.ts", "--json"],
	},
	{
		name: "Binja",
		command: ["bun", "run", "examples/benchmark/binja.ts", "--json"],
	},
	{
		name: "Jinja2",
		command: [
			"uv",
			"run",
			"--with",
			"jinja2",
			"examples/benchmark/jinja2_benchmark.py",
			"--json",
		],
	},
];

function parseJsonPayload(rawOutput: string): unknown {
	const trimmed = rawOutput.trim();
	if (trimmed.length === 0) {
		throw new Error("No JSON output was produced");
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		const lines = trimmed.split("\n").filter((line) => line.trim().length > 0);
		const maybeJson = lines.at(-1) ?? "";
		return JSON.parse(maybeJson);
	}
}

function isEngineResult(value: unknown): value is EngineResult {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.name === "string" &&
		(candidate.mode === "runtime" || candidate.mode === "precompiled") &&
		Array.isArray(candidate.timesMs) &&
		Array.isArray(candidate.heapDeltas) &&
		typeof candidate.outputLength === "number"
	);
}

function normalizeResults(payload: unknown): EngineResult[] {
	if (Array.isArray(payload)) {
		const results = payload.filter(isEngineResult);
		if (results.length === payload.length) return results;
		throw new Error("JSON payload array contains invalid result entries");
	}
	if (isEngineResult(payload)) return [payload];
	throw new Error("JSON payload is not an EngineResult or EngineResult[]");
}

async function runCommand(command: BenchCommand): Promise<EngineResult[]> {
	const processHandle = Bun.spawn(command.command, {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdoutText, stderrText] = await Promise.all([
		processHandle.exited,
		new Response(processHandle.stdout).text(),
		new Response(processHandle.stderr).text(),
	]);

	if (exitCode !== 0) {
		throw new Error(
			`${command.name} failed with exit ${exitCode}.\n${stderrText || stdoutText}`,
		);
	}
	const parsed = parseJsonPayload(stdoutText);
	return normalizeResults(parsed);
}

function aggregate(result: EngineResult): AggregatedResult {
	const timeStats = computeStats(result.timesMs);
	const heapStats = computeStats(result.heapDeltas);
	return {
		...result,
		medianMs: timeStats.median,
		avgMs: timeStats.mean,
		stddevMs: timeStats.stddev,
		ci95: timeStats.ci95,
		p95Ms: timeStats.p95,
		heapAvgDelta: heapStats.mean,
		heapP95Delta: heapStats.p95,
	};
}

function printGroup(mode: BenchmarkMode, results: AggregatedResult[]): void {
	const modeLabel =
		mode === "runtime"
			? "Runtime (parse + render per call)"
			: "Pre-compiled (render only)";
	console.log(`\n--- ${modeLabel} ---\n`);
	if (results.length === 0) {
		console.log("  No results.\n");
		return;
	}

	const byMedian = [...results].sort((a, b) => a.medianMs - b.medianMs);
	const fastest = byMedian[0].medianMs;
	for (const result of byMedian) {
		const relative = (result.medianMs / fastest).toFixed(2);
		console.log(
			`  ${result.name.padEnd(23)} median: ${result.medianMs.toFixed(2).padStart(8)} ms  avg: ${result.avgMs.toFixed(2).padStart(8)} ms  stddev: ${result.stddevMs.toFixed(2).padStart(7)} ms  95% CI: [${result.ci95[0].toFixed(2).padStart(8)}, ${result.ci95[1].toFixed(2).padStart(8)}] ms  p95: ${result.p95Ms.toFixed(2).padStart(8)} ms  heap Δ avg: ${formatBytes(result.heapAvgDelta).padStart(10)}  heap Δ p95: ${formatBytes(result.heapP95Delta).padStart(10)}  output: ${result.outputLength.toLocaleString()} chars  (relative: ${relative}x)`,
		);
	}
}

async function main(): Promise<void> {
	console.log("Templating benchmark: isolated subprocess runs");
	console.log(
		`  ${ITEM_COUNT} items, ${FLAG_COUNT} flags, ${EXTRA_KEYS} extra keys`,
	);
	console.log(`  ${RUNS} measured runs per engine (${WARMUP_RUNS} warmup)\n`);

	const allResults: AggregatedResult[] = [];
	for (const command of commands) {
		console.log(`Running ${command.name}...`);
		const isolatedResults = await runCommand(command);
		for (const result of isolatedResults) {
			allResults.push(aggregate(result));
		}
	}

	const runtimeResults = allResults.filter((result) => result.mode === "runtime");
	const precompiledResults = allResults.filter(
		(result) => result.mode === "precompiled",
	);

	printGroup("runtime", runtimeResults);
	printGroup("precompiled", precompiledResults);
}

main().catch(console.error);
