#!/usr/bin/env bun

/**
 * Example 17: Playbooks (Evolving Memory)
 *
 * Agentic Context Engineering (ACE) relies on context that evolves over time.
 * The `playbook://` source plugin allows an agent to read structured evolving
 * playbooks, and the `updatePlaybook` utility allows writing learnings back.
 *
 * Usage:
 *   bun run examples/advanced/17-playbooks.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createPlaybookPlugin, shotput, updatePlaybook } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("17-playbooks");
const playbooksDir = join(import.meta.dir, "../output/17-playbooks/data");

try {
	mkdirSync(playbooksDir, { recursive: true });

	// 1. Initial State (Playbook might not exist yet)
	log.info("1. Reading playbook before creation...");

	const playbookPlugin = createPlaybookPlugin({ dir: playbooksDir });

	const base = shotput()
		.customSources([playbookPlugin])
		.template("Playbook context:\n{{playbook://agent-memory}}\nEnd context.")
		.build();

	let result = await base.run();
	log.info(`Result:\n${result.content}\n`);

	// 2. The agent learns something and updates the playbook
	log.info("2. Updating playbook (Agentic Context Engineering)...");
	await updatePlaybook(
		"agent-memory",
		"- Learned that users prefer concise answers.\n- Always use Markdown formatting.",
		{ dir: playbooksDir },
	);

	// 3. Reading the playbook again
	log.info("3. Reading playbook after update...");
	result = await base.run();
	log.info(`Result:\n${result.content}\n`);
} catch (error) {
	log.error(error);
}
