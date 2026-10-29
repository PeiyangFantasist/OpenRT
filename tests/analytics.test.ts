import { test } from "node:test";
import assert from "node:assert/strict";
import { ALPHA_PRESETS, calculateStats, rollingReturns, simulateDCA } from "../lib/analytics.ts";
import type { NavPoint, RollingPoint } from "../lib/analytics";

function nav(date: string, adjustedNav: number, unitNav = adjustedNav): NavPoint {
  return { date, nav: unitNav, adjustedNav };
}
function near(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-10, `${actual} != ${expected}`);
}
function returnPoint(startDate: string, endDate: string, value: number): RollingPoint {
  return { startDate, endDate, targetDate: endDate, days: 1, return: value };
}

test("presets are explicit natural-day approximations", () => {
  assert.deepEqual(ALPHA_PRESETS.map((preset) => preset.days), [30, 90, 180, 365, 730, 1095]);
});

test("RT uses adjusted NAV, includes zero in P(R <= 0), and excludes unfinished windows", () => {
  const result = rollingReturns([
    nav("2024-01-01", 1, 1), nav("2024-01-02", 1, 0.5),
    nav("2024-01-03", 2, 1), nav("2024-01-04", 1, 0.5),
  ], 1);
  assert.deepEqual(result.points.map((point) => point.return), [0, 1, -0.5]);
  near(result.stats.lossProbability, 2 / 3);
  near(result.stats.positiveProbability, 1 / 3);
  assert.equal(result.incompleteCount, 1);
  assert.equal(result.stats.count, 3);
});

test("RT targets calendar days, rolls forward over non-NAV days and records actual holding days", () => {
  const result = rollingReturns([nav("2024-01-05", 1), nav("2024-01-08", 1.1), nav("2024-01-09", 1.2)], 1);
  assert.equal(result.points[0].targetDate, "2024-01-06");
  assert.equal(result.points[0].endDate, "2024-01-08");
  assert.equal(result.points[0].days, 3);
  near(result.points[0].return, 0.1);
});

test("large gaps are excluded and a zero tolerance requires an exact date", () => {
  const points = [nav("2024-01-01", 1), nav("2024-02-01", 2), nav("2024-02-02", 2.1)];
  const result = rollingReturns(points, 1);
  assert.equal(result.skippedGaps, 1);
  assert.equal(result.points.length, 1);
  const exact = rollingReturns([nav("2024-01-05", 1), nav("2024-01-08", 2)], 1, 0);
  assert.equal(exact.points.length, 0);
  assert.equal(exact.skippedGaps, 1);
});

test("leap dates use UTC without off-by-one day normalization", () => {
  const result = rollingReturns([nav("2024-02-28", 1), nav("2024-02-29", 2), nav("2024-03-01", 3)], 1);
  assert.equal(result.points[0].targetDate, "2024-02-29");
  assert.equal(result.points[1].targetDate, "2024-03-01");
  assert.throws(() => rollingReturns([nav("2023-02-29", 1)], 1), /无效日期/);
});

test("empty and single-sample statistics avoid misleading zero or NaN values", () => {
  const empty = rollingReturns([], 365);
  assert.equal(empty.stats.count, 0);
  assert.equal(empty.stats.mean, null);
  assert.equal(empty.stats.lossProbability, null);
  const single = rollingReturns([nav("2024-01-01", 1), nav("2024-01-02", 1.1)], 1);
  assert.equal(single.stats.sd, null);
  near(single.stats.median, 0.1);
});

test("statistics use sample SD, interpolated quantiles and disjoint window count", () => {
  const result = calculateStats([
    returnPoint("2024-01-01", "2024-01-03", -0.2),
    returnPoint("2024-01-02", "2024-01-04", 0),
    returnPoint("2024-01-03", "2024-01-05", 0.2),
  ]);
  near(result.mean, 0);
  near(result.sd, 0.2);
  near(result.p05, -0.18);
  near(result.p25, -0.1);
  near(result.p95, 0.18);
  assert.equal(result.nonOverlappingCount, 2);
});

test("RT validates alpha, tolerance and invalid/duplicate NAV records", () => {
  for (const alpha of [0, -1, 1.5, 3651, NaN, Infinity]) assert.throws(() => rollingReturns([], alpha));
  assert.throws(() => rollingReturns([], 1, -1));
  assert.throws(() => rollingReturns([nav("2024-01-01", 0)], 1));
  assert.throws(() => rollingReturns([nav("2024-01-01", 1), nav("2024-01-01", 2)], 1), /日期重复/);
});

test("DCA matches a hand calculation; there is no weekend contribution", () => {
  const result = simulateDCA([
    nav("2024-01-05", 1), nav("2024-01-08", 2), nav("2024-01-09", 3),
  ], { investmentStart: "2024-01-05", investmentEnd: "2024-01-08", dailyAmount: 100, settlementDate: "2024-01-09" });
  assert.equal(result.contributions, 2);
  near(result.cost, 200);
  near(result.value, 450);
  near(result.profit, 250);
  near(result.return, 1.25);
  assert.deepEqual(result.series.map((point) => point.cost), [100, 200, 200]);
});

test("DCA rolls historical settlement backward and uses inclusive contribution dates", () => {
  const result = simulateDCA([
    nav("2024-01-05", 1), nav("2024-01-08", 2), nav("2024-01-09", 3),
  ], { investmentStart: "2024-01-05", investmentEnd: "2024-01-06", dailyAmount: 100, settlementDate: "2024-01-07" });
  assert.equal(result.settlementDate, "2024-01-05");
  assert.equal(result.requestedSettlementDate, "2024-01-07");
  assert.equal(result.contributions, 1);
  near(result.value, 100);
});

test("DCA includes simplified subscription/redemption fees and dividend reinvestment", () => {
  const result = simulateDCA([nav("2024-01-01", 1), nav("2024-01-02", 2, 1)], {
    investmentStart: "2024-01-01", investmentEnd: "2024-01-01", dailyAmount: 100,
    settlementDate: "2024-01-02", purchaseFeeRate: 0.01, redemptionFeeRate: 0.02,
  });
  near(result.cost, 100);
  near(result.value, 194.04);
  near(result.totalFees, 4.96);
  near(result.profit, 94.04);
  near(result.series[1].value, result.value);
});

test("DCA validates ranges, missing history, malformed dates, amounts and fees", () => {
  const points = [nav("2024-01-05", 1), nav("2024-01-08", 2)];
  const options = { investmentStart: "2024-01-05", investmentEnd: "2024-01-05", dailyAmount: 100, settlementDate: "2024-01-08" };
  assert.throws(() => simulateDCA([], options), /暂无/);
  assert.throws(() => simulateDCA(points, { ...options, investmentStart: "2024-01-04" }), /超出/);
  assert.throws(() => simulateDCA(points, { ...options, settlementDate: "2024-01-09" }), /超出/);
  assert.throws(() => simulateDCA(points, { ...options, investmentStart: "2024-01-09" }), /日期顺序/);
  assert.throws(() => simulateDCA(points, { ...options, investmentEnd: "2024-01-09" }), /日期顺序/);
  assert.throws(() => simulateDCA(points, { ...options, investmentStart: "2024-02-30" }), /无效日期/);
  assert.throws(() => simulateDCA(points, { ...options, dailyAmount: 0 }), /金额/);
  assert.throws(() => simulateDCA(points, { ...options, purchaseFeeRate: 1 }), /费率/);
  assert.throws(() => simulateDCA(points, { ...options, investmentStart: "2024-01-06", investmentEnd: "2024-01-07" }), /没有已公布/);
});

test("unsorted input is sorted without changing caller data", () => {
  const points = [nav("2024-01-02", 2), nav("2024-01-01", 1)];
  assert.equal(rollingReturns(points, 1).points[0].return, 1);
  assert.equal(points[0].date, "2024-01-02");
});
