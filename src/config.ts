export const CONFIG = {
	debug: process.env["DEBUG"] === "true",
	debugFile: process.env["DEBUG_FILE"] || "./prompt_debug.txt",
	promptDir: process.env["PROMPT_DIR"] || "./prompts",
	promptPath: process.env["PROMPT_PATH"] || "/prompt.md",
	responseDir: process.env["RESPONSE_DIR"] || "./responses",
	maxPromptLength: Number.parseInt(process.env["MAX_PROMPT_LENGTH"] ?? "") || 100000,
};
