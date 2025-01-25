export const CONFIG = {
	baseUrl: process.env["LLM_INTERFACE_URL"] || "http://localhost:11434",
	modelName: process.env["LLM_INTERFACE_LLM_MODEL"] || "deepseek-r1:1.5b",
	promptPath: process.env["PROMPT_PATH"] || "./prompt.md",
	responsesDir: process.env["RESPONSE_DIR"] || "./responses",
	maxPromptLength: Number(process.env["MAX_PROMPT_LENGTH"]) || 100000,
	temperature: Number(process.env["TEMPERATURE"]) || 0.7,
	top_p: Number(process.env["TOP_P"]) || 0.9,
	max_tokens: Number(process.env["MAX_TOKENS"]) || 1024,
};
