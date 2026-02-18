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
	Custom = "custom",
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

export type OutputMode = "flat" | "sectioned" | "messages";

export interface Section {
	name: string;
	content: string;
	stable: boolean;
	contentHash: string;
	metadata: Array<{ path: string; type: string; duration: number }>;
}

export interface MessageOutput {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ShotputOutput {
	content?: string;
	sections?: Section[];
	messages?: MessageOutput[];
	frontmatter?: Record<string, unknown>;
	error?: Error;
	metadata: {
		duration: number;
		outputMode?: OutputMode;
		resultMetadata?: Array<{ path: string; type: string; duration: number }>;
	};
}

/** Result of runStreaming: content as a ReadableStream plus metadata (resolves when stream finishes). */
export interface ShotputStreamingOutput {
	stream: ReadableStream<string>;
	metadata: Promise<ShotputOutput["metadata"]>;
	error?: Error;
}

/** Result of shotputStreamingSegments: segments in document order, metadata when done, optional literal map. */
export interface ShotputSegmentStreamOutput {
	stream: ReadableStream<string>;
	metadata: Promise<ShotputOutput["metadata"]>;
	literalMap?: Map<string, string>;
	/** Resolves when the stream is finished; use for literalMap when streaming (sequential path only). */
	literalMapPromise?: Promise<Map<string, string> | undefined>;
	error?: Error;
}
