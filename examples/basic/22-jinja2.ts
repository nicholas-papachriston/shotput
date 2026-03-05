import { shotput } from "../../src";

/**
 * Basic native Jinja2 example:
 * - templateSyntax("jinja2")
 * - set / if / for / macro
 * - filters (upper)
 */
const template = [
	"{% set label = user.name | upper %}",
	"User: {{ label }}",
	"{% if user.enabled %}",
	"Status: ENABLED",
	"{% else %}",
	"Status: DISABLED",
	"{% endif %}",
	"Projects:",
	"{% for project in user.projects %}- {{ project }}",
	"{% else %}- none",
	"{% endfor %}",
	"{% macro badge(v) %}[{{ v | upper }}]{% endmacro %}",
	"Badge: {{ badge('ok') }}",
].join("\n");

const result = await shotput()
	.templateSyntax("jinja2")
	.template(template)
	.context({
		user: {
			name: "nick",
			enabled: true,
			projects: ["shotput", "jinja-native"],
		},
	})
	.run();

if (result.error !== undefined) {
	console.error("Jinja example failed:", result.error);
	process.exit(1);
}

console.log(result.content);
