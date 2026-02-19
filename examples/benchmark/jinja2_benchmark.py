#!/usr/bin/env python3
"""
Benchmark: Jinja2 (Python)
Same large template + context as other engines; timed.
Requires: pip install jinja2 (or uv add jinja2)
"""

import resource
import sys
import time

try:
	from jinja2 import Environment
except ImportError:
	print("Install Jinja2: uv add jinja2  or  pip install jinja2", file=sys.stderr)
	sys.exit(1)

ITEM_COUNT = 20_000
FLAG_COUNT = 8_000
EXTRA_KEYS = 1_000
TAGS_PER_ITEM = 5
RUNS = 5


def build_context():
	items = []
	for i in range(ITEM_COUNT):
		value = i % 100
		tags = [f"tag-{i}-{t}" for t in range(TAGS_PER_ITEM)]
		items.append({
			"id": i,
			"name": f"item-{i}",
			"value": value,
			"tags": tags,
			"is_high": value >= 50,
		})
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
	# Use top-level vars (items, title, flags, meta, key_0...) not context.items
	lines = [
		"# {{ title | upper }}\n",
		"Meta: {{ meta.version }} / {{ meta.env }}\n",
	]
	for i in range(FLAG_COUNT):
		next_i = (i + 1) % FLAG_COUNT
		lines.append(
			f"{{% if flags['flag_{i}'] %}}"
			f"{{% if flags['flag_{next_i}'] %}}Flag {i}+{next_i} both on.\n"
			f"{{% else %}}Flag {i} on, {next_i} off.\n{{% endif %}}"
			f"{{% else %}}"
			f"{{% if flags['flag_{next_i}'] %}}Flag {i} off, {next_i} on.\n"
			f"{{% else %}}Flag {i}+{next_i} both off.\n{{% endif %}}"
			f"{{% endif %}}\n"
		)
	lines.append("\n## Items\n")
	lines.append("{% for item in items %}\n")
	lines.append(
		"{{ loop.index0 }}: {{ item.name }} = {{ item.value }}"
		"{% if item.is_high %} [HIGH]{% else %} [low]{% endif %} tags: "
	)
	lines.append("{% for tag in item.tags %}{{ loop.index0 }}-{{ tag | default('n/a') }} {% endfor %}\n")
	lines.append("{% endfor %}\n")
	lines.append("\n## Extra keys\n")
	for i in range(EXTRA_KEYS):
		lines.append(f"key_{i}: {{{{ key_{i} | default('') }}}}\n")
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

	def format_bytes(bytes_val: int) -> str:
		if bytes_val >= 1024 * 1024:
			return f"{bytes_val / (1024 * 1024):.2f} MB"
		if bytes_val >= 1024:
			return f"{bytes_val / 1024:.2f} KB"
		return f"{bytes_val} B"

	# ru_maxrss: KB on Linux, bytes on macOS/BSD
	rss_unit = 1024 if sys.platform == "linux" else 1

	times = []
	heap_used = []
	for i in range(RUNS):
		start = time.perf_counter()
		out = template.render(**context)
		elapsed = (time.perf_counter() - start) * 1000
		times.append(elapsed)
		rusage = resource.getrusage(resource.RUSAGE_SELF)
		heap_used.append(rusage.ru_maxrss * rss_unit)
		if i == 0:
			print("Output length:", len(out), "chars")

	times.sort()
	median = times[len(times) // 2]
	avg = sum(times) / len(times)
	heap_max = max(heap_used)
	heap_avg = sum(heap_used) / len(heap_used)
	print("Jinja2 (Python)")
	print(f"  Data: {ITEM_COUNT} items, {FLAG_COUNT} flags, {EXTRA_KEYS} extra keys")
	print(f"  Median: {median:.2f} ms")
	print(f"  Avg: {avg:.2f} ms")
	print(f"  Heap max: {format_bytes(heap_max)}")
	print(f"  Heap avg: {format_bytes(heap_avg)}")


if __name__ == "__main__":
	main()
