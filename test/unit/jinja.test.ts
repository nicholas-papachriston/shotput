import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileShotputTemplate, shotput } from "../../src";

describe("jinja2 template syntax", () => {
	it("renders jinja2 if/for expressions", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				"{% if enabled %}{% for n in nums %}{{ n }}{% endfor %}{% else %}off{% endif %}",
			)
			.context({ enabled: true, nums: [1, 2, 3] })
			.run();
		expect(out.content).toBe("123");
	});

	it("renders macros", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{% macro badge() %}<b>ok</b>{% endmacro %}{{ badge() }}")
			.run();
		expect(out.content).toBe("<b>ok</b>");
	});

	it("supports compiled jinja2 templates", async () => {
		const program = compileShotputTemplate(
			"{% for name in names %}{{ name|upper }} {% endfor %}",
			{ templateSyntax: "jinja2" },
		);
		const out = await program.with({ context: { names: ["a", "b"] } }).run();
		expect(out.content).toBe("A B ");
	});

	it("allows shotput interpolation after jinja rendering", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.allowedBasePaths([process.cwd()])
			.templateDir(process.cwd())
			.template("{{ includePath }}")
			.context({ includePath: "{{test/fixtures/test.txt}}" })
			.run();
		expect(out.content).toContain("Hello World");
	});

	it("auto-detects jinja mode from .jinja templateFile", async () => {
		const tmp = mkdtempSync(join("/tmp", "shotput-jinja-"));
		try {
			writeFileSync(
				join(tmp, "prompt.jinja"),
				"{% if enabled %}ok{% else %}off{% endif %}",
			);
			const out = await shotput()
				.templateDir(tmp)
				.templateFile("prompt.jinja")
				.allowedBasePaths([tmp])
				.context({ enabled: true })
				.run();
			expect(out.content).toBe("ok");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("supports include preprocessing with nested relative includes", async () => {
		const tmp = mkdtempSync(join("/tmp", "shotput-jinja-"));
		try {
			const partials = join(tmp, "partials");
			mkdirSync(join(partials, "nested"), { recursive: true });
			writeFileSync(
				join(tmp, "main.jinja"),
				"{% include './partials/a.jinja' %}",
			);
			writeFileSync(
				join(partials, "a.jinja"),
				"{% include './nested/b.jinja' %}",
			);
			writeFileSync(
				join(partials, "nested/b.jinja"),
				"Hello {{ user.name | upper }}",
			);
			const out = await shotput()
				.templateSyntax("jinja2")
				.templateDir(tmp)
				.templateFile("main.jinja")
				.allowedBasePaths([tmp])
				.context({ user: { name: "nick" } })
				.run();
			expect(out.content).toBe("Hello NICK");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("supports jinja: format references", async () => {
		const tmp = mkdtempSync(join("/tmp", "shotput-jinja-"));
		try {
			writeFileSync(join(tmp, "card.jinja"), "Card {{ user.name | upper }}");
			const out = await shotput()
				.template("{{jinja:./card.jinja}}")
				.templateDir(tmp)
				.allowedBasePaths([tmp])
				.context({ user: { name: "nick" } })
				.run();
			expect(out.content).toBe("Card NICK");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("supports loop metadata variables", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				"{% for n in nums %}[{{ loop.index0 }}:{{ loop.index }}:{{ loop.first }}:{{ loop.last }}:{{ loop.length }}={{ n }}]{% endfor %}",
			)
			.context({ nums: ["a", "b", "c"] })
			.run();
		expect(out.content).toBe(
			"[0:1:true:false:3=a][1:2:false:false:3=b][2:3:false:true:3=c]",
		);
	});

	it("supports logical expressions with and/or/not", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% if enabled and not blocked %}A{% else %}B{% endif %}",
					"{% if enabled or backup %}C{% else %}D{% endif %}",
				].join("|"),
			)
			.context({ enabled: true, blocked: false, backup: false })
			.run();
		expect(out.content).toBe("A|C");
	});

	it("supports default filter and defined/undefined tests", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{{ context.missing | default('fallback') }}",
					"{% if context.missing is undefined %}U{% else %}N{% endif %}",
					"{% if context.present is defined %}D{% else %}X{% endif %}",
				].join("|"),
			)
			.context({ present: 1 })
			.run();
		expect(out.content).toBe("fallback|U|D");
	});

	it("returns an error when include target is missing", async () => {
		const tmp = mkdtempSync(join("/tmp", "shotput-jinja-"));
		try {
			writeFileSync(join(tmp, "main.jinja"), "{% include './missing.jinja' %}");
			const out = await shotput()
				.templateSyntax("jinja2")
				.templateDir(tmp)
				.templateFile("main.jinja")
				.allowedBasePaths([tmp])
				.run();
			expect(out.error).toBeDefined();
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("handles comments and raw blocks", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("A{# hidden #}B{% raw %}{{ untouched }}{% endraw %}C")
			.run();
		expect(out.content).toBe("AB{{ untouched }}C");
	});

	it("supports tuple unpacking in for loops", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{% for k, v in pairs %}{{ k }}={{ v }};{% endfor %}")
			.context({
				pairs: [
					["a", 1],
					["b", 2],
				],
			})
			.run();
		expect(out.content).toBe("a=1;b=2;");
	});

	it("supports with assignments referencing previous vars", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{% with x = 2, y = x + 3 %}{{ x }}-{{ y }}{% endwith %}")
			.run();
		expect(out.content).toBe("2-5");
	});

	it("supports negated tests with 'is not'", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				"{% if value is not divisibleby(2) %}odd{% else %}even{% endif %}",
			)
			.context({ value: 3 })
			.run();
		expect(out.content).toBe("odd");
	});

	it("ignores unsupported statements without crashing", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{% block body %}X{% endblock %}Y")
			.run();
		expect(out.content).toBe("XY");
	});

	it("stops deep include expansion at max depth safely", async () => {
		const tmp = mkdtempSync(join("/tmp", "shotput-jinja-"));
		try {
			for (let i = 0; i < 12; i++) {
				const next = i + 1;
				writeFileSync(
					join(tmp, `f${i}.jinja`),
					i === 11 ? "END" : `{% include "./f${next}.jinja" %}`,
				);
			}
			const out = await shotput()
				.templateSyntax("jinja2")
				.templateDir(tmp)
				.templateFile("f0.jinja")
				.allowedBasePaths([tmp])
				.run();
			expect(out.error).toBeUndefined();
			expect(out.content).toBe("");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("supports numeric comparison operators", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% if x >= 3 %}A{% else %}a{% endif %}",
					"{% if x <= 3 %}B{% else %}b{% endif %}",
					"{% if x > 2 %}C{% else %}c{% endif %}",
					"{% if x < 4 %}D{% else %}d{% endif %}",
					"{% if x != 4 %}E{% else %}e{% endif %}",
					"{% if x == 3 %}F{% else %}f{% endif %}",
				].join(""),
			)
			.context({ x: 3 })
			.run();
		expect(out.content).toBe("ABCDEF");
	});

	it("supports odd/even tests", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% if a is odd %}odd{% else %}not-odd{% endif %}",
					"{% if b is even %}even{% else %}not-even{% endif %}",
				].join("|"),
			)
			.context({ a: 3, b: 4 })
			.run();
		expect(out.content).toBe("odd|even");
	});

	it("supports length filter for strings and objects", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{{ text | length }}|{{ obj | length }}")
			.context({ text: "abcd", obj: { a: 1, b: 2, c: 3 } })
			.run();
		expect(out.content).toBe("4|3");
	});

	it("treats scalar values as single-item iterables in for loops", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{% for v in value %}[{{ v }}]{% else %}empty{% endfor %}")
			.context({ value: "solo" })
			.run();
		expect(out.content).toBe("[solo]");
	});

	it("supports include tags with trim markers", async () => {
		const tmp = mkdtempSync(join("/tmp", "shotput-jinja-"));
		try {
			writeFileSync(join(tmp, "partial.jinja"), "X");
			writeFileSync(
				join(tmp, "main.jinja"),
				"A{%- include './partial.jinja' -%}B",
			);
			const out = await shotput()
				.templateSyntax("jinja2")
				.templateDir(tmp)
				.templateFile("main.jinja")
				.allowedBasePaths([tmp])
				.run();
			expect(out.content).toBe("AXB");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("falls back from AOT and still renders control flow", async () => {
		// Invalid JS identifier in `{% set %}` breaks AOT codegen and forces interpreter fallback.
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% set bad-name = 1 %}",
					"{% if x >= 2 %}I{% else %}O{% endif %}",
					"{% for n in nums %}{{ n }}{% else %}E{% endfor %}",
				].join(""),
			)
			.context({ x: 2, nums: [7, 8] })
			.run();
		expect(out.content).toBe("I78");
	});

	it("falls back from AOT and still supports for-else and tests", async () => {
		// Invalid loop target name forces interpreter fallback.
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% for bad-name in nums %}X{% else %}Z{% endfor %}",
					"{% if value is divisibleby(3) %}D{% else %}N{% endif %}",
				].join("|"),
			)
			.context({ nums: [], value: 9 })
			.run();
		expect(out.content).toBe("Z|D");
	});

	it("supports macro args with expression calls", async () => {
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% macro wrap(v) %}[{{ v | upper }}]{% endmacro %}",
					"{% set normalized = user.name | trim %}",
					"{{ wrap(normalized) }}",
				].join(""),
			)
			.context({ user: { name: "  nick  " } })
			.run();
		expect(out.content).toBe("[NICK]");
	});

	it("uses interpreter fallback for logical and js expressions", async () => {
		// Invalid identifier in set forces AOT compile failure.
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% set bad-name = 1 %}",
					"{{ (x + 1) * 2 }}",
					"{% if enabled and (count > 1 or not blocked) %}T{% else %}F{% endif %}",
				].join("|"),
			)
			.context({ x: 2, enabled: true, count: 2, blocked: false })
			.run();
		expect(out.content).toBe("|6|T");
	});

	it("uses interpreter fallback for macro call expression invocation", async () => {
		// Invalid identifier in set forces renderNodes/compileExpr call path.
		const out = await shotput()
			.templateSyntax("jinja2")
			.template(
				[
					"{% set bad-name = 1 %}",
					"{% macro shout(v) %}{{ v | upper }}{% endmacro %}",
					"{{ shout('ok') }}",
				].join(""),
			)
			.run();
		expect(out.content).toBe("OK");
	});

	it("returns empty for non-function call expressions in fallback", async () => {
		// Invalid identifier in set forces interpreter fallback.
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{% set bad-name = 1 %}{{ user.name() }}")
			.context({ user: { name: "nick" } })
			.run();
		expect(out.content).toBe("");
	});

	it("covers logical or evaluator branch in fallback mode", async () => {
		// Invalid identifier in set forces interpreter fallback.
		const out = await shotput()
			.templateSyntax("jinja2")
			.template("{% set bad-name = 1 %}{{ left or right }}|{{ a or b }}")
			.context({ left: "", right: "YES", a: 0, b: "" })
			.run();
		expect(out.content).toBe("YES|false");
	});
});
