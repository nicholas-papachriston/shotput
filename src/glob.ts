export const handleGlob = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	console.log(`Handling glob: ${path}`);

	const glob = new Bun.Glob(path);

	let combinedContent = "";
	let combinedRemainingCount = remainingLength;

	try {
		for await (const file of glob.scan(".")) {
			try {
				if (combinedRemainingCount <= 0) break;
				console.log(`Processing file: ${file}`);
				const content = await Bun.file(file).text();

				const contentToAdd = content.slice(0, combinedRemainingCount);
				combinedContent += `filename:${file}:\ncontent:${contentToAdd}\n`;
				combinedRemainingCount -= contentToAdd.length;
			} catch (error) {
				console.error(`Error processing file ${file}:`, error);
			}
		}

		return {
			operationResults: result.replace(match, combinedContent),
			combinedRemainingCount,
		};
	} catch (error) {
		console.error(`Error processing glob ${path}:`, error);
		throw error;
	}
};
