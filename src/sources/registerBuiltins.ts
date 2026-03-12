import { createCommandPlugin } from "../command";
import type { ShotputConfig } from "../config";
import { createDbPlugin } from "../db";
import type { SourcePlugin } from "./plugins";
import { createSubagentPlugin } from "./subagent";

/**
 * Builds the built-in source plugin list from first-class config options.
 * Keeps plugin registration separate from runtime orchestration.
 */
export function registerBuiltins(config: ShotputConfig): SourcePlugin[] {
	const customPlugins: SourcePlugin[] = [...(config.customSources ?? [])];

	if (config.commandsDir) {
		customPlugins.unshift(createCommandPlugin());
	}
	if (config.subagentsDir) {
		customPlugins.unshift(createSubagentPlugin());
	}
	if (config.redis !== undefined || config.sqlite) {
		const redisOptions =
			config.redis === undefined
				? undefined
				: typeof config.redis === "string"
					? { redisUrl: config.redis }
					: config.redis;
		customPlugins.unshift(createDbPlugin(redisOptions));
	}

	return customPlugins;
}
