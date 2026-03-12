import type { ShotputConfig } from "../config";
import type { DbPluginOptions } from "../db/options";
import type { HookSet } from "../hooks";
import type { ConfigWithCompiled } from "../runtime/engine";
import type { SourcePlugin } from "../sources/plugins";
import type { OutputMode } from "../types";

export type ShotputOverrides = Partial<ShotputConfig> &
	Partial<ConfigWithCompiled>;

export function mergeOverrides(
	base: ShotputOverrides | undefined,
	overrides: ShotputOverrides | undefined,
): ShotputOverrides {
	if (base == null && overrides == null) return {};
	if (base == null) return overrides ?? {};
	if (overrides == null) return base;
	return { ...base, ...overrides };
}

/**
 * Shared chainable config setters for ShotputBuilder and ShotputProgram.
 * Subclasses implement _merge() which creates a new instance with merged overrides.
 */
export abstract class ShotputBase<T> {
	protected abstract _merge(overrides: ShotputOverrides): T;

	// --- Template ---

	/**
	 * Inline template string. Takes precedence over `templateFile` when both are set.
	 * Use for short templates or when the content is generated at runtime.
	 */
	template(value: string): T {
		return this._merge({ template: value });
	}

	/**
	 * Base directory for resolving relative paths inside templates (e.g. `{{./data.md}}`).
	 * Also used as the root when locating `templateFile`. Default: `"./templates"`.
	 */
	templateDir(value: string): T {
		return this._merge({ templateDir: value });
	}

	/**
	 * File name of the template to load from `templateDir`. Ignored when `template` is set.
	 * Default: `"template.md"`.
	 */
	templateFile(value: string): T {
		return this._merge({ templateFile: value });
	}

	/**
	 * Directory where the resolved output file is written. Default: `"./responses"`.
	 */
	responseDir(value: string): T {
		return this._merge({ responseDir: value });
	}

	// --- Debug ---

	/**
	 * Write the fully resolved template to `debugFile` after assembly. Default: `false`.
	 */
	debug(value: boolean): T {
		return this._merge({ debug: value });
	}

	/**
	 * Path for the debug output file written when `debug` is `true`.
	 * Default: `"./templates/template_debug.txt"`.
	 */
	debugFile(value: string): T {
		return this._merge({ debugFile: value });
	}

	// --- Length and concurrency limits ---

	/**
	 * Maximum output length in characters (or tokens when a `tokenizer` is set).
	 * Content is trimmed to fit when the planning phase is enabled. Default: `100000`.
	 */
	maxPromptLength(value: number): T {
		return this._merge({ maxPromptLength: value });
	}

	/**
	 * Maximum number of files fetched from a single S3 prefix listing. Default: `100000`.
	 */
	maxBucketFiles(value: number): T {
		return this._merge({ maxBucketFiles: value });
	}

	/**
	 * Maximum number of source fetches that run in parallel. Default: `4`.
	 */
	maxConcurrency(value: number): T {
		return this._merge({ maxConcurrency: value });
	}

	/**
	 * Number of retry attempts for failed source fetches before giving up. Default: `3`.
	 */
	maxRetries(value: number): T {
		return this._merge({ maxRetries: value });
	}

	/**
	 * Initial delay in milliseconds before the first retry. Default: `1000`.
	 */
	retryDelay(value: number): T {
		return this._merge({ retryDelay: value });
	}

	/**
	 * Exponential backoff multiplier applied to `retryDelay` on each subsequent retry.
	 * Default: `2` (doubles the delay each time).
	 */
	retryBackoffMultiplier(value: number): T {
		return this._merge({ retryBackoffMultiplier: value });
	}

	/**
	 * Run a planning phase that estimates source lengths and pre-trims content to stay
	 * within `maxPromptLength`. Disable for templates where trimming is not desired.
	 * Default: `true`.
	 */
	enableContentLengthPlanning(value: boolean): T {
		return this._merge({ enableContentLengthPlanning: value });
	}

	/**
	 * Maximum depth for recursively nested template includes (e.g. `{{./a.md}}` inside
	 * `a.md` including `{{./b.md}}`). Default: `3`.
	 */
	maxNestingDepth(value: number): T {
		return this._merge({ maxNestingDepth: value });
	}

	// --- Security / path access ---

	/**
	 * Directories that file-system sources are allowed to read from. Any resolved path
	 * outside these directories is rejected. Should include `templateDir`.
	 * Default: `[process.cwd()]`.
	 */
	allowedBasePaths(value: string[]): T {
		return this._merge({ allowedBasePaths: value });
	}

	/**
	 * Allowlist of hostnames that HTTP/HTTPS sources may contact. An empty array permits
	 * all domains. Default: `[]` (all allowed).
	 */
	allowedDomains(value: string[]): T {
		return this._merge({ allowedDomains: value });
	}

	/**
	 * Permit `{{https://...}}` and `{{http://...}}` placeholder resolution.
	 * Default: `true`.
	 */
	allowHttp(value: boolean): T {
		return this._merge({ allowHttp: value });
	}

	/**
	 * Permit `{{TemplateType.Function:/path/to/script}}` placeholder execution.
	 * Default: `false`.
	 */
	allowFunctions(value: boolean): T {
		return this._merge({ allowFunctions: value });
	}

	/**
	 * Directories from which function scripts may be loaded when `allowFunctions` is
	 * `true`. Paths outside this list are rejected.
	 */
	allowedFunctionPaths(value: string[]): T {
		return this._merge({ allowedFunctionPaths: value });
	}

	// --- Skills ---

	/**
	 * Directory that contains local skill definition files. Default: `"./skills"`.
	 */
	skillsDir(value: string): T {
		return this._merge({ skillsDir: value });
	}

	/**
	 * Allow skills to be fetched from remote sources (e.g. GitHub). Default: `false`.
	 */
	allowRemoteSkills(value: boolean): T {
		return this._merge({ allowRemoteSkills: value });
	}

	/**
	 * Allowlist of remote skill source identifiers (e.g. `"anthropics/skills"`).
	 * Only used when `allowRemoteSkills` is `true`.
	 */
	allowedSkillSources(value: string[]): T {
		return this._merge({ allowedSkillSources: value });
	}

	// --- S3 / R2 ---

	/**
	 * AWS / S3-compatible access key ID for `{{s3://...}}` placeholder resolution.
	 * Falls back to `S3_ACCESS_KEY_ID` / `AWS_ACCESS_KEY_ID` env vars.
	 */
	s3AccessKeyId(value: string): T {
		return this._merge({ s3AccessKeyId: value });
	}

	/**
	 * AWS / S3-compatible secret access key.
	 * Falls back to `S3_SECRET_ACCESS_KEY` / `AWS_SECRET_ACCESS_KEY` env vars.
	 */
	s3SecretAccessKey(value: string): T {
		return this._merge({ s3SecretAccessKey: value });
	}

	/**
	 * Optional STS session token for temporary credentials.
	 * Falls back to `S3_SESSION_TOKEN` / `AWS_SESSION_TOKEN` env vars.
	 */
	s3SessionToken(value: string): T {
		return this._merge({ s3SessionToken: value });
	}

	/**
	 * AWS region used when constructing S3 request signatures.
	 * Falls back to `S3_REGION` / `AWS_REGION` env vars.
	 */
	s3Region(value: string): T {
		return this._merge({ s3Region: value });
	}

	/**
	 * Default S3 bucket name used when no bucket is specified in the placeholder URL.
	 * Falls back to `S3_BUCKET` / `AWS_BUCKET` env vars.
	 */
	s3Bucket(value: string): T {
		return this._merge({ s3Bucket: value });
	}

	/**
	 * Custom S3-compatible endpoint hostname (e.g. `"localhost:9000"` for MinIO,
	 * `"nyc3.digitaloceanspaces.com"` for DigitalOcean Spaces).
	 * Falls back to `AWS_S3_URL` env var. Default: `"s3.amazonaws.com"`.
	 */
	awsS3Url(value: string): T {
		return this._merge({ awsS3Url: value });
	}

	/**
	 * Cloudflare R2 endpoint hostname (e.g. `"<account-id>.r2.cloudflarestorage.com"`).
	 * Falls back to `CLOUDFLARE_R2_URL` env var.
	 */
	cloudflareR2Url(value: string): T {
		return this._merge({ cloudflareR2Url: value });
	}

	/**
	 * Use virtual-hosted-style S3 URLs (`bucket.s3.region.amazonaws.com/key`) instead of
	 * path-style (`s3.region.amazonaws.com/bucket/key`). Required by some S3-compatible
	 * services. Default: `false`.
	 */
	s3VirtualHostedStyle(value: boolean): T {
		return this._merge({ s3VirtualHostedStyle: value });
	}

	// --- HTTP ---

	/**
	 * Timeout in milliseconds for individual HTTP/HTTPS source requests. Default: `30000`.
	 */
	httpTimeout(value: number): T {
		return this._merge({ httpTimeout: value });
	}

	/**
	 * Response body size threshold (bytes) above which the HTTP response is streamed rather
	 * than buffered in memory. Default: `1048576` (1 MB).
	 */
	httpStreamThresholdBytes(value: number): T {
		return this._merge({ httpStreamThresholdBytes: value });
	}

	// --- Context and rules ---

	/**
	 * Data object available as `{{context.key}}` in templates and as the context for
	 * `{{#if context.key}}` conditional blocks.
	 */
	context(value: Record<string, unknown>): T {
		return this._merge({ context: value });
	}

	/**
	 * Expression engine used for `{{#if ...}}` and `{{#each ...}}` blocks.
	 * - `"js"` — full JavaScript expressions (default).
	 * - `"safe"` — restricted subset with no arbitrary code execution.
	 */
	expressionEngine(value: "js" | "safe"): T {
		return this._merge({ expressionEngine: value });
	}

	/**
	 * Selects template syntax handling:
	 * - "shotput" (default): {{#if}}/{{#each}} + shotput variables
	 * - "jinja2": Jinja2 syntax rendered via shotput's native Jinja engine
	 */
	templateSyntax(value: "shotput" | "jinja2"): T {
		return this._merge({ templateSyntax: value });
	}

	/**
	 * Enables/disables HTML autoescaping for Jinja2 mode.
	 * Only used when templateSyntax is set to "jinja2".
	 */
	jinjaAutoescape(value: boolean): T {
		return this._merge({ jinjaAutoescape: value });
	}

	// --- Tokenizer ---

	/**
	 * Token counter used when `maxPromptLength` is interpreted as a token budget.
	 * Pass `"openai"` / `"cl100k_base"` for the tiktoken encoder, or a custom
	 * `(text: string) => number` function.
	 */
	tokenizer(value: "openai" | "cl100k_base" | ((text: string) => number)): T {
		return this._merge({ tokenizer: value });
	}

	/**
	 * Path to a Bun worker script that handles token counting off the main thread.
	 * Useful when the tokenizer is CPU-intensive.
	 */
	tokenizerWorker(value: string): T {
		return this._merge({ tokenizerWorker: value });
	}

	/**
	 * Optional semantic compressor for actively shrinking low-priority blocks
	 * to fit within the maxPromptLength budget.
	 */
	compressor(value: import("../types").SemanticCompressor): T {
		return this._merge({ compressor: value });
	}

	// --- Lifecycle hooks ---

	/**
	 * Lifecycle hook callbacks invoked at key stages of the pipeline:
	 * `preResolve`, `postResolveSource`, `postAssembly`, `preOutput`.
	 * Hooks can mutate content or abort processing via `HookAbortError`.
	 */
	hooks(value: HookSet): T {
		return this._merge({ hooks: value });
	}

	// --- Output mode ---

	/**
	 * Controls the shape of the resolved output:
	 * - `"flat"` — single content string (default).
	 * - `"sectioned"` — split into named sections via `{{#section:name}}` markers.
	 * - `"messages"` — sections mapped to `{ role, content }` message objects.
	 */
	outputMode(value: OutputMode): T {
		return this._merge({ outputMode: value });
	}

	/**
	 * Per-section character (or token) budgets when `outputMode` is `"sectioned"` or
	 * `"messages"`. Example: `{ system: 2000, user: 8000 }`.
	 */
	sectionBudgets(value: Record<string, number>): T {
		return this._merge({ sectionBudgets: value });
	}

	/**
	 * Map section names to message roles for `outputMode: "messages"`.
	 * Example: `{ system: "system", user: "user", reply: "assistant" }`.
	 */
	sectionRoles(value: Record<string, "system" | "user" | "assistant">): T {
		return this._merge({ sectionRoles: value });
	}

	// --- Custom sources and commands ---

	/**
	 * Array of custom `SourcePlugin` instances that handle additional placeholder schemes
	 * (e.g. a database source, a proprietary API). Plugins are tried in order before
	 * built-in sources.
	 */
	customSources(value: SourcePlugin[]): T {
		return this._merge({ customSources: value });
	}

	/**
	 * Directory that contains `{{command:name}}` template files.
	 * Default: `"./commands"`.
	 */
	commandsDir(value: string): T {
		return this._merge({ commandsDir: value });
	}

	/**
	 * Strip YAML frontmatter from the resolved output and expose it as
	 * `result.metadata.frontmatter`. Default: `false`.
	 */
	parseSubagentFrontmatter(value: boolean): T {
		return this._merge({ parseSubagentFrontmatter: value });
	}

	/**
	 * Directory containing `{{subagent:name}}` definition files.
	 * Default: `"./.agents"`.
	 */
	subagentsDir(value: string): T {
		return this._merge({ subagentsDir: value });
	}

	// --- Database ---

	/**
	 * Configure a Redis connection and automatically enable `{{redis://...}}` placeholder
	 * support. Accepts either a connection URL string or an options object:
	 *
	 * - `redisUrl` — full URL, e.g. `"redis://user:pass@host:6379"`.
	 * - `redisUsername` / `redisPassword` — credentials for `localhost:6379`.
	 * - `redisPasswordHash` — stored Bun.password hash; the plaintext `redisPassword` is
	 *   verified against it before connecting.
	 *
	 * Falls back to `REDIS_URL` / `VALKEY_URL` env vars when not set here.
	 *
	 * @example
	 * ```ts
	 * shotput().redis("redis://localhost:6379").template("{{redis:///get:mykey}}").run()
	 * shotput().redis({ redisUsername: "admin", redisPassword: "secret" }).run()
	 * ```
	 */
	redis(value: string | DbPluginOptions): T {
		return this._merge({ redis: value });
	}

	/**
	 * Enable `{{sqlite://path/query:SQL}}` placeholder support. The database path is
	 * resolved relative to `templateDir` and must fall within `allowedBasePaths`. Databases
	 * are opened read-only.
	 *
	 * Falls back to the `SQLITE_ENABLED=true` env var when not set here.
	 *
	 * @example
	 * ```ts
	 * shotput()
	 *   .templateDir("./data")
	 *   .allowedBasePaths(["./data"])
	 *   .sqlite()
	 *   .template("{{sqlite://app.db/query:SELECT * FROM users}}")
	 *   .run()
	 * ```
	 */
	sqlite(enabled = true): T {
		return this._merge({ sqlite: enabled });
	}
}

/**
 * Coverage checklist to keep the fluent builder aligned with ShotputConfig.
 * If new config keys are added, update this list and decide whether they need
 * a dedicated chainable method on ShotputBase.
 */
export const BUILDER_CONFIG_COVERAGE = [
	"debug",
	"debugFile",
	"template",
	"templateDir",
	"templateFile",
	"responseDir",
	"maxPromptLength",
	"maxBucketFiles",
	"awsS3Url",
	"cloudflareR2Url",
	"httpTimeout",
	"httpStreamThresholdBytes",
	"maxConcurrency",
	"maxRetries",
	"retryDelay",
	"retryBackoffMultiplier",
	"enableContentLengthPlanning",
	"allowedBasePaths",
	"allowedDomains",
	"allowHttp",
	"allowFunctions",
	"allowedFunctionPaths",
	"skillsDir",
	"allowRemoteSkills",
	"allowedSkillSources",
	"s3AccessKeyId",
	"s3SecretAccessKey",
	"s3SessionToken",
	"s3Region",
	"s3Bucket",
	"s3VirtualHostedStyle",
	"maxNestingDepth",
	"customSources",
	"context",
	"expressionEngine",
	"tokenizer",
	"tokenizerWorker",
	"hooks",
	"outputMode",
	"sectionBudgets",
	"sectionRoles",
	"commandsDir",
	"parseSubagentFrontmatter",
	"subagentsDir",
	"redis",
	"sqlite",
	"compressor",
	"templateSyntax",
	"jinjaAutoescape",
] as const satisfies ReadonlyArray<keyof ShotputConfig>;
