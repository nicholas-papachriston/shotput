export const handleFunction = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	if (remainingLength <= 0) {
		return {
			operationResults: result,
			remainingLength,
		};
	}

	const functionPath = path.split("TemplateType.Function:")[1];
	const functionModule = await import(functionPath);
	const { operationResults, combinedRemainingCount } =
		await functionModule.default(result, path, match, remainingLength);

	return {
		operationResults,
		combinedRemainingCount,
	};
};
