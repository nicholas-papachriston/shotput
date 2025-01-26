export const handleS3 = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	let combinedContent = `filename:${path}:\n`;
	let combinedRemainingCount = remainingLength;

	await Bun.s3
		.file(path)
		.text()
		.then((data) => {
			if (combinedRemainingCount - data.length < 0) {
				combinedContent += data.slice(0, combinedRemainingCount);
			} else {
				combinedContent += data;
			}
		});

	combinedRemainingCount -= combinedContent.length;

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};
