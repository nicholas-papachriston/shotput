export enum TemplateType {
	String = "string",
	File = "file",
	Directory = "directory",
	Glob = "glob",
	Regex = "regex",
	S3 = "s3",
	Function = "function",
}

export interface FileResult {
	content: string;
	length: number;
	truncated: boolean;
	remainingLength: number;
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
