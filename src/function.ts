export const FUNCTION_TEMPLATE = "TemplateType.Function:";

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

	const functionPath = path.split(FUNCTION_TEMPLATE)[1];
	const functionModule = await import(functionPath);
	const { operationResults, combinedRemainingCount } =
		await functionModule.default(result, path, match, remainingLength);

	return {
		operationResults,
		combinedRemainingCount,
	};
};
