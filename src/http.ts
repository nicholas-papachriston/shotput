export const handleHttp = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	const combinedContent = `path: ${path}\nhttpResults: ${await fetch(path).then((res) => res.text())}`;
	const combinedRemainingCount = remainingLength;

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};
