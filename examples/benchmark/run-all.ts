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
import { shotput } from "../../src/index";
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

interface Result {
	name: string;
	medianMs: number;
	avgMs: number;
	outputLength: number;
}

async function benchShotput(): Promise<Result> {
	const template = getShotputTemplate();
	const config = {
		template,
		templateDir: join(import.meta.dir, ".."),
		responseDir: join(import.meta.dir, ".."),
		allowedBasePaths: [join(import.meta.dir, "../..")],
		context: benchmarkContext,
		enableContentLengthPlanning: false,
		maxConcurrency: 1,
		debug: false,
	};
	await shotput(config as Parameters<typeof shotput>[0]);

	const times: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const r = await shotput(config as Parameters<typeof shotput>[0]);
		times.push(performance.now() - start);
		if (i === 0) outLen = (r.content ?? "").length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	return {
		name: "Shotput (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
	};
}

function benchEjs(): Result {
	const template = getEjsTemplate();
	Ejs.render(template, { context: benchmarkContext });
	const times: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = Ejs.render(template, { context: benchmarkContext });
		times.push(performance.now() - start);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	return {
		name: "EJS (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
	};
}

function benchHandlebars(): Result {
	const template = Handlebars.compile(getHandlebarsTemplate());
	template({ context: benchmarkContext });
	const times: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = template({ context: benchmarkContext });
		times.push(performance.now() - start);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	return {
		name: "Handlebars (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
	};
}

function benchNunjucks(): Result {
	const templateSrc = getNunjucksTemplate();
	nunjucks.configure({ autoescape: false });
	nunjucks.renderString(templateSrc, { context: benchmarkContext });
	const times: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = nunjucks.renderString(templateSrc, {
			context: benchmarkContext,
		});
		times.push(performance.now() - start);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	return {
		name: "Nunjucks (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
	};
}

function benchMustache(): Result {
	const template = getMustacheTemplate();
	Mustache.render(template, { context: benchmarkContext });
	const times: number[] = [];
	let outLen = 0;
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const out = Mustache.render(template, { context: benchmarkContext });
		times.push(performance.now() - start);
		if (i === 0) outLen = out.length;
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(RUNS / 2)];
	const avg = times.reduce((s, t) => s + t, 0) / RUNS;
	return {
		name: "Mustache (Bun)",
		medianMs: median,
		avgMs: avg,
		outputLength: outLen,
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
			`  ${r.name.padEnd(20)}  median: ${r.medianMs.toFixed(2).padStart(8)} ms  avg: ${r.avgMs.toFixed(2).padStart(8)} ms  output: ${r.outputLength.toLocaleString()} chars  (relative: ${ratio}x)`,
		);
	}
}

main().catch(console.error);
