/** Calendar-day RT analysis and a fractional-share, dividend-reinvestment DCA model. */
export type NavPoint = { date: string; nav: number; adjustedNav: number };

export const ALPHA_PRESETS = [
  { label: "1mo", days: 30 },
  { label: "3mo", days: 90 },
  { label: "6mo", days: 180 },
  { label: "1y", days: 365 },
  { label: "2y", days: 730 },
  { label: "3y", days: 1095 },
] as const;

export type RollingPoint = {
  startDate: string;
  targetDate: string;
  endDate: string;
  days: number;
  return: number;
};

export type ReturnStats = {
  count: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  p05: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  lossProbability: number | null;
  positiveProbability: number | null;
  nonOverlappingCount: number;
};

export type RollingResult = {
  alphaDays: number;
  maxGapDays: number;
  points: RollingPoint[];
  stats: ReturnStats;
  skippedGaps: number;
  incompleteCount: number;
};

const DAY_MS = 86_400_000;

/** Strict ISO date parsing avoids local time zones and silently normalized dates. */
function dateNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("日期必须采用 YYYY-MM-DD 格式。");
  }
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) {
    throw new Error(`无效日期：${date}`);
  }
  return value / DAY_MS;
}

function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function prepareNav(points: NavPoint[]): { point: NavPoint; day: number }[] {
  const prepared = points.map((point) => {
    const day = dateNumber(point.date);
    if (!(point.nav > 0) || !Number.isFinite(point.nav) ||
      !(point.adjustedNav > 0) || !Number.isFinite(point.adjustedNav)) {
      throw new Error(`净值必须为有效正数：${point.date}`);
    }
    return { point, day };
  }).sort((a, b) => a.day - b.day);
  for (let index = 1; index < prepared.length; index++) {
    if (prepared[index].day === prepared[index - 1].day) {
      throw new Error(`净值日期重复：${prepared[index].point.date}`);
    }
  }
  return prepared;
}

/** Linear interpolation between ordered empirical observations (R/NumPy type 7). */
function quantile(sorted: number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

export function calculateStats(points: RollingPoint[]): ReturnStats {
  const count = points.length;
  if (!count) {
    return {
      count: 0, mean: null, median: null, sd: null, min: null, max: null,
      p05: null, p25: null, p75: null, p95: null,
      lossProbability: null, positiveProbability: null, nonOverlappingCount: 0,
    };
  }
  const values = points.map((point) => point.return);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("收益样本含无效数字。");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance = count > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1)
    : null;
  // Earliest-finish greedy selection counts a disjoint subset; it does not prove independence.
  let nonOverlappingCount = 0;
  let previousEnd = "";
  for (const point of [...points].sort((a, b) => a.endDate.localeCompare(b.endDate) || a.startDate.localeCompare(b.startDate))) {
    if (point.startDate >= previousEnd) {
      nonOverlappingCount++;
      previousEnd = point.endDate;
    }
  }
  return {
    count, mean, median: quantile(sorted, 0.5),
    sd: variance === null ? null : Math.sqrt(variance),
    min: sorted[0], max: sorted[count - 1],
    p05: quantile(sorted, 0.05), p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95),
    lossProbability: values.filter((value) => value <= 0).length / count,
    positiveProbability: values.filter((value) => value > 0).length / count,
    nonOverlappingCount,
  };
}

/**
 * R_alpha(T) = adjustedNav(first NAV date >= T + alpha) / adjustedNav(T) - 1.
 * Dates without NAV are never synthesized. Endpoints more than maxGapDays late
 * are excluded rather than stretched across a prolonged suspension.
 */
export function rollingReturns(points: NavPoint[], alphaDays: number, maxGapDays = 10, asOfDate?: string): RollingResult {
  if (!Number.isInteger(alphaDays) || alphaDays < 1 || alphaDays > 3650) {
    throw new Error("持有期 α 必须是 1 至 3650 的整数自然日。");
  }
  if (!Number.isInteger(maxGapDays) || maxGapDays < 0 || maxGapDays > 60) {
    throw new Error("日期容差必须是 0 至 60 的整数自然日。");
  }
  const cutoff = asOfDate === undefined ? Infinity : dateNumber(asOfDate);
  const nav = prepareNav(points).filter(({ day }) => day <= cutoff);
  const results: RollingPoint[] = [];
  let end = 0;
  let skippedGaps = 0;
  let incompleteCount = 0;
  for (let start = 0; start < nav.length; start++) {
    const targetDay = nav[start].day + alphaDays;
    end = Math.max(end, start + 1);
    while (end < nav.length && nav[end].day < targetDay) end++;
    if (end === nav.length) {
      incompleteCount += nav.length - start;
      break;
    }
    if (nav[end].day - targetDay > maxGapDays) {
      skippedGaps++;
      continue;
    }
    results.push({
      startDate: nav[start].point.date, targetDate: isoDate(targetDay),
      endDate: nav[end].point.date, days: nav[end].day - nav[start].day,
      return: nav[end].point.adjustedNav / nav[start].point.adjustedNav - 1,
    });
  }
  return { alphaDays, maxGapDays, points: results, stats: calculateStats(results), skippedGaps, incompleteCount };
}

export type DCAOptions = {
  investmentStart: string;
  investmentEnd: string;
  dailyAmount: number;
  settlementDate: string;
  /** Simplified fee charged as a fraction of the gross cash contribution. */
  purchaseFeeRate?: number;
  /** Simplified uniform fee charged against liquidation value. */
  redemptionFeeRate?: number;
};

export type DCASeriesPoint = { date: string; cost: number; value: number; profit: number };
export type DCAResult = {
  cost: number;
  value: number;
  profit: number;
  return: number;
  contributions: number;
  settlementDate: string;
  requestedSettlementDate: string;
  totalFees: number;
  series: DCASeriesPoint[];
};

/**
 * Contribute only on published NAV dates, using adjusted units so dividends are
 * reinvested. This excludes purchase suspensions, share rounding, execution
 * cutoffs and fund-specific fee tiers; it is a historical model, not an order.
 */
export function simulateDCA(points: NavPoint[], options: DCAOptions): DCAResult {
  const startDay = dateNumber(options.investmentStart);
  const endDay = dateNumber(options.investmentEnd);
  const requestedSettlementDay = dateNumber(options.settlementDate);
  const purchaseFee = options.purchaseFeeRate ?? 0;
  const redemptionFee = options.redemptionFeeRate ?? 0;
  if (!(options.dailyAmount > 0) || !Number.isFinite(options.dailyAmount)) {
    throw new Error("每日定投金额必须为有效正数。");
  }
  if ([purchaseFee, redemptionFee].some((fee) => !Number.isFinite(fee) || fee < 0 || fee > 0.99)) {
    throw new Error("费率必须在 0% 至 99% 之间。");
  }
  if (startDay > endDay || endDay > requestedSettlementDay) {
    throw new Error("日期顺序应为：定投起始日 ≤ 定投终止日 ≤ 收益结算日。");
  }
  const nav = prepareNav(points);
  if (!nav.length) throw new Error("暂无可用于定投模拟的净值数据。");
  const firstDay = nav[0].day;
  const lastDay = nav[nav.length - 1].day;
  if (startDay < firstDay || requestedSettlementDay > lastDay || requestedSettlementDay < firstDay) {
    throw new Error(`日期超出已公布净值范围（${nav[0].point.date} 至 ${nav[nav.length - 1].point.date}）。请使用已公布的历史日期。`);
  }
  let settlementIndex = nav.length - 1;
  while (nav[settlementIndex].day > requestedSettlementDay) settlementIndex--;
  let units = 0;
  let cost = 0;
  let contributions = 0;
  let purchaseFees = 0;
  const series: DCASeriesPoint[] = [];
  for (let index = 0; index <= settlementIndex; index++) {
    const { point, day } = nav[index];
    if (day < startDay) continue;
    if (day <= endDay) {
      cost += options.dailyAmount;
      contributions++;
      const fee = options.dailyAmount * purchaseFee;
      purchaseFees += fee;
      units += (options.dailyAmount - fee) / point.adjustedNav;
    }
    if (contributions) {
      const value = units * point.adjustedNav * (1 - redemptionFee);
      series.push({ date: point.date, cost, value, profit: value - cost });
    }
  }
  if (!contributions) throw new Error("定投区间内没有已公布净值日，请调整日期。");
  const last = series[series.length - 1];
  const finalGrossValue = units * nav[settlementIndex].point.adjustedNav;
  return {
    cost, value: last.value, profit: last.profit, return: last.profit / cost,
    contributions, settlementDate: nav[settlementIndex].point.date,
    requestedSettlementDate: options.settlementDate,
    totalFees: purchaseFees + finalGrossValue * redemptionFee,
    series,
  };
}
