import { describe, expect, it } from "bun:test";
import { shotput } from "../../src";
import { mergeOverrides } from "../../src/builder";
import type { AssemblyContext, SourceResult } from "../../src/hooks";
import type { SourcePlugin } from "../../src/plugins";
import type { ShotputOutput } from "../../src/types";

describe("builder base setters", () => {
	it("mergeOverrides handles nullish and merges later values", () => {
		expect(mergeOverrides(undefined, undefined)).toEqual({});
		expect(mergeOverrides(undefined, { template: "a" })).toEqual({
			template: "a",
		});
		expect(mergeOverrides({ template: "a" }, undefined)).toEqual({
			template: "a",
		});
		expect(
			mergeOverrides(
				{ template: "a", maxConcurrency: 2 },
				{ template: "b", maxRetries: 3 },
			),
		).toEqual({
			template: "b",
			maxConcurrency: 2,
			maxRetries: 3,
		});
	});

	it("applies all ShotputBase chainable setters to program overrides", () => {
		const tokenizerFn = (text: string) => text.length;
		const compressor = async (content: string) => content;
		const customPlugin: SourcePlugin = {
			name: "test-plugin",
			matches(rawPath) {
				return rawPath.startsWith("test://");
			},
			async resolve(ctx) {
				return {
					content: `resolved:${ctx.rawPath}`,
					remainingLength: ctx.remainingLength,
				};
			},
			canContainTemplates: false,
		};

		const hooks = {
			preResolve: (template: string) => template,
			postResolveSource: (result: SourceResult) => result,
			postAssembly: (ctx: AssemblyContext) => ctx,
			preOutput: (output: ShotputOutput) => output,
		};

		const program = shotput()
			.template("inline")
			.templateDir("/tmp/templates")
			.templateFile("prompt.jinja")
			.responseDir("/tmp/responses")
			.debug(true)
			.debugFile("/tmp/debug.txt")
			.maxPromptLength(1234)
			.maxBucketFiles(99)
			.maxConcurrency(7)
			.maxRetries(5)
			.retryDelay(10)
			.retryBackoffMultiplier(1.5)
			.enableContentLengthPlanning(false)
			.maxNestingDepth(9)
			.allowedBasePaths(["/tmp/templates", "/tmp/data"])
			.allowedDomains(["example.com"])
			.allowHttp(false)
			.allowFunctions(true)
			.allowedFunctionPaths(["/tmp/functions"])
			.skillsDir("/tmp/skills")
			.allowRemoteSkills(true)
			.allowedSkillSources(["anthropics/skills", "org/skills"])
			.s3AccessKeyId("akid")
			.s3SecretAccessKey("secret")
			.s3SessionToken("token")
			.s3Region("us-east-1")
			.s3Bucket("bucket")
			.awsS3Url("localhost:9000")
			.cloudflareR2Url("acct.r2.cloudflarestorage.com")
			.s3VirtualHostedStyle(true)
			.httpTimeout(5000)
			.httpStreamThresholdBytes(2048)
			.context({ env: "test" })
			.expressionEngine("safe")
			.templateSyntax("jinja2")
			.jinjaAutoescape(true)
			.tokenizer(tokenizerFn)
			.tokenizerWorker("/tmp/tokenizer-worker.ts")
			.compressor(compressor)
			.hooks(hooks)
			.outputMode("messages")
			.sectionBudgets({ system: 1000, user: 2000 })
			.sectionRoles({ system: "system", user: "user", reply: "assistant" })
			.customSources([customPlugin])
			.commandsDir("/tmp/commands")
			.parseSubagentFrontmatter(true)
			.subagentsDir("/tmp/subagents")
			.redis("redis://localhost:6379")
			.sqlite()
			.sqlite(false)
			.build();

		const overrides = (
			program as unknown as { baseOverrides: Record<string, unknown> }
		).baseOverrides;
		expect(overrides.template).toBe("inline");
		expect(overrides.templateDir).toBe("/tmp/templates");
		expect(overrides.templateFile).toBe("prompt.jinja");
		expect(overrides.responseDir).toBe("/tmp/responses");
		expect(overrides.debug).toBe(true);
		expect(overrides.debugFile).toBe("/tmp/debug.txt");
		expect(overrides.maxPromptLength).toBe(1234);
		expect(overrides.maxBucketFiles).toBe(99);
		expect(overrides.maxConcurrency).toBe(7);
		expect(overrides.maxRetries).toBe(5);
		expect(overrides.retryDelay).toBe(10);
		expect(overrides.retryBackoffMultiplier).toBe(1.5);
		expect(overrides.enableContentLengthPlanning).toBe(false);
		expect(overrides.maxNestingDepth).toBe(9);
		expect(overrides.allowedBasePaths).toEqual(["/tmp/templates", "/tmp/data"]);
		expect(overrides.allowedDomains).toEqual(["example.com"]);
		expect(overrides.allowHttp).toBe(false);
		expect(overrides.allowFunctions).toBe(true);
		expect(overrides.allowedFunctionPaths).toEqual(["/tmp/functions"]);
		expect(overrides.skillsDir).toBe("/tmp/skills");
		expect(overrides.allowRemoteSkills).toBe(true);
		expect(overrides.allowedSkillSources).toEqual([
			"anthropics/skills",
			"org/skills",
		]);
		expect(overrides.s3AccessKeyId).toBe("akid");
		expect(overrides.s3SecretAccessKey).toBe("secret");
		expect(overrides.s3SessionToken).toBe("token");
		expect(overrides.s3Region).toBe("us-east-1");
		expect(overrides.s3Bucket).toBe("bucket");
		expect(overrides.awsS3Url).toBe("localhost:9000");
		expect(overrides.cloudflareR2Url).toBe("acct.r2.cloudflarestorage.com");
		expect(overrides.s3VirtualHostedStyle).toBe(true);
		expect(overrides.httpTimeout).toBe(5000);
		expect(overrides.httpStreamThresholdBytes).toBe(2048);
		expect(overrides.context).toEqual({ env: "test" });
		expect(overrides.expressionEngine).toBe("safe");
		expect(overrides.templateSyntax).toBe("jinja2");
		expect(overrides.jinjaAutoescape).toBe(true);
		expect(overrides.tokenizer).toBe(tokenizerFn);
		expect(overrides.tokenizerWorker).toBe("/tmp/tokenizer-worker.ts");
		expect(overrides.compressor).toBe(compressor);
		expect(overrides.hooks).toBe(hooks);
		expect(overrides.outputMode).toBe("messages");
		expect(overrides.sectionBudgets).toEqual({ system: 1000, user: 2000 });
		expect(overrides.sectionRoles).toEqual({
			system: "system",
			user: "user",
			reply: "assistant",
		});
		expect(overrides.customSources).toEqual([customPlugin]);
		expect(overrides.commandsDir).toBe("/tmp/commands");
		expect(overrides.parseSubagentFrontmatter).toBe(true);
		expect(overrides.subagentsDir).toBe("/tmp/subagents");
		expect(overrides.redis).toBe("redis://localhost:6379");
		expect(overrides.sqlite).toBe(false);
	});
});
