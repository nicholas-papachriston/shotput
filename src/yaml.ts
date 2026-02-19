/**
 * Parse YAML string using Bun's built-in YAML support.
 * @see https://bun.com/docs/runtime/yaml
 */
export function parseYaml(text: string): unknown {
	return (Bun as unknown as { YAML: { parse(s: string): unknown } }).YAML.parse(
		text,
	);
}
