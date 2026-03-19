import { getLogger } from "./logger";
import type { SourcePlugin } from "./sources/plugins";

const log = getLogger("shell");

export const SHELL_PREFIX = "shell:";
const DEFAULT_SHELL_TIMEOUT_MS = 10_000;

export function parseShellInvocation(rawPath: string): string {
	if (!rawPath.startsWith(SHELL_PREFIX)) {
		throw new Error(`Invalid shell path: ${rawPath}`);
	}
	const script = rawPath.slice(SHELL_PREFIX.length).trim();
	if (!script) {
		throw new Error("Shell invocation is missing a script");
	}
	return script;
}

async function readProcessOutput(
	process: Bun.Subprocess<"ignore", "pipe", "pipe">,
): Promise<{ stdout: string; stderr: string }> {
	const [stdout, stderr] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	return { stdout, stderr };
}

async function runShell(
	script: string,
	timeoutMs: number,
): Promise<{ stdout: string; exitCode: number | null; stderr: string }> {
	const process = Bun.spawn(["sh", "-lc", script], {
		stdout: "pipe",
		stderr: "pipe",
	});

	let timedOut = false;
	const timeoutId = setTimeout(() => {
		timedOut = true;
		process.kill();
	}, timeoutMs);

	try {
		const [exitCode, { stdout, stderr }] = await Promise.all([
			process.exited,
			readProcessOutput(process),
		]);
		return { stdout, exitCode, stderr };
	} finally {
		clearTimeout(timeoutId);
		if (timedOut) {
			log.warn(`Shell command timed out after ${timeoutMs}ms`);
		}
	}
}

export const createShellPlugin = (): SourcePlugin => ({
	name: "shell",
	canContainTemplates: true,
	matches: (rawPath: string) => rawPath.startsWith(SHELL_PREFIX),

	async resolve(ctx) {
		const { rawPath, config, remainingLength } = ctx;
		if (!config.allowShell) {
			throw new Error(
				"Shell execution is disabled. Enable it with allowShell(true).",
			);
		}

		const script = parseShellInvocation(rawPath);
		const timeoutMs = config.shellTimeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;
		const { stdout, exitCode, stderr } = await runShell(script, timeoutMs);

		if (exitCode !== 0) {
			const reason = stderr.trim() || `exit code ${exitCode ?? "unknown"}`;
			throw new Error(`Shell command failed: ${reason}`);
		}

		const content = stdout.trimEnd();
		const usedLength = Math.min(content.length, remainingLength);
		log.info(`Resolved shell template (${content.length} chars)`);

		return {
			content,
			remainingLength: remainingLength - usedLength,
		};
	},
});
