/**
 * Shared benchmark data: large context and equivalent templates for each engine.
 * Tuned to be intensive (many variables, conditionals, large loop).
 */

export const ITEM_COUNT = 20_000;
export const FLAG_COUNT = 8_000;
export const EXTRA_KEYS = 1_000;

export const TAGS_PER_ITEM = 5;

export interface BenchmarkContext {
	title: string;
	items: Array<{
		id: number;
		name: string;
		value: number;
		tags: string[];
		isHigh: boolean;
		isFirst?: boolean;
		isLast?: boolean;
	}>;
	flags: Record<string, boolean>;
	meta: { version: string; env: string };
	[key: string]: unknown;
}

function buildContext(): BenchmarkContext {
	const items: BenchmarkContext["items"] = [];
	for (let i = 0; i < ITEM_COUNT; i++) {
		const tags: string[] = [];
		for (let t = 0; t < TAGS_PER_ITEM; t++) {
			tags.push(`tag-${i}-${t}`);
		}
		const value = i % 100;
		items.push({
			id: i,
			name: `item-${i}`,
			value,
			tags,
			isHigh: value >= 50,
			isFirst: i === 0,
			isLast: i === ITEM_COUNT - 1,
		});
	}
	const flags: Record<string, boolean> = {};
	for (let i = 0; i < FLAG_COUNT; i++) {
		flags[`flag_${i}`] = i % 3 === 0;
	}
	const extra: Record<string, string> = {};
	for (let i = 0; i < EXTRA_KEYS; i++) {
		extra[`key_${i}`] = `value-${i}`;
	}
	return {
		title: "Benchmark Template",
		items,
		flags,
		meta: { version: "1.0", env: "prod" },
		...extra,
	};
}

export const benchmarkContext = buildContext();

/** Shotput: {{context.x}}, {{#if}}, {{#each}}, __loop.first/last, nested conditionals */
export function getShotputTemplate(): string {
	const lines: string[] = [
		"# {{context.title}}\n",
		"Meta: {{context.meta.version}} / {{context.meta.env}}\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		const next = (i + 1) % FLAG_COUNT;
		lines.push(
			`{{#if context.flags.flag_${i}}}\n{{#if context.flags.flag_${next}}}\nFlag ${i}+${next} both on.\n{{else}}\nFlag ${i} on, ${next} off.\n{{/if}}\n{{else}}\n{{#if context.flags.flag_${next}}}\nFlag ${i} off, ${next} on.\n{{else}}\nFlag ${i}+${next} both off.\n{{/if}}\n{{/if}}\n`,
		);
	}
	lines.push("\n## Items\n");
	lines.push("{{#each context.items}}\n");
	lines.push("{{#if context.__loop.first}}[first] {{/if}}");
	lines.push(
		"{{context.__loop.index}}: {{context.__loop.item.name}} = {{context.__loop.item.value}}",
	);
	lines.push(
		" {{#if context.__loop.item.value >= 50}}[HIGH]{{else}}[low]{{/if}}",
	);
	lines.push(" tags: ");
	lines.push("{{#each context.__loop.item.tags}}\n");
	lines.push("{{context.__loop.index}}-{{context.__loop.item}} ");
	lines.push("{{/each}}\n");
	lines.push("{{#if context.__loop.last}} [last]{{/if}}\n");
	lines.push("{{/each}}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{context.key_${i}}}\n`);
	}
	return lines.join("");
}

/** Jinja2 / Nunjucks: nested if/for, filters (| upper, | default), loop.first/last/length */
export function getJinja2Template(): string {
	const lines: string[] = [
		"# {{ context.title | upper }}\n",
		"Meta: {{ context.meta.version }} / {{ context.meta.env }}\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		const next = (i + 1) % FLAG_COUNT;
		lines.push(
			`{% if context.flags.flag_${i} %}{% if context.flags.flag_${next} %}Flag ${i}+${next} both on.\n{% else %}Flag ${i} on, ${next} off.\n{% endif %}{% else %}{% if context.flags.flag_${next} %}Flag ${i} off, ${next} on.\n{% else %}Flag ${i}+${next} both off.\n{% endif %}{% endif %}\n`,
		);
	}
	lines.push("\n## Items (total: {{ context.items | length }})\n");
	lines.push("{% for item in context.items %}\n");
	lines.push("{% if loop.first %}[first] {% endif %}");
	lines.push(
		"{{ loop.index0 }}: {{ item.name }} = {{ item.value }}{% if item.value >= 50 %} [HIGH]{% else %} [low]{% endif %} tags: ",
	);
	lines.push(
		"{% for tag in item.tags %}{{ loop.index0 }}-{{ tag | default('n/a') }} {% endfor %}",
	);
	lines.push("{% if loop.last %} [last]{% endif %}\n");
	lines.push("{% endfor %}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{ context.key_${i} | default('') }}\n`);
	}
	return lines.join("");
}

/** Handlebars: nested if/each, @first/@last in each */
export function getHandlebarsTemplate(): string {
	const lines: string[] = [
		"# {{context.title}}\n",
		"Meta: {{context.meta.version}} / {{context.meta.env}}\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		const next = (i + 1) % FLAG_COUNT;
		lines.push(
			`{{#if context.flags.flag_${i}}}{{#if context.flags.flag_${next}}}Flag ${i}+${next} both on.\n{{else}}Flag ${i} on, ${next} off.\n{{/if}}{{else}}{{#if context.flags.flag_${next}}}Flag ${i} off, ${next} on.\n{{else}}Flag ${i}+${next} both off.\n{{/if}}{{/if}}\n`,
		);
	}
	lines.push("\n## Items\n");
	lines.push("{{#each context.items}}\n");
	lines.push("{{#if @first}}[first] {{/if}}");
	lines.push(
		"{{@index}}: {{this.name}} = {{this.value}}{{#if this.isHigh}} [HIGH]{{else}} [low]{{/if}} tags: ",
	);
	lines.push("{{#each this.tags}}{{@index}}-{{this}} {{/each}}");
	lines.push("{{#if @last}} [last]{{/if}}\n");
	lines.push("{{/each}}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{context.key_${i}}}\n`);
	}
	return lines.join("");
}

/** Mustache: sections, inverted {{^}}, {{.}} in loop, isFirst/isLast from context */
export function getMustacheTemplate(): string {
	const lines: string[] = [
		"# {{context.title}}\n",
		"Meta: {{context.meta.version}} / {{context.meta.env}}\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		lines.push(
			`{{#context.flags.flag_${i}}}\nFlag ${i} is on.\n{{/context.flags.flag_${i}}}\n{{^context.flags.flag_${i}}}\nFlag ${i} is off.\n{{/context.flags.flag_${i}}}\n`,
		);
	}
	lines.push("\n## Items\n");
	lines.push("{{#context.items}}\n");
	lines.push("{{#isFirst}}[first] {{/isFirst}}");
	lines.push(
		"{{name}} = {{value}}{{#isHigh}} [HIGH]{{/isHigh}}{{^isHigh}} [low]{{/isHigh}} tags: {{#tags}}{{.}} {{/tags}}",
	);
	lines.push("{{#isLast}} [last]{{/isLast}}\n");
	lines.push("{{/context.items}}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{context.key_${i}}}\n`);
	}
	return lines.join("");
}

/** EJS: full JS, forEach, ternary, first/last via index checks */
export function getEjsTemplate(): string {
	const lines: string[] = [
		"# <%= context.title %>\n",
		"Meta: <%= context.meta.version %> / <%= context.meta.env %>\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		lines.push(
			`<% if (context.flags.flag_${i}) { %>\nFlag ${i} is on.\n<% } else { %>\nFlag ${i} is off.\n<% } %>\n`,
		);
	}
	lines.push("\n## Items\n");
	lines.push("<% context.items.forEach(function(item, i) { %>\n");
	lines.push("<% if (i === 0) { %>[first] <% } %>");
	lines.push(
		"<%= i %>: <%= item.name %> = <%= item.value %><%= item.value >= 50 ? ' [HIGH]' : ' [low]' %> tags: <% item.tags.forEach(function(tag, ti) { %><%= ti %>-<%= tag %> <% }); %>",
	);
	lines.push("<% if (i === context.items.length - 1) { %> [last]<% } %>\n");
	lines.push("<% }); %>\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: <%= context.key_${i} %>\n`);
	}
	return lines.join("");
}

/** Nunjucks uses same syntax as Jinja2 for this benchmark. */
export function getNunjucksTemplate(): string {
	return getJinja2Template();
}
