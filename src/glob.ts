import { join } from "node:path";

export const handleGlob = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	const glob = new Bun.Glob(path);

	let combinedContent = "";
	let combinedRemainingCount = remainingLength;

	for await (const file of glob.scan(".")) {
		const content = await Bun.file(join(process.cwd(), file)).text();

		if (combinedRemainingCount - content.length < 0) {
			combinedContent += content.slice(0, combinedRemainingCount);
			combinedRemainingCount = 0;
			break;
		}

		combinedContent += content;
		combinedRemainingCount -= content.length;
	}

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};
