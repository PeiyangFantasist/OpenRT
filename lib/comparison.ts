import { rollingReturns, simulateDCA, type DCAOptions, type DCAResult, type NavPoint, type RollingResult } from "./analytics.ts";

export type ComparisonRange = { firstDate: string | null; lastDate: string | null; count: number };
export type AlignedFundHistories = ComparisonRange & { a: NavPoint[]; b: NavPoint[] };
export type RollingComparison = { a: RollingResult; b: RollingResult; range: ComparisonRange };
export type DCAComparison = { a: DCAResult; b: DCAResult; range: ComparisonRange };
export type WinnerDirection = "higher" | "lower" | "neutral";

function validateDate(date: string): void {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("比较日期必须采用 YYYY-MM-DD 格式。");
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw new Error(`无效比较日期：${date}`);
}

function validatedHistory(points: NavPoint[]): Map<string, NavPoint> {
  if (!Array.isArray(points)) throw new Error("基金比较需要有效的历史净值序列。");
  const result = new Map<string, NavPoint>();
  for (const point of points) {
    if (!point || typeof point !== "object") throw new Error("基金比较包含无效净值记录。");
    validateDate(point.date);
    if (!Number.isFinite(point.nav) || point.nav <= 0 || !Number.isFinite(point.adjustedNav) || point.adjustedNav <= 0) {
      throw new Error(`基金比较的净值必须为有效正数：${point.date}`);
    }
    const existing = result.get(point.date);
    if (existing && (existing.nav !== point.nav || existing.adjustedNav !== point.adjustedNav)) {
      throw new Error(`基金比较包含同日冲突净值：${point.date}`);
    }
    // Preserve both original unit NAV and the already adjusted historical series.
    // Adjustment factors must never be rebuilt from the intersected observations.
    result.set(point.date, { date: point.date, nav: point.nav, adjustedNav: point.adjustedNav });
  }
  return result;
}

/**
 * A comparison uses only exact common observed NAV dates at or before asOfDate.
 * This aligns entry dates, valuation dates and contribution dates without filling
 * market holidays, QDII disclosure gaps or either fund's missing observations.
 */
export function alignFundHistories(a: NavPoint[], b: NavPoint[], asOfDate: string): AlignedFundHistories {
  validateDate(asOfDate);
  const historyA = validatedHistory(a);
  const historyB = validatedHistory(b);
  const dates = [...historyA.keys()].filter(date => date <= asOfDate && historyB.has(date)).sort();
  return {
    a: dates.map(date => historyA.get(date)!),
    b: dates.map(date => historyB.get(date)!),
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    count: dates.length,
  };
}

export function compareRolling(a: NavPoint[], b: NavPoint[], alphaDays: number, asOfDate: string): RollingComparison {
  const aligned = alignFundHistories(a, b, asOfDate);
  const range = { firstDate: aligned.firstDate, lastDate: aligned.lastDate, count: aligned.count };
  return { a: rollingReturns(aligned.a, alphaDays), b: rollingReturns(aligned.b, alphaDays), range };
}

/**
 * Both funds receive the same plan on the same common observed dates. Plans
 * outside their common history are rejected by simulateDCA rather than silently
 * shortened; the returned costs and contribution counts are therefore equal.
 */
export function compareDCA(a: NavPoint[], b: NavPoint[], options: DCAOptions, asOfDate: string): DCAComparison {
  const aligned = alignFundHistories(a, b, asOfDate);
  const range = { firstDate: aligned.firstDate, lastDate: aligned.lastDate, count: aligned.count };
  return { a: simulateDCA(aligned.a, options), b: simulateDCA(aligned.b, options), range };
}

/** A descriptive historical comparison; ties and non-performance fields have no winner. */
export function winner(a: number | null, b: number | null, direction: WinnerDirection): "a" | "b" | null {
  if (direction === "neutral" || a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const tolerance = 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
  if (Math.abs(a - b) <= tolerance) return null;
  if (direction === "higher") return a > b ? "a" : "b";
  if (direction === "lower") return a < b ? "a" : "b";
  return null;
}
