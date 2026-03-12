/**
 * Render Markdown using Bun's built-in Markdown API (GFM extensions supported).
 * @see https://bun.com/docs/runtime/markdown
 */

interface BunMarkdown {
	html(markdown: string, options?: Record<string, unknown>): string;
	render(
		markdown: string,
		callbacks: Record<
			string,
			(children: string, meta?: unknown) => string | null | undefined
		>,
		options?: Record<string, unknown>,
	): string;
}

const getMarkdownApi = (): BunMarkdown => {
	const bunWithMarkdown = Bun as unknown as { markdown?: BunMarkdown };
	if (bunWithMarkdown.markdown === undefined) {
		throw new Error("Bun.markdown API is unavailable in this runtime");
	}
	return bunWithMarkdown.markdown;
};

/**
 * Convert Markdown to HTML. GFM extensions (tables, strikethrough, task lists) are enabled by default.
 *
 * @param text - Markdown source
 * @param options - Parser options (tables, strikethrough, tasklists, autolinks, headings, etc.)
 * @returns HTML string
 *
 * @example
 * ```ts
 * const html = markdownToHtml("# Hello **world**");
 * // "<h1>Hello <strong>world</strong></h1>\n"
 * ```
 */
export function markdownToHtml(
	text: string,
	options?: Record<string, unknown>,
): string {
	return getMarkdownApi().html(text, options);
}

/**
 * Convert Markdown to plain text by stripping formatting. Useful for including markdown
 * content in prompts without HTML or for length estimation.
 *
 * @param text - Markdown source
 * @returns Plain text (headings, paragraphs, links etc. as raw text)
 */
export function markdownToPlaintext(text: string): string {
	return getMarkdownApi().render(
		text,
		{
			heading: (children) => children,
			paragraph: (children) => children,
			blockquote: (children) => children,
			code: (children) => children,
			list: (children) => children,
			listItem: (children) => children,
			hr: () => "",
			table: (children) => children,
			thead: (children) => children,
			tbody: (children) => children,
			tr: (children) => children,
			th: (children) => children,
			td: (children) => children,
			html: (children) => children,
			strong: (children) => children,
			emphasis: (children) => children,
			link: (children) => children,
			image: () => "",
			codespan: (children) => children,
			strikethrough: (children) => children,
			text: (children) => children,
		},
		{ tables: true, strikethrough: true, tasklists: true },
	);
}
