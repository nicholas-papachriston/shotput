export const handleS3 = async (
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
