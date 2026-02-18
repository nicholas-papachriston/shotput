/**
 * @prop debug - whether to log debug messages
 * @prop debugFile - file to write the template to when debugging
 * @prop template - optional template content as string (overrides templateFile if provided)
 * @prop templateDir - ex: .
 * @prop templateFile - ex: ./template.md
 * @prop responseDir - ex: ./responses
 * @prop [maxPromptLength] - def: 100000
 * @prop [maxBucketFiles] - def: 100000 - how many files to attempt to parse from a bucket
 * @prop [awsS3Url] - ex: <ACCOUNT_ID>.s3.amazonaws.com
 * @prop [cloudflareR2Url] - ex: <ACCOUNT_ID>.r2.cloudflarestorage.com
 * @prop [httpTimeout] - def: 30000 - HTTP request timeout in milliseconds
 * @prop [maxConcurrency] - def: 4 - maximum concurrent operations
 * @prop [maxRetries] - def: 3 - maximum retry attempts for failed operations
 * @prop [retryDelay] - def: 1000 - initial retry delay in milliseconds
 * @prop [retryBackoffMultiplier] - def: 2 - exponential backoff multiplier
 * @prop [enableContentLengthPlanning] - def: true - enable planning phase for content length detection
 * @prop [allowedBasePaths] - def: [process.cwd()] - allowed base paths for file access
 * @prop [allowedDomains] - def: [] - allowed HTTP domains (empty = all allowed)
 * @prop [allowHttp] - def: true - whether HTTP requests are allowed
 * @prop [allowFunctions] - def: false - whether function execution is allowed
 * @prop [allowedFunctionPaths] - def: [] - allowed paths for function execution
 * @prop [maxNestingDepth] - def: 3 - maximum depth for nested template interpolation
 * @prop [customSources] - optional array of custom source plugins for extensible source types
 * @prop [context] - optional context object for rule conditions ({{#if context.key}})
 * @prop [expressionEngine] - "js" (default) or "safe" for condition evaluation
 * @prop [hooks] - optional lifecycle hooks (preResolve, postResolveSource, postAssembly, preOutput)
 * @prop [outputMode] - "flat" | "sectioned" | "messages"
 * @prop [sectionBudgets] - per-section max length overrides
 * @prop [sectionRoles] - section name to role for messages mode
 * @prop [commandsDir] - directory for command templates (default ./commands)
 * @prop [parseSubagentFrontmatter] - when true, strip subagent YAML frontmatter and set output.frontmatter
 * @prop [subagentsDir] - directory for subagent definitions (default ./.agents)
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
	customSources?: import("./plugins").SourcePlugin[];
	context?: Record<string, unknown>;
	expressionEngine?: "js" | "safe";
	hooks?: import("./hooks").HookSet;
	outputMode?: import("./types").OutputMode;
	sectionBudgets?: Record<string, number>;
	sectionRoles?: Record<string, "system" | "user" | "assistant">;
	commandsDir?: string;
	parseSubagentFrontmatter?: boolean;
	subagentsDir?: string;
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
	outputMode: "flat",
	sectionBudgets: undefined,
	sectionRoles: undefined,
	commandsDir: "./commands",
	parseSubagentFrontmatter: false,
	subagentsDir: "./.agents",
};

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

	return config;
};
