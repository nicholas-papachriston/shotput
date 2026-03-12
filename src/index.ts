import { ShotputBuilder, ShotputProgram } from "./builder";
import type { ShotputConfig } from "./config";
import { createConfig } from "./config";
import { getCompiledJinjaRenderer } from "./language/jinja";
import { compileLoopBody, parseAllBlocks } from "./language/shotput";
import type { ConfigWithCompiled } from "./runtime/engine";

export * from "./api";

/**
 * Pre-compile a template for repeated renders. Warms the block parse cache and returns
 * a ShotputProgram. Use when rendering the same template many times with varying context.
 *
 * @param template - Template string
 * @param baseConfig - Base configuration (templateDir, allowedBasePaths, context, etc.)
 * @returns ShotputProgram; use .with({ context }) and .run() or .stream() to execute
 *
 * @example
 * ```ts
 * const program = compileShotputTemplate(template, { templateDir, allowedBasePaths });
 * const out1 = await program.with({ context: { items: [...] } }).run();
 * const out2 = await program.with({ context: { items: [...] } }).run();
 * ```
 */
export function compileShotputTemplate(
	template: string,
	baseConfig?: Partial<ShotputConfig>,
): ShotputProgram {
	const merged = createConfig(baseConfig);
	if (merged.templateSyntax === "jinja2") {
		const compiledJinja = getCompiledJinjaRenderer(template);
		return new ShotputProgram({
			...baseConfig,
			template,
			_compiledJinjaRenderer: compiledJinja,
		} as Partial<ConfigWithCompiled>);
	}
	parseAllBlocks(template);
	const engine = (merged.expressionEngine ?? "js") as "js" | "safe";
	const compiledRoot = compileLoopBody(template, { engine });
	return new ShotputProgram({
		...baseConfig,
		template,
		_compiledRootSegments: compiledRoot,
	} as Partial<ConfigWithCompiled>);
}

/**
 * Create a Shotput builder. Chain config setters to configure, then call .run() for full output,
 * .stream() or .streamSegments() for streaming, or .build() to get an immutable ShotputProgram.
 *
 * @returns ShotputBuilder
 *
 * @example
 * ```ts
 * const out = await shotput()
 *   .templateDir("./t")
 *   .templateFile("a.md")
 *   .context({ user: "n" })
 *   .run();
 *
 * const base = shotput().templateDir("./t").build();
 * const out2 = await base.templateFile("b.md").context({ user: "n" }).run();
 * ```
 */
export function shotput(): ShotputBuilder {
	return new ShotputBuilder();
}

export * from "./sources";
export * from "./support";

if (require.main === module) {
	shotput().run().catch(console.error);
}
