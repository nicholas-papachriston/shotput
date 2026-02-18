#!/usr/bin/env python3
"""
Benchmark: Jinja2 (Python)
Same large template + context as other engines; timed.
Requires: pip install jinja2 (or uv add jinja2)
"""

import json
import sys
import time

try:
	from jinja2 import Environment
except ImportError:
	print("Install Jinja2: uv add jinja2  or  pip install jinja2", file=sys.stderr)
	sys.exit(1)

ITEM_COUNT = 2000
FLAG_COUNT = 80
EXTRA_KEYS = 100
RUNS = 5


def build_context():
	items = [{"id": i, "name": f"item-{i}", "value": i % 100} for i in range(ITEM_COUNT)]
	flags = {f"flag_{i}": (i % 3 == 0) for i in range(FLAG_COUNT)}
	extra = {f"key_{i}": f"value-{i}" for i in range(EXTRA_KEYS)}
	return {
		"title": "Benchmark Template",
		"items": items,
		"flags": flags,
		"meta": {"version": "1.0", "env": "prod"},
		**extra,
	}


def get_template():
	# Use top-level vars (items, title, flags, meta, key_0...) not context.items:
	# dict.items is a built-in method; context.items would resolve to that.
	lines = [
		"# {{ title }}\n",
		"Meta: {{ meta.version }} / {{ meta.env }}\n",
	]
	for i in range(FLAG_COUNT):
		lines.append(
			f"{{% if flags['flag_{i}'] %}}\nFlag {i} is on.\n{{% else %}}\nFlag {i} is off.\n{{% endif %}}\n"
		)
	lines.append("\n## Items\n")
	lines.append("{% for item in items %}\n")
	lines.append("{{ loop.index0 }}: {{ item.name }} = {{ item.value }}\n")
	lines.append("{% endfor %}\n")
	lines.append("\n## Extra keys\n")
	for i in range(EXTRA_KEYS):
		lines.append(f"key_{i}: {{{{ key_{i} }}}}\n")
	return "".join(lines)


def main():
	env = Environment(autoescape=False)
	context = build_context()
	template_src = get_template()
	template = env.from_string(template_src)

	# Pass top-level vars (items, title, flags, meta, key_0...); avoid context=dict
	# because dict.items shadows our "items" key.
	# Warmup
	template.render(**context)

	times = []
	for i in range(RUNS):
		start = time.perf_counter()
		out = template.render(**context)
		elapsed = (time.perf_counter() - start) * 1000
		times.append(elapsed)
		if i == 0:
			print("Output length:", len(out), "chars")

	times.sort()
	median = times[len(times) // 2]
	avg = sum(times) / len(times)
	print("Jinja2 (Python)")
	print(f"  Data: {ITEM_COUNT} items, {FLAG_COUNT} flags, {EXTRA_KEYS} extra keys")
	print(f"  Median: {median:.2f} ms")
	print(f"  Avg: {avg:.2f} ms")


if __name__ == "__main__":
	main()
