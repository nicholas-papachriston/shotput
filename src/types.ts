export enum TemplateType {
	String = "string",
	File = "file",
	Directory = "directory",
	Glob = "glob",
	Regex = "regex",
	S3 = "s3",
	Function = "function",
	Http = "http",
	Skill = "skill",
}

export interface FileResult {
	content: string;
	length: number;
	truncated: boolean;
	remainingLength: number;
}

export interface TemplateResult {
	type: TemplateType;
	path: string;
	length: number;
	truncated: boolean;
	processingTime: number;
	content?: string;
	error?: string;
}

export interface ProcessingProgress {
	current: number;
	total: number;
	currentTemplate: string;
	stage: "parsing" | "processing" | "complete";
}

export interface ShotputResult {
	content: string;
	metadata: {
		processedTemplates: TemplateResult[];
		totalLength: number;
		truncated: boolean;
		errors: ProcessingError[];
		processingTime: number;
	};
}

export interface ProcessingError {
	path: string;
	error: string;
	type: TemplateType;
}

export type TemplateFunction = (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => Promise<{
	operationResults: string;
	combinedRemainingCount: number;
}>;

export interface S3Credentials {
	accessKeyId?: string;
	secretAccessKey?: string;
	sessionToken?: string;
	endpoint?: string;
	bucket?: string;
	region?: string;
	virtualHostedStyle?: boolean;
}

export interface S3BucketInfo {
	bucket: string;
	key?: string;
	isDirectoryBucket: boolean;
	availabilityZoneId?: string;
}
