import { describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";
import { shotput } from "../../src/index";
import { interpolation } from "../../src/runtime/interpolation";
import { createShellPlugin } from "../../src/shell";

describe("shell interpolation", () => {
	it("executes shell placeholders when enabled", async () => {
		const config = createConfig({
			allowedBasePaths: [process.cwd()],
			templateDir: process.cwd(),
			allowShell: true,
			allowHttp: false,
			maxConcurrency: 1,
			customSources: [createShellPlugin()],
		});

		const result = await interpolation(
			"Result: {{shell:printf 'hello world'}}",
			config,
		);
		expect(result.processedTemplate).toContain("Result: hello world");
	});

	it("keeps shell placeholders literal when disabled", async () => {
		const result = await shotput()
			.with({
				template: "Value: {{shell:printf 'hello'}}",
				templateDir: process.cwd(),
				allowedBasePaths: [process.cwd()],
				allowHttp: false,
				allowShell: false,
			})
			.run();

		expect(result.error).toBeUndefined();
		expect(result.content).toBe("Value: {{shell:printf 'hello'}}");
	});

	it("interpolates shell output in shotput.run()", async () => {
		const result = await shotput()
			.with({
				template: "Value: {{shell:printf 'ok'}}",
				templateDir: process.cwd(),
				allowedBasePaths: [process.cwd()],
				allowHttp: false,
				allowShell: true,
			})
			.run();

		expect(result.error).toBeUndefined();
		expect(result.content).toBe("Value: ok");
	});
});
