/** Gaussian KDE; returns use decimal units (0.01 = one percentage point).
 * Silverman's robust rule follows statsmodels bw_silverman, including the
 * sample-SD fallback when the interquartile range is zero.
 * https://www.statsmodels.org/stable/_modules/statsmodels/nonparametric/bandwidths.html
 */
export type DensityPoint = { value: number; density: number };
export type DensityEstimate = {
  count: number;
  bandwidth: number;
  constant: boolean;
  observedMin: number;
  observedMax: number;
  domain: [number, number];
  curve: DensityPoint[];
  evaluate: (value: number) => number;
  empirical: (value: number) => { count: number; probability: number };
};

function quantile(sorted: number[], probability: number) {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index), fraction = index - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

export function estimateDensity(values: readonly number[], resolution = 256): DensityEstimate | null {
  if (!values.length) return null;
  if (values.some(value => !Number.isFinite(value))) throw new RangeError("收益密度样本必须是有限数值。");
  if (!Number.isInteger(resolution) || resolution < 32 || resolution > 2048) throw new RangeError("密度曲线分辨率需要是 32–2048 之间的整数。");
  const sorted = [...values].sort((a, b) => a - b), count = sorted.length;
  const observedMin = sorted[0], observedMax = sorted[count - 1];
  const constant = observedMin === observedMax;
  let mean = 0, sumSquares = 0;
  sorted.forEach((value, index) => {
    const delta = value - mean;
    mean += delta / (index + 1);
    sumSquares += delta * (value - mean);
  });
  const sd = count > 1 ? Math.sqrt(sumSquares / (count - 1)) : 0;
  const scaledIQR = (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / 1.349;
  const sigma = scaledIQR > 0 ? Math.min(sd, scaledIQR) : sd;
  const bandwidth = sigma > 0 ? 0.9 * sigma * count ** -0.2 : Math.max(0.0025, Math.abs(mean) * 0.01);
  if (!Number.isFinite(bandwidth) || bandwidth <= 0) throw new RangeError("收益样本的数值范围过大，无法估计密度。");
  const margin = Math.max(bandwidth * 1.5, (observedMax - observedMin) * 0.04);
  // Both sides of zero remain visible even when every observed return has the
  // same sign. These tails represent smoothing, not additional observations.
  const domain: [number, number] = [Math.min(observedMin - 4 * bandwidth, -margin), Math.max(observedMax + 4 * bandwidth, margin)];
  const normalizer = count * bandwidth * Math.sqrt(2 * Math.PI);
  const evaluate = (value: number) => {
    if (!Number.isFinite(value)) throw new RangeError("密度查询点必须是有限数值。");
    let total = 0;
    for (const sample of sorted) {
      const z = (value - sample) / bandwidth;
      total += Math.exp(-0.5 * z * z);
    }
    return total / normalizer;
  };
  const empirical = (value: number) => {
    if (!Number.isFinite(value)) throw new RangeError("经验分布查询点必须是有限数值。");
    let lower = 0, upper = count;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (sorted[middle] <= value) lower = middle + 1;
      else upper = middle;
    }
    return { count: lower, probability: lower / count };
  };
  const grid = Array.from({ length: resolution + 1 }, (_, index) => domain[0] + (domain[1] - domain[0]) * index / resolution);
  // Keep the zero boundary and observed extrema exact, rather than merely
  // snapping them to the regular drawing grid.
  const curve = [...new Set([...grid, 0, observedMin, observedMax])].sort((a, b) => a - b).map(value => ({ value, density: evaluate(value) }));
  return { count, bandwidth, constant, observedMin, observedMax, domain, curve, evaluate, empirical };
}
