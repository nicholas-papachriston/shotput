#!/usr/bin/env bun

/**
 * Example 20: Format utilities - XML
 *
 * Uses {{xml:path}} to parse XML and expand as formatted XML in the template.
 * Also demonstrates parseXml() and parseS3ListResponse() programmatically.
 *
 * Usage:
 *   bun run examples/basic/20-format-xml.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseS3ListResponse, parseXml, shotput } from "../../src/index";
import { getLogger } from "../../src/logger";

const log = getLogger("20-format-xml");
const outputDir = join(import.meta.dir, "../output/20-format-xml");
mkdirSync(outputDir, { recursive: true });

const template = "{{xml:../../data/sample.xml}}";

try {
	const result = await shotput({
		template,
		templateDir: outputDir,
		responseDir: outputDir,
		allowedBasePaths: [join(import.meta.dir, "..")],
	});

	const xmlContent = result.content ?? "";
	writeFileSync(join(outputDir, "output.xml"), xmlContent);
	const root = parseXml(xmlContent);

	log.info(`Root tag: ${root.tag}`);
	console.log("--- parseXml() ---");
	console.log("Root tag:", root.tag);
	console.log("Children:", root.children.length);
	for (const child of root.children) {
		const textPreview = child.text?.slice(0, 30);
		console.log(`  - ${child.tag}:`, child.attributes, textPreview ?? "");
	}

	// S3 ListObjects response example
	const s3ListXml = `
<ListBucketResult>
  <Contents><Key>logs/2024/01/app.log</Key></Contents>
  <Contents><Key>logs/2024/01/api.log</Key></Contents>
  <Contents><Key>data/config.json</Key></Contents>
</ListBucketResult>`;
	const keys = parseS3ListResponse(s3ListXml);
	console.log("--- parseS3ListResponse() ---");
	console.log("Keys:", keys);
} catch (error) {
	log.error(error);
}

/**
 * Key takeaways:
 * - {{xml:path}} parses the file and expands as formatted XML in the template.
 * - parseXml(xmlString) returns the root XmlNode (tag, attributes, children, text).
 * - parseS3ListResponse(xmlString) extracts <Key> values from S3 ListObjects XML.
 * - createXmlParser() returns { parse, parseS3ListResponse } for a custom parser instance.
 */
