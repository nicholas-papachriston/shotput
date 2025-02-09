/**
 * @prop debug - whether to log debug messages
 * @prop debugFile - file to write the template to when debugging
 * @prop templateDir - ex: .
 * @prop templateFile - ex: ./template.md
 * @prop responseDir - ex: ./responses
 * @prop [maxPromptLength] - def: 100000
 * @prop [maxBucketFiles] - def: 100000 - how many files to attempt to parse from a bucket
 * @prop [awsS3Url] - ex: <ACCOUNT_ID>.s3.amazonaws.com
 * @prop [cloudflareR2Url] - ex: <ACCOUNT_ID>.r2.cloudflarestorage.com
 */
export interface ShotputConfig {
	debug: boolean;
	debugFile: string;
	templateDir: string;
	templateFile: string;
	responseDir: string;
	maxPromptLength?: number;
	maxBucketFiles?: number;
	awsS3Url?: string;
	cloudflareR2Url?: string;
}

const DEFAULT_CONFIG = {
	debug: false,
	debugFile: "./templates/template_debug.txt",
	templateDir: "./templates",
	templateFile: "/template.md",
	responseDir: "./responses",
	maxPromptLength: 100000,
	maxBucketFiles: 100000,
	awsS3Url: "s3.amazonaws.com",
	cloudflareR2Url: undefined,
};

export const CONFIG: {
	debug: boolean;
	debugFile: string;
	templateDir: string;
	templateFile: string;
	responseDir: string;
	maxPromptLength: number;
	maxBucketFiles: number;
	awsS3Url: string;
	cloudflareR2Url?: string;
} = {
	debug: process.env["DEBUG"] === "true",
	debugFile: process.env["DEBUG_FILE"] ?? DEFAULT_CONFIG.debugFile,
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
};
