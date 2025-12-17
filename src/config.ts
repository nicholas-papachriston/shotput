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
 * @prop [allowedBasePaths] - def: [process.cwd()] - allowed base paths for file access
 * @prop [allowedDomains] - def: [] - allowed HTTP domains (empty = all allowed)
 * @prop [allowHttp] - def: true - whether HTTP requests are allowed
 * @prop [allowFunctions] - def: false - whether function execution is allowed
 * @prop [allowedFunctionPaths] - def: [] - allowed paths for function execution
 */
export interface ShotputConfig {
	debug: boolean;
	debugFile: string;
	template?: string;
	templateDir: string;
	templateFile: string;
	responseDir: string;
	maxPromptLength?: number;
	maxBucketFiles?: number;
	awsS3Url?: string;
	cloudflareR2Url?: string;
	httpTimeout?: number;
	maxConcurrency?: number;
	allowedBasePaths?: string[];
	allowedDomains?: string[];
	allowHttp?: boolean;
	allowFunctions?: boolean;
	allowedFunctionPaths?: string[];
	skillsDir?: string;
	allowRemoteSkills?: boolean;
	allowedSkillSources?: string[];
	s3AccessKeyId?: string;
	s3SecretAccessKey?: string;
	s3SessionToken?: string;
	s3Region?: string;
	s3Bucket?: string;
	s3VirtualHostedStyle?: boolean;
}

const DEFAULT_CONFIG = {
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
};

export const CONFIG = {
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
	allowedBasePaths: process.env["ALLOWED_BASE_PATHS"]
		? process.env["ALLOWED_BASE_PATHS"].split(",")
		: DEFAULT_CONFIG.allowedBasePaths,
	allowedDomains: process.env["ALLOWED_DOMAINS"]
		? process.env["ALLOWED_DOMAINS"].split(",")
		: DEFAULT_CONFIG.allowedDomains,
	allowHttp: process.env["ALLOW_HTTP"] === "true" || DEFAULT_CONFIG.allowHttp,
	allowFunctions:
		process.env["ALLOW_FUNCTIONS"] === "true" || DEFAULT_CONFIG.allowFunctions,
	allowedFunctionPaths: process.env["ALLOWED_FUNCTION_PATHS"]
		? process.env["ALLOWED_FUNCTION_PATHS"].split(",")
		: DEFAULT_CONFIG.allowedFunctionPaths,
	skillsDir: process.env["SKILLS_DIR"] ?? DEFAULT_CONFIG.skillsDir,
	allowRemoteSkills:
		process.env["ALLOW_REMOTE_SKILLS"] === "true" ||
		DEFAULT_CONFIG.allowRemoteSkills,
	allowedSkillSources: process.env["ALLOWED_SKILL_SOURCES"]
		? process.env["ALLOWED_SKILL_SOURCES"].split(",")
		: DEFAULT_CONFIG.allowedSkillSources,
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
};
