#!/usr/bin/env bun

/**
 * Example 06: HTTP Resources
 *
 * This example demonstrates fetching content from HTTP/HTTPS URLs
 * and including them in your templates. This is useful for:
 * - Including remote configuration files
 * - Fetching API responses
 * - Including content from web services
 *
 * Usage:
 *   bun run examples/basic/06-http.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("06-http");
const templateDir = join(import.meta.dir, "../output/06-http");
mkdirSync(templateDir, { recursive: true });
const templateContent = `# HTTP Resource Example

## Example 1: Fetch JSON Data

Fetching JSON placeholder data from JSONPlaceholder API:

{{https://jsonplaceholder.typicode.com/posts/1}}

## Example 2: Fetch Plain Text

Fetching plain text content:

{{https://raw.githubusercontent.com/sindresorhus/awesome/main/readme.md}}

---

Note: HTTP resources are fetched at template processing time.
Ensure you have network connectivity and the URLs are accessible.
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, templateContent);

try {
  const result = await shotput({
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    allowHttp: true, // IMPORTANT: Must enable HTTP fetching
    debug: true,
    debugFile: join(templateDir, "template-debug.md"),
  });

  log.info(result);

  const apiTemplate = `# API Data Example

## User Data from API

{{https://jsonplaceholder.typicode.com/users/1}}

## Todo Item

{{https://jsonplaceholder.typicode.com/todos/1}}

## Comments

{{https://jsonplaceholder.typicode.com/comments/1}}

---

API responses are included directly in the template.
`;

  const apiTemplatePath = join(templateDir, "api-template.md");
  writeFileSync(apiTemplatePath, apiTemplate);

  const apiResult = await shotput({
    templateDir,
    templateFile: "api-template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    allowHttp: true,
    debug: true,
    debugFile: join(templateDir, "api-template-debug.md"),
  });

  log.info(apiResult);
} catch (error) {
  log.error(error);
  log.error("Possible causes:");
  log.error("- Network connectivity issues");
  log.error("- URL is not accessible");
  log.error("- allowHttp is not set to true");
  log.error("- Remote server timeout");

}

/**
 * Key Takeaways:
 *
 * 1. Enabling HTTP:
 *    - MUST set allowHttp: true in configuration
 *    - Security feature to prevent unintended remote fetches
 *
 * 2. Supported Protocols:
 *    - http:// - HTTP resources
 *    - https:// - HTTPS resources (recommended)
 *
 * 3. URL Format:
 *    - {{http://example.com/data.json}}
 *    - {{https://api.example.com/endpoint}}
 *    - Full URL required (no relative URLs)
 *
 * 4. Content Types:
 *    - JSON responses are included as-is
 *    - Plain text is included directly
 *    - HTML is included as raw HTML
 *    - Binary content may cause issues
 *
 * 5. Performance Considerations:
 *    - HTTP fetches add latency to template processing
 *    - Each URL is fetched sequentially
 *    - Consider caching for frequently accessed URLs
 *    - Set appropriate timeout values
 *
 * 6. Error Handling:
 *    - Network errors are logged in metadata
 *    - Failed fetches don't stop other processing
 *    - Check metadata.errors for fetch failures
 *
 * 7. Security:
 *    - Only fetch from trusted URLs
 *    - Be aware of sensitive data in URLs
 *    - Consider rate limiting for public APIs
 *    - Validate content if processing user input
 *
 * 8. Common Use Cases:
 *    - Fetching API configurations
 *    - Including remote documentation
 *    - Pulling data from internal services
 *    - Aggregating content from multiple sources
 *
 * 9. Best Practices:
 *    - Use HTTPS when possible for security
 *    - Handle fetch failures gracefully
 *    - Consider request timeouts
 *    - Be mindful of API rate limits
 *    - Cache responses when appropriate
 */
