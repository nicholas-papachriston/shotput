import type { ShotputConfig } from "./config";

export interface SourceContext {
	rawPath: string;
	resolvedPath: string;
	config: ShotputConfig;
	remainingLength: number;
	match: string;
	basePath: string;
}

export interface SourceResolution {
	content: string;
	remainingLength: number;
	metadata?: Record<string, unknown>;
	/** Merged into config.context for recursive interpolation (e.g. command params) */
	mergeContext?: Record<string, unknown>;
}

export interface SourcePlugin {
	readonly name: string;
	matches(rawPath: string): boolean;
	resolve(ctx: SourceContext): Promise<SourceResolution>;
	estimateLength?(rawPath: string, config: ShotputConfig): Promise<number>;
	readonly canContainTemplates: boolean;
}

/**
 * Find the first custom source plugin that matches the given raw path.
 */
export const getMatchingPlugin = (
	config: ShotputConfig,
	rawPath: string,
): SourcePlugin | undefined => {
	const sources = config.customSources;
	if (!sources?.length) return undefined;
	for (const plugin of sources) {
		if (plugin.matches(rawPath)) return plugin;
	}
	return undefined;
};
