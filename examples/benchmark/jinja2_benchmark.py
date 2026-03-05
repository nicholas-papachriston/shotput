#!/usr/bin/env python3
"""
Benchmark: Jinja2 (Python)
Same large template + context as other engines; timed.
Requires: pip install jinja2 (or uv add jinja2)
"""

import argparse
import gc
import json
import math
import resource
import statistics
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
RUNS = 20
WARMUP_RUNS = 3


def build_context():
    items = []
    for i in range(ITEM_COUNT):
        value = i % 100
        tags = [f"tag-{i}-{t}" for t in range(TAGS_PER_ITEM)]
        items.append(
            {
                "id": i,
                "name": f"item-{i}",
                "value": value,
                "tags": tags,
                "is_high": value >= 50,
            }
        )
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
    lines.append(
        "{% for tag in item.tags %}{{ loop.index0 }}-{{ tag | default('n/a') }} {% endfor %}\n"
    )
    lines.append("{% endfor %}\n")
    lines.append("\n## Extra keys\n")
    for i in range(EXTRA_KEYS):
        lines.append(f"key_{i}: {{{{ key_{i} | default('') }}}}\n")
    return "".join(lines)


def format_bytes(bytes_val: float) -> str:
    abs_bytes = abs(bytes_val)
    sign = "-" if bytes_val < 0 else ""
    if abs_bytes >= 1024 * 1024:
        return f"{sign}{abs_bytes / (1024 * 1024):.2f} MB"
    if abs_bytes >= 1024:
        return f"{sign}{abs_bytes / 1024:.2f} KB"
    return f"{bytes_val:.0f} B"


def compute_ci95(values: list[float]) -> tuple[float, float]:
    mean = statistics.fmean(values)
    if len(values) <= 1:
        return (mean, mean)
    stddev = statistics.stdev(values)
    margin = 1.96 * stddev / math.sqrt(len(values))
    return (mean - margin, mean + margin)


def run_benchmark() -> dict:
    env = Environment(autoescape=False)
    context = build_context()
    template_src = get_template()
    template = env.from_string(template_src)

    for _ in range(WARMUP_RUNS):
        template.render(**context)

    rss_unit = 1024 if sys.platform == "linux" else 1
    times_ms: list[float] = []
    heap_deltas: list[float] = []
    output_length = 0

    for i in range(RUNS):
        gc.collect()
        rss_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * rss_unit
        start = time.perf_counter()
        out = template.render(**context)
        elapsed = (time.perf_counter() - start) * 1000
        gc.collect()
        rss_after = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * rss_unit
        times_ms.append(elapsed)
        heap_deltas.append(rss_after - rss_before)
        if i == 0:
            output_length = len(out)

    return {
        "name": "Jinja2 (Python)",
        "mode": "runtime",
        "timesMs": times_ms,
        "heapDeltas": heap_deltas,
        "outputLength": output_length,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    result = run_benchmark()
    if args.json:
        print(json.dumps(result))
        return

    times = result["timesMs"]
    heap_deltas = result["heapDeltas"]
    ci95 = compute_ci95(times)
    print(result["name"])
    print(f"  Data: {ITEM_COUNT} items, {FLAG_COUNT} flags, {EXTRA_KEYS} extra keys")
    print(f"  Output length: {result['outputLength']} chars")
    print(f"  Runs: {RUNS} ({WARMUP_RUNS} warmup)")
    print(f"  Median: {statistics.median(times):.2f} ms")
    print(f"  Avg: {statistics.fmean(times):.2f} ms")
    print(f"  Stddev: {statistics.stdev(times) if len(times) > 1 else 0:.2f} ms")
    print(f"  95% CI: [{ci95[0]:.2f}, {ci95[1]:.2f}] ms")
    print(
        f"  Heap delta avg: {format_bytes(statistics.fmean(heap_deltas))}  "
        f"p95: {format_bytes(sorted(heap_deltas)[int(len(heap_deltas) * 0.95) - 1])}"
    )


if __name__ == "__main__":
    main()
