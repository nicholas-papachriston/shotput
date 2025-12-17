export default async function testFunction(
	result,
	_path,
	match,
	remainingLength,
) {
	const content = "This is from a test function!";
	return {
		operationResults: result.replace(match, content),
		combinedRemainingCount: remainingLength - content.length,
	};
}
