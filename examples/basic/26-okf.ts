#!/usr/bin/env bun

/**
 * Example 26: Open Knowledge Format (OKF)
 *
 * Demonstrates first-class OKF parsing. When parseOkf(true) is set, Shotput
 * prefers OKF frontmatter as document metadata: output.okf for the root
 * template, and resultMetadata[].okf for included markdown sources (body only
 * in the assembled prompt).
 *
 * Usage:
 *   bun run examples/basic/26-okf.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseOkfDocument, shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("26-okf");
const examplesDir = join(process.cwd(), "examples");
const outputDir = join(examplesDir, "output/26-okf");
const dataDir = join(examplesDir, "data/okf");
mkdirSync(outputDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const findingPath = join(dataDir, "finding.md");
writeFileSync(
	findingPath,
	`---
type: Finding
title: Sample research finding
description: Demonstrates OKF as preferred document metadata in Shotput.
tags:
  - example
  - okf
timestamp: 2026-07-27T20:00:00Z
---
# Sample research finding

The assembled prompt includes this body without the YAML header.
`,
);

const standalone = parseOkfDocument(await Bun.file(findingPath).text(), {
	path: findingPath,
});
log.info(`Standalone parse: ${JSON.stringify(standalone?.okf)}`);

const template = `---
type: Playbook
title: OKF-aware system prompt
description: Root template using OKF metadata.
tags: [prompts, okf]
timestamp: 2026-07-27T20:00:00Z
---
# System

Use the following finding when answering:

{{./finding.md}}
`;

const result = await shotput()
	.template(template)
	.templateDir(dataDir)
	.allowedBasePaths([dataDir])
	.parseOkf(true)
	.allowHttp(false)
	.run();

if (result.error) {
	throw result.error;
}

log.info(`Root OKF: ${JSON.stringify(result.okf)}`);
log.info(`Source metadata: ${JSON.stringify(result.metadata.resultMetadata)}`);
await Bun.write(join(outputDir, "assembled.md"), result.content ?? "");
console.log("Wrote", join(outputDir, "assembled.md"));
console.log("Root type:", result.okf?.type, "title:", result.okf?.title);
