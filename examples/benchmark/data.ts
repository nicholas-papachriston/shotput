/**
 * Shared benchmark data: large context and equivalent templates for each engine.
 * Tuned to be intensive (many variables, conditionals, large loop).
 */

export const ITEM_COUNT = 20_0000;
export const FLAG_COUNT = 8_000;
export const EXTRA_KEYS = 10_000;

export interface BenchmarkContext {
	title: string;
	items: Array<{ id: number; name: string; value: number }>;
	flags: Record<string, boolean>;
	meta: { version: string; env: string };
	[key: string]: unknown;
}

function buildContext(): BenchmarkContext {
	const items: BenchmarkContext["items"] = [];
	for (let i = 0; i < ITEM_COUNT; i++) {
		items.push({
			id: i,
			name: `item-${i}`,
			value: i % 100,
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

/** Shotput: {{context.x}}, {{#if}}, {{#each}}, {{context.__loop.item}} */
export function getShotputTemplate(): string {
	const lines: string[] = [
		"# {{context.title}}\n",
		"Meta: {{context.meta.version}} / {{context.meta.env}}\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		lines.push(
			`{{#if context.flags.flag_${i}}}\nFlag ${i} is on.\n{{else}}\nFlag ${i} is off.\n{{/if}}\n`,
		);
	}
	lines.push("\n## Items\n");
	lines.push("{{#each context.items}}\n");
	lines.push(
		"{{context.__loop.index}}: {{context.__loop.item.name}} = {{context.__loop.item.value}}\n",
	);
	lines.push("{{/each}}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{context.key_${i}}}\n`);
	}
	return lines.join("");
}

/** Jinja2 / Nunjucks style: {{ context.x }}, {% if %}, {% for %} */
export function getJinja2Template(): string {
	const lines: string[] = [
		"# {{ context.title }}\n",
		"Meta: {{ context.meta.version }} / {{ context.meta.env }}\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		lines.push(
			`{% if context.flags.flag_${i} %}\nFlag ${i} is on.\n{% else %}\nFlag ${i} is off.\n{% endif %}\n`,
		);
	}
	lines.push("\n## Items\n");
	lines.push("{% for item in context.items %}\n");
	lines.push("{{ loop.index0 }}: {{ item.name }} = {{ item.value }}\n");
	lines.push("{% endfor %}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{ context.key_${i} }}\n`);
	}
	return lines.join("");
}

/** Handlebars: {{context.x}}, {{#if}}, {{#each context.items}} {{this}} */
export function getHandlebarsTemplate(): string {
	const lines: string[] = [
		"# {{context.title}}\n",
		"Meta: {{context.meta.version}} / {{context.meta.env}}\n",
	];
	for (let i = 0; i < FLAG_COUNT; i++) {
		lines.push(
			`{{#if context.flags.flag_${i}}}\nFlag ${i} is on.\n{{else}}\nFlag ${i} is off.\n{{/if}}\n`,
		);
	}
	lines.push("\n## Items\n");
	lines.push("{{#each context.items}}\n");
	lines.push("{{@index}}: {{this.name}} = {{this.value}}\n");
	lines.push("{{/each}}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{context.key_${i}}}\n`);
	}
	return lines.join("");
}

/** Mustache: {{context.x}}, {{#context.flags.flag_i}}, {{#context.items}} */
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
	lines.push("{{name}} = {{value}}\n");
	lines.push("{{/context.items}}\n");
	lines.push("\n## Extra keys\n");
	for (let i = 0; i < EXTRA_KEYS; i++) {
		lines.push(`key_${i}: {{context.key_${i}}}\n`);
	}
	return lines.join("");
}

/** EJS: <%= context.x %>, <% if %>, <% context.items.forEach %> */
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
	lines.push("<%= i %>: <%= item.name %> = <%= item.value %>\n");
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
