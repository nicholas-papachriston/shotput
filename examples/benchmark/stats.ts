export interface Stats {
	median: number;
	mean: number;
	stddev: number;
	ci95: [number, number];
	p5: number;
	p95: number;
	min: number;
	max: number;
}

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];

	const index = (sorted.length - 1) * q;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sorted[lower];
	const weight = index - lower;
	return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function computeStats(values: number[]): Stats {
	if (values.length === 0) {
		throw new Error("computeStats requires at least one value");
	}

	const sorted = [...values].sort((a, b) => a - b);
	const count = sorted.length;
	const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
	const variance =
		count > 1
			? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1)
			: 0;
	const stddev = Math.sqrt(variance);
	const margin = count > 1 ? (1.96 * stddev) / Math.sqrt(count) : 0;
	const median = quantile(sorted, 0.5);

	return {
		median,
		mean,
		stddev,
		ci95: [mean - margin, mean + margin],
		p5: quantile(sorted, 0.05),
		p95: quantile(sorted, 0.95),
		min: sorted[0],
		max: sorted[count - 1],
	};
}
