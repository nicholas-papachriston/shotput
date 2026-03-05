import { describe, expect, it } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { shotput } from "../../src";

interface FixtureCase {
	name: string;
	template: string;
	context?: Record<string, unknown>;
}

interface FixtureBundle {
	cases: FixtureCase[];
}

const CONFORMANCE_DIR = join(process.cwd(), "test/conformance");
const FIXTURES_DIR = join(CONFORMANCE_DIR, "fixtures");
const PYTHON_RENDER_SCRIPT = join(CONFORMANCE_DIR, "jinja2_render.py");

async function loadFixtures(): Promise<
	Array<{ id: string; data: FixtureCase }>
> {
	const entries = await readdir(FIXTURES_DIR);
	const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
	const out: Array<{ id: string; data: FixtureCase }> = [];

	for (const file of jsonFiles) {
		const raw = await readFile(join(FIXTURES_DIR, file), "utf8");
		const bundle = JSON.parse(raw) as FixtureBundle;
		const suiteName = file.replace(/\.json$/, "");
		for (const testCase of bundle.cases) {
			out.push({
				id: `${suiteName}:${testCase.name}`,
				data: testCase,
			});
		}
	}

	return out;
}

async function renderWithPythonJinja2(): Promise<Record<string, string>> {
	const proc = Bun.spawn(["uv", "run", PYTHON_RENDER_SCRIPT, "--stdout"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdoutText, stderrText] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(stderrText.trim() || "uv run jinja2 render failed");
	}
	return JSON.parse(stdoutText) as Record<string, string>;
}

describe("jinja2 conformance against CPython Jinja2", () => {
	it("matches CPython output for every fixture", async () => {
		const strictMode = process.env["SHOTPUT_CONFORMANCE_STRICT"] === "1";
		const fixtures = await loadFixtures();
		let expectedById: Record<string, string>;
		try {
			expectedById = await renderWithPythonJinja2();
		} catch (error) {
			if (strictMode) {
				throw error;
			}
			// Non-strict local runs can skip when Python/Jinja2 is unavailable.
			return;
		}

		const mismatches: string[] = [];
		for (const fixture of fixtures) {
			const expectedOutput = expectedById[fixture.id];
			if (expectedOutput === undefined) {
				throw new Error(
					`Missing CPython output for fixture "${fixture.id}" from ${PYTHON_RENDER_SCRIPT}.`,
				);
			}

			const result = await shotput()
				.templateSyntax("jinja2")
				.template(fixture.data.template)
				.context(fixture.data.context ?? {})
				.run();

			if (result.error !== undefined) {
				mismatches.push(
					`${fixture.id}: shotput error: ${result.error.message ?? String(result.error)}`,
				);
				continue;
			}

			if (result.content !== expectedOutput) {
				mismatches.push(
					`${fixture.id}: expected ${JSON.stringify(expectedOutput)} received ${JSON.stringify(result.content ?? "")}`,
				);
			}
		}

		if (mismatches.length > 0) {
			throw new Error(
				[
					`CPython conformance failed for ${mismatches.length} fixture(s):`,
					...mismatches.map((line) => `- ${line}`),
				].join("\n"),
			);
		}
	});
});
