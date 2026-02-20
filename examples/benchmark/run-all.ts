#!/usr/bin/env bun

/**
 * Run all templating benchmarks (Bun engines) and print a comparison.
 * For Jinja2 (Python), run: uv run examples/benchmark/jinja2_benchmark.py
 */

import { join } from "node:path";
import Ejs from "ejs";
import Handlebars from "handlebars";
import Mustache from "mustache";
import nunjucks from "nunjucks";
import { compileShotputTemplate, shotput } from "../../src/index";
import {
	EXTRA_KEYS,
	FLAG_COUNT,
	ITEM_COUNT,
	benchmarkContext,
	getEjsTemplate,
	getHandlebarsTemplate,
	getMustacheTemplate,
	getNunjucksTemplate,
	getShotputTemplate,
} from "./data";

const RUNS = 5;

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	return `${bytes} B`;
}

interface Result {
	name: string;
	medianMs: number;
	avgMs: number;
	outputLength: number;
	heapMax: number;
	heapAvg: number;
}

async function benchShotput(): Promise<Result> {
	const base = shotput()
		.template(getShotputTemplate())
		.templateDir(join(import.meta.dir, ".."))
		.responseDir(join(import.meta.dir, ".."))
		.allowedBasePaths([join(import.meta.dir, "../..")])
		.context(benchmarkContext)
		.enableContentLengthPlanning(false)
		.maxConcurrency(1)
		.debug(false)
		.build();
	await base.run();

	const times: number[] = [];
	const heapUsed: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const r = await base.run();
		times.push(performance.now() - start);
		heapUsed.push(process.memoryUsage().heapUsed);
		if (i === 0) outLen = (r.content ?? "").length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	const heapMax = Math.max(...heapUsed);
	const heapAvg = heapUsed.reduce((s, h) => s + h, 0) / RUNS;
	return {
		name: "Shotput (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
		heapMax,
		heapAvg,
	};
}

async function benchShotputCompiled(): Promise<Result> {
	const program = compileShotputTemplate(getShotputTemplate(), {
		templateDir: join(import.meta.dir, ".."),
		responseDir: join(import.meta.dir, ".."),
		allowedBasePaths: [join(import.meta.dir, "../..")],
		enableContentLengthPlanning: false,
		maxConcurrency: 1,
		debug: false,
	});
	await program.context(benchmarkContext).run();

	const times: number[] = [];
	const heapUsed: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const r = await program.context(benchmarkContext).run();
		times.push(performance.now() - start);
		heapUsed.push(process.memoryUsage().heapUsed);
		if (i === 0) outLen = (r.content ?? "").length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	const heapMax = Math.max(...heapUsed);
	const heapAvg = heapUsed.reduce((s, h) => s + h, 0) / RUNS;
	return {
		name: "Shotput compiled (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
		heapMax,
		heapAvg,
	};
}

function benchEjs(): Result {
	const template = getEjsTemplate();
	Ejs.render(template, { context: benchmarkContext });
	const times: number[] = [];
	const heapUsed: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = Ejs.render(template, { context: benchmarkContext });
		times.push(performance.now() - start);
		heapUsed.push(process.memoryUsage().heapUsed);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	const heapMax = Math.max(...heapUsed);
	const heapAvg = heapUsed.reduce((s, h) => s + h, 0) / RUNS;
	return {
		name: "EJS (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
		heapMax,
		heapAvg,
	};
}

function benchHandlebars(): Result {
	const template = Handlebars.compile(getHandlebarsTemplate());
	template({ context: benchmarkContext });
	const times: number[] = [];
	const heapUsed: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = template({ context: benchmarkContext });
		times.push(performance.now() - start);
		heapUsed.push(process.memoryUsage().heapUsed);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	const heapMax = Math.max(...heapUsed);
	const heapAvg = heapUsed.reduce((s, h) => s + h, 0) / RUNS;
	return {
		name: "Handlebars (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
		heapMax,
		heapAvg,
	};
}

function benchNunjucks(): Result {
	const templateSrc = getNunjucksTemplate();
	nunjucks.configure({ autoescape: false });
	nunjucks.renderString(templateSrc, { context: benchmarkContext });
	const times: number[] = [];
	const heapUsed: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = nunjucks.renderString(templateSrc, {
			context: benchmarkContext,
		});
		times.push(performance.now() - start);
		heapUsed.push(process.memoryUsage().heapUsed);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	const heapMax = Math.max(...heapUsed);
	const heapAvg = heapUsed.reduce((s, h) => s + h, 0) / RUNS;
	return {
		name: "Nunjucks (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
		heapMax,
		heapAvg,
	};
}

function benchMustache(): Result {
	const template = getMustacheTemplate();
	Mustache.render(template, { context: benchmarkContext });
	const times: number[] = [];
	const heapUsed: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = Mustache.render(template, { context: benchmarkContext });
		times.push(performance.now() - start);
		heapUsed.push(process.memoryUsage().heapUsed);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	const heapMax = Math.max(...heapUsed);
	const heapAvg = heapUsed.reduce((s, h) => s + h, 0) / RUNS;
	return {
		name: "Mustache (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
		heapMax,
		heapAvg,
	};
}

async function main(): Promise<void> {
	console.log("Templating benchmark: large template + context");
	console.log(
		`  ${ITEM_COUNT} items, ${FLAG_COUNT} flags, ${EXTRA_KEYS} extra keys`,
	);
	console.log(`  ${RUNS} runs per engine\n`);

	const results: Result[] = [];

	console.log("Running Shotput...");
	results.push(await benchShotput());

	console.log("Running Shotput (compiled)...");
	results.push(await benchShotputCompiled());

	console.log("Running EJS...");
	results.push(benchEjs());

	console.log("Running Handlebars...");
	results.push(benchHandlebars());

	console.log("Running Nunjucks...");
	results.push(benchNunjucks());

	console.log("Running Mustache...");
	results.push(benchMustache());

	console.log("\n--- Results (median ms) ---\n");
	const byMedian = [...results].sort((a, b) => a.medianMs - b.medianMs);
	const fastest = byMedian[0].medianMs;
	for (const r of byMedian) {
		const ratio = (r.medianMs / fastest).toFixed(2);
		console.log(
			`  ${r.name.padEnd(20)}  median: ${r.medianMs.toFixed(2).padStart(8)} ms  avg: ${r.avgMs.toFixed(2).padStart(8)} ms  heap max: ${formatBytes(r.heapMax).padStart(10)}  heap avg: ${formatBytes(r.heapAvg).padStart(10)}  output: ${r.outputLength.toLocaleString()} chars  (relative: ${ratio}x)`,
		);
	}
}

main().catch(console.error);
