import type { ShotputConfig } from "./config";

/**
 * Context passed to SourcePlugin.resolve(). Contains the raw placeholder path,
 * resolved path, config, and budget info.
 */
export interface SourceContext {
	/** Raw placeholder path from template (e.g. "custom://my-id") */
	rawPath: string;
	/** Resolved path after variable substitution */
	resolvedPath: string;
	/** Shotput config at resolve time */
	config: ShotputConfig;
	/** Remaining character (or token) budget */
	remainingLength: number;
	/** Original match string including {{ }} */
	match: string;
	/** Base path for resolving relative paths */
	basePath: string;
}

/**
 * Result from SourcePlugin.resolve(). Return content and optionally
 * mergeContext for recursive interpolation (e.g. command params).
 */
export interface SourceResolution {
	/** Resolved content to insert in place of the placeholder */
	content: string;
	/** Remaining budget after this resolution */
	remainingLength: number;
	/** Optional metadata for resultMetadata */
	metadata?: Record<string, unknown>;
	/** Merged into config.context for recursive interpolation (e.g. command params) */
	mergeContext?: Record<string, unknown>;
}

/**
 * Custom source plugin for extensible template placeholders.
 * Register via config.customSources. Plugins are checked before built-in sources.
 *
 * @example
 * ```ts
 * const myPlugin: SourcePlugin = {
 *   name: "my-source",
 *   matches: (raw) => raw.startsWith("my://"),
 *   async resolve(ctx) {
 *     const content = await fetchFromMyApi(ctx.resolvedPath);
 *     return { content, remainingLength: ctx.remainingLength - content.length };
 *   },
 *   canContainTemplates: false,
 * };
 * await shotput({ customSources: [myPlugin], template: "{{my://item/1}}" });
 * ```
 */
export interface SourcePlugin {
	/** Plugin name for debugging */
	readonly name: string;
	/** Return true if this plugin handles the raw path */
	matches(rawPath: string): boolean;
	/** Resolve the placeholder and return content */
	resolve(ctx: SourceContext): Promise<SourceResolution>;
	/** Optional: estimate content length for planning (chars or tokens when tokenizer set) */
	estimateLength?(rawPath: string, config: ShotputConfig): Promise<number>;
	/** If true, returned content is parsed for nested {{placeholders}} */
	readonly canContainTemplates: boolean;
}

/**
 * Find the first custom source plugin that matches the given raw path.
 *
 * @param config - Shotput config with customSources
 * @param rawPath - Raw placeholder path from template
 * @returns Matching plugin or undefined
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
