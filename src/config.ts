/**
 * Configuration for Shotput template resolution.
 *
 * Pass partial config to shotput(); omitted values come from env vars or defaults.
 * Key template-related options: template or templateFile, templateDir, allowedBasePaths,
 * context (for {{#if context.x}}), outputMode (for {{#section:name}}), sectionRoles.
 *
 * @prop debug - Whether to log debug messages. Default: false
 * @prop debugFile - Path to write resolved template when debug is true. Default: "./templates/template_debug.txt"
 * @prop template - Inline template string; overrides templateFile when provided
 * @prop templateDir - Base directory for relative paths (e.g. {{./file.md}}). Default: "./templates"
 * @prop templateFile - Template file name when not using template. Default: "template.md"
 * @prop responseDir - Output directory. Default: "./responses"
 * @prop maxPromptLength - Max output length (chars or tokens when tokenizer set). Default: 100000
 * @prop maxBucketFiles - Max files from S3 prefix. Default: 100000
 * @prop awsS3Url - S3 endpoint. Default: "s3.amazonaws.com"
 * @prop cloudflareR2Url - R2 endpoint for Cloudflare R2
 * @prop httpTimeout - HTTP request timeout in ms. Default: 30000
 * @prop httpStreamThresholdBytes - Stream HTTP body when Content-Length >= this (1MB default)
 * @prop maxConcurrency - Max concurrent fetches. Default: 4
 * @prop maxRetries - Retry attempts for failed operations. Default: 3
 * @prop retryDelay - Initial retry delay in ms. Default: 1000
 * @prop retryBackoffMultiplier - Exponential backoff multiplier. Default: 2
 * @prop enableContentLengthPlanning - Enable planning phase and trimming. Default: true
 * @prop allowedBasePaths - Base paths for {{./path}} resolution. Must include templateDir
 * @prop allowedDomains - Allowed HTTP domains (empty = all). Comma-separated
 * @prop allowHttp - Allow HTTP/HTTPS requests. Default: true
 * @prop allowFunctions - Allow {{TemplateType.Function:/path}}. Default: false
 * @prop allowedFunctionPaths - Paths allowed for function execution
 * @prop maxNestingDepth - Max nested {{file}} depth. Default: 3
 * @prop customSources - Custom SourcePlugin array for extensible source types
 * @prop context - Object for {{context.x}} and {{#if context.x}} rules
 * @prop expressionEngine - "js" (full) or "safe" (restricted) for {{#if}} expressions. Default: "js"
 * @prop tokenizer - When set, maxPromptLength is in tokens. "openai"|"cl100k_base" or (text)=>number
 * @prop tokenizerWorker - Path to worker for async token counting
 * @prop hooks - Lifecycle hooks: preResolve, postResolveSource, postAssembly, preOutput
 * @prop outputMode - "flat" | "sectioned" | "messages". Use sectioned/messages with {{#section:name}}. Default: "flat"
 * @prop sectionBudgets - Per-section max length: { sectionName: chars }
 * @prop sectionRoles - Map section names to roles for messages mode: { sectionName: "system"|"user"|"assistant" }
 * @prop commandsDir - Directory for {{command:name}} templates. Default: "./commands"
 * @prop parseSubagentFrontmatter - Strip YAML frontmatter and set output.frontmatter. Default: false
 * @prop subagentsDir - Directory for {{subagent:name}} definitions. Default: "./.agents"
 * @prop redis - Redis connection: URL string (e.g. "redis://localhost:6379") or options object with url/username/password. Automatically enables {{redis://...}} placeholder support.
 * @prop sqlite - Enable {{sqlite://path/query:SQL}} placeholder support. Default: false
 */
export interface ShotputConfig {
	debug: boolean;
	debugFile: string;
	template?: string;
	templateDir: string;
	templateFile: string;
	responseDir: string;
	maxPromptLength: number;
	maxBucketFiles: number;
	awsS3Url: string;
	cloudflareR2Url?: string;
	httpTimeout: number;
	httpStreamThresholdBytes: number;
	maxConcurrency: number;
	maxRetries: number;
	retryDelay: number;
	retryBackoffMultiplier: number;
	enableContentLengthPlanning: boolean;
	allowedBasePaths: string[];
	allowedDomains: string[];
	allowHttp: boolean;
	allowFunctions: boolean;
	allowedFunctionPaths: string[];
	skillsDir: string;
	allowRemoteSkills: boolean;
	allowedSkillSources: string[];
	s3AccessKeyId?: string;
	s3SecretAccessKey?: string;
	s3SessionToken?: string;
	s3Region?: string;
	s3Bucket?: string;
	s3VirtualHostedStyle: boolean;
	maxNestingDepth: number;
	customSources?: import("./sources/plugins").SourcePlugin[];
	context?: Record<string, unknown>;
	expressionEngine?: "js" | "safe";
	/** When set, maxPromptLength is in tokens and planning/trimming use token count. */
	tokenizer?: "openai" | "cl100k_base" | ((text: string) => number);
	/** When set, token counting is done in this worker script (path). */
	tokenizerWorker?: string;
	hooks?: import("./hooks").HookSet;
	outputMode?: import("./types").OutputMode;
	sectionBudgets?: Record<string, number>;
	sectionRoles?: Record<string, "system" | "user" | "assistant">;
	commandsDir?: string;
	parseSubagentFrontmatter?: boolean;
	subagentsDir?: string;
	/** Redis connection: URL string or options object (url, username, password, passwordHash). Enables {{redis://...}} placeholder support. */
	redis?: string | import("./db/options").DbPluginOptions;
	/** Enable {{sqlite://path/query:SQL}} placeholder support. Default: false */
	sqlite?: boolean;
	/** Optional semantic compressor for actively shrinking low-priority blocks. */
	compressor?: import("./types").SemanticCompressor;
	/**
	 * Template syntax mode:
	 * - "shotput" uses {{#if}}/{{#each}} and {{context.x}} interpolation
	 * - "jinja2" evaluates Jinja2 syntax before shotput source interpolation
	 */
	templateSyntax?: "shotput" | "jinja2";
	/** Autoescape setting used by the Jinja2 renderer when templateSyntax is "jinja2". */
	jinjaAutoescape?: boolean;
}

export const DEFAULT_CONFIG: ShotputConfig = {
	debug: false,
	debugFile: "./templates/template_debug.txt",
	template: undefined,
	templateDir: "./templates",
	templateFile: "template.md",
	responseDir: "./responses",
	maxPromptLength: 100000,
	maxBucketFiles: 100000,
	awsS3Url: "s3.amazonaws.com",
	cloudflareR2Url: undefined,
	httpTimeout: 30000,
	httpStreamThresholdBytes: 1024 * 1024,
	maxConcurrency: 4,
	maxRetries: 3,
	retryDelay: 1000,
	retryBackoffMultiplier: 2,
	enableContentLengthPlanning: true,
	allowedBasePaths: [process.cwd()],
	allowedDomains: [],
	allowHttp: true,
	allowFunctions: false,
	allowedFunctionPaths: [],
	skillsDir: "./skills",
	allowRemoteSkills: false,
	allowedSkillSources: ["anthropics/skills"],
	s3AccessKeyId: undefined,
	s3SecretAccessKey: undefined,
	s3SessionToken: undefined,
	s3Region: undefined,
	s3Bucket: undefined,
	s3VirtualHostedStyle: false,
	maxNestingDepth: 3,
	context: undefined,
	expressionEngine: "js",
	tokenizer: undefined,
	outputMode: "flat",
	sectionBudgets: undefined,
	sectionRoles: undefined,
	commandsDir: "./commands",
	parseSubagentFrontmatter: false,
	subagentsDir: "./.agents",
	redis: undefined,
	sqlite: false,
	compressor: undefined,
	templateSyntax: "shotput",
	jinjaAutoescape: false,
};

const JINJA_TEMPLATE_EXTENSIONS = [".jinja", ".jinja2", ".j2"] as const;

/**
 * Returns a configuration object populated from environment variables,
 * falling back to DEFAULT_CONFIG values where necessary.
 */
export const getEnvConfig = (): ShotputConfig => ({
	debug: process.env["DEBUG"] === "true",
	debugFile: process.env["DEBUG_FILE"] ?? DEFAULT_CONFIG.debugFile,
	template: process.env["TEMPLATE"] ?? DEFAULT_CONFIG.template,
	templateDir: process.env["TEMPLATE_DIR"] ?? DEFAULT_CONFIG.templateDir,
	templateFile: process.env["TEMPLATE_PATH"] ?? DEFAULT_CONFIG.templateFile,
	responseDir: process.env["RESPONSE_DIR"] ?? DEFAULT_CONFIG.responseDir,
	maxPromptLength:
		Number.parseInt(process.env["MAX_PROMPT_LENGTH"] ?? "") ||
		DEFAULT_CONFIG.maxPromptLength,
	maxBucketFiles:
		Number.parseInt(process.env["MAX_BUCKET_FILES"] ?? "") ||
		DEFAULT_CONFIG.maxBucketFiles,
	awsS3Url: process.env["AWS_S3_URL"] ?? DEFAULT_CONFIG.awsS3Url,
	cloudflareR2Url: process.env["CLOUDFLARE_R2_URL"],
	httpTimeout:
		Number.parseInt(process.env["HTTP_TIMEOUT"] ?? "") ||
		DEFAULT_CONFIG.httpTimeout,
	httpStreamThresholdBytes:
		Number.parseInt(process.env["HTTP_STREAM_THRESHOLD_BYTES"] ?? "") ||
		DEFAULT_CONFIG.httpStreamThresholdBytes,
	maxConcurrency:
		Number.parseInt(process.env["MAX_CONCURRENCY"] ?? "") ||
		DEFAULT_CONFIG.maxConcurrency,
	maxRetries:
		Number.parseInt(process.env["MAX_RETRIES"] ?? "") ||
		DEFAULT_CONFIG.maxRetries,
	retryDelay:
		Number.parseInt(process.env["RETRY_DELAY"] ?? "") ||
		DEFAULT_CONFIG.retryDelay,
	retryBackoffMultiplier:
		Number.parseFloat(process.env["RETRY_BACKOFF_MULTIPLIER"] ?? "") ||
		DEFAULT_CONFIG.retryBackoffMultiplier,
	enableContentLengthPlanning:
		process.env["ENABLE_CONTENT_LENGTH_PLANNING"] !== "false" &&
		DEFAULT_CONFIG.enableContentLengthPlanning,
	allowedBasePaths: process.env["ALLOWED_BASE_PATHS"]
		? process.env["ALLOWED_BASE_PATHS"].split(",")
		: [...DEFAULT_CONFIG.allowedBasePaths],
	allowedDomains: process.env["ALLOWED_DOMAINS"]
		? process.env["ALLOWED_DOMAINS"].split(",")
		: [...DEFAULT_CONFIG.allowedDomains],
	allowHttp: process.env["ALLOW_HTTP"] === "true" || DEFAULT_CONFIG.allowHttp,
	allowFunctions:
		process.env["ALLOW_FUNCTIONS"] === "true" || DEFAULT_CONFIG.allowFunctions,
	allowedFunctionPaths: process.env["ALLOWED_FUNCTION_PATHS"]
		? process.env["ALLOWED_FUNCTION_PATHS"].split(",")
		: [...DEFAULT_CONFIG.allowedFunctionPaths],
	skillsDir: process.env["SKILLS_DIR"] ?? DEFAULT_CONFIG.skillsDir,
	allowRemoteSkills:
		process.env["ALLOW_REMOTE_SKILLS"] === "true" ||
		DEFAULT_CONFIG.allowRemoteSkills,
	allowedSkillSources: process.env["ALLOWED_SKILL_SOURCES"]
		? process.env["ALLOWED_SKILL_SOURCES"].split(",")
		: [...DEFAULT_CONFIG.allowedSkillSources],
	s3AccessKeyId:
		process.env["S3_ACCESS_KEY_ID"] ??
		process.env["AWS_ACCESS_KEY_ID"] ??
		DEFAULT_CONFIG.s3AccessKeyId,
	s3SecretAccessKey:
		process.env["S3_SECRET_ACCESS_KEY"] ??
		process.env["AWS_SECRET_ACCESS_KEY"] ??
		DEFAULT_CONFIG.s3SecretAccessKey,
	s3SessionToken:
		process.env["S3_SESSION_TOKEN"] ??
		process.env["AWS_SESSION_TOKEN"] ??
		DEFAULT_CONFIG.s3SessionToken,
	s3Region:
		process.env["S3_REGION"] ??
		process.env["AWS_REGION"] ??
		DEFAULT_CONFIG.s3Region,
	s3Bucket:
		process.env["S3_BUCKET"] ??
		process.env["AWS_BUCKET"] ??
		DEFAULT_CONFIG.s3Bucket,
	s3VirtualHostedStyle:
		process.env["S3_VIRTUAL_HOSTED_STYLE"] === "true" ||
		DEFAULT_CONFIG.s3VirtualHostedStyle,
	maxNestingDepth:
		Number.parseInt(process.env["MAX_NESTING_DEPTH"] ?? "") ||
		DEFAULT_CONFIG.maxNestingDepth,
	context: DEFAULT_CONFIG.context,
	expressionEngine:
		(process.env["EXPRESSION_ENGINE"] as "js" | "safe") === "safe"
			? "safe"
			: DEFAULT_CONFIG.expressionEngine,
	outputMode:
		(process.env["OUTPUT_MODE"] as "flat" | "sectioned" | "messages") ||
		DEFAULT_CONFIG.outputMode,
	sectionBudgets: process.env["SECTION_BUDGETS"]
		? (JSON.parse(process.env["SECTION_BUDGETS"]) as Record<string, number>)
		: DEFAULT_CONFIG.sectionBudgets,
	sectionRoles: process.env["SECTION_ROLES"]
		? (JSON.parse(process.env["SECTION_ROLES"]) as Record<
				string,
				"system" | "user" | "assistant"
			>)
		: DEFAULT_CONFIG.sectionRoles,
	commandsDir: process.env["COMMANDS_DIR"] ?? DEFAULT_CONFIG.commandsDir,
	parseSubagentFrontmatter:
		process.env["PARSE_SUBAGENT_FRONTMATTER"] === "true",
	subagentsDir: process.env["SUBAGENTS_DIR"] ?? DEFAULT_CONFIG.subagentsDir,
	redis:
		process.env["REDIS_URL"] ??
		process.env["VALKEY_URL"] ??
		DEFAULT_CONFIG.redis,
	sqlite: process.env["SQLITE_ENABLED"] === "true" || DEFAULT_CONFIG.sqlite,
	templateSyntax:
		(process.env["TEMPLATE_SYNTAX"] as "shotput" | "jinja2") ??
		DEFAULT_CONFIG.templateSyntax,
	jinjaAutoescape:
		process.env["JINJA_AUTOESCAPE"] === "true" ||
		DEFAULT_CONFIG.jinjaAutoescape,
});

/**
 * Creates a new configuration object by merging environment variables and optional overrides.
 *
 * @param overrides - Partial configuration to override defaults
 * @returns A complete ShotputConfig object
 */
export const createConfig = (
	overrides?: Partial<ShotputConfig>,
): ShotputConfig => {
	const config = getEnvConfig();

	if (overrides) {
		for (const key of Object.keys(overrides)) {
			const k = key as keyof ShotputConfig;
			// Use type assertion through unknown to allow dynamic assignment
			// Note: We allow undefined values to override env config
			(config as unknown as Record<string, unknown>)[k] = overrides[k];
		}
	}

	const hasExplicitTemplateSyntax =
		overrides !== undefined &&
		Object.prototype.hasOwnProperty.call(overrides, "templateSyntax");
	if (
		!hasExplicitTemplateSyntax &&
		JINJA_TEMPLATE_EXTENSIONS.some((ext) => config.templateFile.endsWith(ext))
	) {
		config.templateSyntax = "jinja2";
	}

	return config;
};
