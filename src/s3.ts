import { CONFIG } from "./config";
import { createXmlParser } from "./xml";
import { getLogger } from "./logger";

const log = getLogger("s3");

export const getStorageServiceUrl = (bucket: string, key?: string) => {
	if (CONFIG.cloudflareR2Url) {
		return `https://${CONFIG.cloudflareR2Url}/${bucket}${key ? `/${key}` : ""}`;
	}
	return `https://${bucket}.${CONFIG.awsS3Url}{${key ? `/${key}` : ""}}`;
};

const handleObject = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	let combinedContent = `filename:${path}:\n`;
	let combinedRemainingCount = remainingLength;

	const fileStream = Bun.s3.file(path).stream();

	for await (const chunk of fileStream) {
		combinedContent += chunk.toString();
	}

	combinedRemainingCount -= combinedContent.length;

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};

interface ListObjectsResponse {
	keys: string[];
	nextContinuationToken?: string;
}

const parseS3ListResponse = (
	xmlParser: ReturnType<typeof createXmlParser>,
	listXml: string,
): ListObjectsResponse => {
	const keys = xmlParser.parseS3ListResponse(listXml);
	const parser = xmlParser.parse(listXml);
	const nextContinuationToken = parser.children.find(
		(child) => child.tag === "NextContinuationToken",
	)?.text;

	return {
		keys,
		nextContinuationToken,
	};
};

const handleObjectPrefix = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	const maxItems = CONFIG.maxBucketFiles;
	const s3Url = new URL(path);
	const bucket = s3Url.hostname.split(".")[0];
	const prefix = s3Url.pathname.slice(1);
	const xmlParser = createXmlParser();

	let combinedContent = "";
	let combinedRemainingCount = remainingLength;
	let processedItems = 0;
	let continuationToken: string | undefined;

	do {
		// Build URL with pagination token if present
		const listUrl = new URL(`https://${getStorageServiceUrl(bucket)}`);
		listUrl.searchParams.append("list-type", "2");
		listUrl.searchParams.append("prefix", prefix);
		if (continuationToken) {
			listUrl.searchParams.append("continuation-token", continuationToken);
		}

		const listResponse = await fetch(listUrl.toString());

		if (!listResponse.ok) {
			throw new Error(
				`Failed to list objects in prefix ${path}: ${listResponse.statusText}`,
			);
		}

		const listXml = await listResponse.text();
		const { keys, nextContinuationToken } = parseS3ListResponse(
			xmlParser,
			listXml,
		);

		for (const key of keys) {
			if (!key) continue;
			if (combinedRemainingCount <= 0 || processedItems >= maxItems) {
				return {
					operationResults: result.replace(match, combinedContent),
					combinedRemainingCount,
				};
			}

			const object = await handleObject(
				result,
				`s3://${bucket}/${key}`,
				match,
				remainingLength,
			);

			if (object.combinedRemainingCount <= 0) {
				return {
					operationResults: result.replace(match, combinedContent),
					combinedRemainingCount,
				};
			}

			combinedContent += object.operationResults;
			combinedRemainingCount = object.combinedRemainingCount;
			processedItems++;
		}

		continuationToken = nextContinuationToken;
	} while (continuationToken && processedItems < maxItems);

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};

export const bucketExists = async (
	uncleanBucketString: string,
): Promise<void> => {
	const bucket = uncleanBucketString.replace("s//", "").split("/")[0];
	await fetch(`https://${getStorageServiceUrl(bucket)}`, {
		method: "HEAD",
	}).catch((err) => {
		if (err instanceof Error && err.message.includes("Failed to fetch")) {
			throw new Error(`Bucket ${bucket} does not exist`);
		}
		throw err;
	});
};

/**
 * @param path - S3 path. e.g. s3://bucket-name/prefix/ or s3://bucket-name/prefix/file.txt
 */
export const handleS3 = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Handling S3 path: ${path}`);
	if (path.endsWith("/")) {
		return await handleObjectPrefix(result, path, match, remainingLength);
	}
	return await handleObject(result, path, match, remainingLength);
};
