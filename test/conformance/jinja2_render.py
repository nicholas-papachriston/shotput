#!/usr/bin/env python3

import argparse
import json
from pathlib import Path
import sys

try:
    from jinja2 import Environment
except ImportError:
    print("Missing dependency: jinja2. Install with `uv add jinja2` or `pip install jinja2`.", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parent
FIXTURES_DIR = ROOT / "fixtures"
OUTPUT_FILE = ROOT / "expected.json"


def load_cases():
    all_cases = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        data = json.loads(path.read_text())
        cases = data.get("cases", [])
        for case in cases:
            case_name = case["name"]
            all_cases.append(
                {
                    "id": f"{path.stem}:{case_name}",
                    "name": case_name,
                    "template": case["template"],
                    "context": case.get("context", {}),
                }
            )
    return all_cases


def main():
    parser = argparse.ArgumentParser(description="Render conformance fixtures with CPython Jinja2")
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print rendered output map as JSON to stdout instead of writing expected.json",
    )
    args = parser.parse_args()

    env = Environment(autoescape=False)
    cases = load_cases()
    expected = {}

    for case in cases:
        rendered = env.from_string(case["template"]).render(**case["context"])
        expected[case["id"]] = rendered

    if args.stdout:
        print(json.dumps(expected, sort_keys=True))
        return

    OUTPUT_FILE.write_text(json.dumps(expected, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {len(expected)} expectations to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
