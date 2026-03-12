import { join, resolve, sep } from "node:path";
import type { ShotputConfig } from "../../config";
import { getLogger } from "../../logger";
import type { SourceContext, SourcePlugin, SourceResolution } from "../plugins";

const log = getLogger("playbook-plugin");

export interface PlaybookPluginOptions {
	/** Directory where playbooks are stored. Defaults to process.cwd() / "playbooks" */
	dir?: string;
}

/**
 * Creates a SourcePlugin that resolves {{playbook://<id>}} placeholders.
 * Playbooks are evolving memory files (Agentic Context Engineering).
 * If the playbook does not exist, it returns an empty string.
 */
export function createPlaybookPlugin(
	options?: PlaybookPluginOptions,
): SourcePlugin {
	const dir = options?.dir ?? join(process.cwd(), "playbooks");
	const resolvedDir = `${resolve(dir)}${sep}`;

	return {
		name: "playbook",
		canContainTemplates: true,
		matches: (rawPath: string) => rawPath.startsWith("playbook://"),
		async resolve(ctx: SourceContext): Promise<SourceResolution> {
			const id = ctx.rawPath.slice("playbook://".length).trim();
			if (!id) {
				throw new Error("Invalid playbook URL: missing ID");
			}

			const ext = id.includes(".") ? "" : ".md";
			const filePath = resolve(dir, `${id}${ext}`);
			if (!filePath.startsWith(resolvedDir)) {
				throw new Error(`Path traversal detected: ${filePath}`);
			}

			let content = "";
			try {
				const file = Bun.file(filePath);
				if (await file.exists()) {
					content = await file.text();
				} else {
					log.info(`Playbook not found: ${filePath}, returning empty context.`);
				}
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				if (code === "ENOENT") {
					log.info(`Playbook not found: ${filePath}, returning empty context.`);
				} else {
					log.error(`Error reading playbook ${filePath}: ${err}`);
					throw err;
				}
			}

			const usedLength = Math.min(content.length, ctx.remainingLength);
			if (content.length > ctx.remainingLength) {
				content = content.slice(0, ctx.remainingLength);
			}

			return {
				content,
				remainingLength: ctx.remainingLength - usedLength,
			};
		},

		estimateLength: async (
			rawPath: string,
			_config: ShotputConfig,
		): Promise<number> => {
			const id = rawPath.slice("playbook://".length).trim();
			if (!id) return 0;
			const ext = id.includes(".") ? "" : ".md";
			const filePath = resolve(dir, `${id}${ext}`);
			if (!filePath.startsWith(resolvedDir)) {
				throw new Error(`Path traversal detected: ${filePath}`);
			}
			try {
				const file = Bun.file(filePath);
				if (await file.exists()) {
					return file.size;
				}
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				if (code !== "ENOENT") {
					throw err;
				}
			}
			return 0;
		},
	};
}
