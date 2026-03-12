import { join, resolve, sep } from "node:path";
import { getLogger } from "../../logger";
import type { PlaybookPluginOptions } from "./plugin";

const log = getLogger("playbook-plugin");

/**
 * Utility to write or update an evolving playbook.
 * Allows agents to actively manage their context between turns.
 */
export async function updatePlaybook(
	id: string,
	content: string,
	options?: PlaybookPluginOptions,
): Promise<void> {
	const dir = options?.dir ?? join(process.cwd(), "playbooks");
	const resolvedDir = `${resolve(dir)}${sep}`;
	const ext = id.includes(".") ? "" : ".md";
	const filePath = resolve(dir, `${id}${ext}`);

	if (!filePath.startsWith(resolvedDir)) {
		throw new Error(`Path traversal detected: ${filePath}`);
	}

	await Bun.write(filePath, content);
	log.info(`Updated playbook: ${id}`);
}
