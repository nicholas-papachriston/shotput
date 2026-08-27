import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type StopInput = {
	readonly status?: string;
	readonly loop_count?: number;
};

const JS_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/;

function emit(payload: Readonly<Record<string, string>>): void {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function readStopInput(text: string): StopInput {
	return JSON.parse(text || "{}") as StopInput;
}

function shouldSkip(input: StopInput): boolean {
	if (input.status !== undefined && input.status !== "completed") {
		return true;
	}
	return (input.loop_count ?? 0) >= 2;
}

function hasLintScript(repoRoot: string): boolean {
	const manifestPath = join(repoRoot, "package.json");
	if (!existsSync(manifestPath)) {
		return false;
	}
	const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
		readonly scripts?: Readonly<Record<string, string>>;
	};
	return typeof parsed.scripts?.lint === "string";
}

function porcelainPaths(repoRoot: string): string[] {
	const result = Bun.spawnSync(["git", "status", "--porcelain", "-u"], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const paths: string[] = [];
	for (const line of result.stdout.toString().split("\n")) {
		if (line.length < 4) {
			continue;
		}
		const rel = line.slice(3).trim().replace(/\/$/, "");
		if (rel.length > 0) {
			paths.push(rel);
		}
	}
	return paths;
}

function hasChangedJs(repoRoot: string): boolean {
	return porcelainPaths(repoRoot).some((rel) => JS_EXT.test(rel));
}

function runLint(repoRoot: string): {
	readonly ok: boolean;
	readonly output: string;
} {
	const result = Bun.spawnSync(["bun", "run", "lint"], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	return {
		ok: result.exitCode === 0,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

const repoRoot = resolve(join(import.meta.dir, "../.."));

try {
	const input = readStopInput(await Bun.stdin.text());
	if (shouldSkip(input) || !hasLintScript(repoRoot) || !hasChangedJs(repoRoot)) {
		emit({});
		process.exit(0);
	}

	const lint = runLint(repoRoot);
	if (!lint.ok) {
		process.stderr.write(lint.output);
		emit({
			followup_message: `oxfmt/oxlint failed. Fix the remaining issues and run bun run lint.\n\n${lint.output.trim().slice(0, 4000)}`,
		});
		process.exit(0);
	}

	if (hasChangedJs(repoRoot) && (input.loop_count ?? 0) === 0) {
		emit({
			followup_message:
				"oxfmt/oxlint wrote files. Include those written files in this work, then continue.",
		});
		process.exit(0);
	}

	emit({});
} catch (error) {
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	);
	emit({});
}
process.exit(0);
