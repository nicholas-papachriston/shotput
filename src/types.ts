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

/**
 * Output shape from shotput().
 * - "flat": resolved content in output.content
 * - "sectioned": parsed {{#section:name}} blocks in output.sections
 * - "messages": sections mapped to roles (system/user/assistant) in output.messages
 */
export type OutputMode = "flat" | "sectioned" | "messages";

/**
 * Parsed section from {{#section:name}}...{{/section}} blocks.
 * Present when outputMode is "sectioned" or "messages".
 */
export interface Section {
	/** Section name from {{#section:name}} */
	name: string;
	/** Resolved content inside the section */
	content: string;
	/** True when section has stable=true; use for KV-cache optimization */
	stable: boolean;
	/** SHA-256 hash of content for cache keying */
	contentHash: string;
	/** Per-source metadata (path, type, duration) */
	metadata: Array<{ path: string; type: string; duration: number }>;
}

/**
 * Chat message for outputMode "messages".
 * Maps section names to roles via config.sectionRoles.
 */
export interface MessageOutput {
	/** "system" | "user" | "assistant" for chat API consumption */
	role: "system" | "user" | "assistant";
	/** Message content */
	content: string;
}

/**
 * Result of shotput(). Contains content, sections, or messages depending on outputMode.
 * Check error when processing threw.
 */
export interface ShotputOutput {
	/** Resolved template content (flat mode). Also set for sectioned/messages. */
	content?: string;
	/** Parsed sections when outputMode is "sectioned" */
	sections?: Section[];
	/** Formatted messages when outputMode is "messages" */
	messages?: MessageOutput[];
	/** Parsed YAML frontmatter when parseSubagentFrontmatter is true */
	frontmatter?: Record<string, unknown>;
	/** Set when processing threw */
	error?: Error;
	/** Processing metadata: duration, outputMode, resultMetadata */
	metadata: {
		duration: number;
		outputMode?: OutputMode;
		resultMetadata?: Array<{ path: string; type: string; duration: number }>;
	};
}

/**
 * Result of shotputStreaming(): stream of resolved segments plus metadata.
 * PostAssembly, preOutput, and sectioning are not run.
 */
export interface ShotputStreamingOutput {
	/** ReadableStream of string segments in document order */
	stream: ReadableStream<string>;
	/** Resolves when stream finishes; contains duration and resultMetadata */
	metadata: Promise<ShotputOutput["metadata"]>;
	/** Set when processing threw */
	error?: Error;
}

/**
 * Result of shotputStreamingSegments(): same as ShotputStreamingOutput plus literalMap.
 * Use literalMap for client-side substitution when custom sources emit literal placeholders.
 */
export interface ShotputSegmentStreamOutput {
	/** ReadableStream of string segments in document order */
	stream: ReadableStream<string>;
	/** Resolves when stream finishes */
	metadata: Promise<ShotputOutput["metadata"]>;
	/** Map of placeholder -> literal replacement; set when custom sources emit literals */
	literalMap?: Map<string, string>;
	/** Resolves when stream is finished; use for literalMap when streaming */
	literalMapPromise?: Promise<Map<string, string> | undefined>;
	/** Set when processing threw */
	error?: Error;
}
