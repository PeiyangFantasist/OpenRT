import { test } from "node:test";
import assert from "node:assert/strict";
import { alignFundHistories, compareDCA, compareRolling, winner } from "../lib/comparison.ts";
import type { NavPoint } from "../lib/analytics.ts";

function nav(date: string, adjustedNav: number, unitNav = adjustedNav): NavPoint {
  return { date, nav: unitNav, adjustedNav };
}
function near(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-10, `${actual} != ${expected}`);
}

test("unequal inception dates and NAV calendars align to exact common observations before the as-of date", () => {
  const a = [nav("2024-01-09", 9), nav("2024-01-01", 1), nav("2024-01-02", 2), nav("2024-01-04", 4), nav("2024-01-05", 5), nav("2024-01-04", 4)];
  const b = [nav("2024-01-02", 20), nav("2024-01-03", 30), nav("2024-01-04", 40), nav("2024-01-05", 50), nav("2024-01-07", 70), nav("2024-01-09", 90)];
  const aligned = alignFundHistories(a, b, "2024-01-08");
  assert.deepEqual(aligned.a.map(point => point.date), ["2024-01-02", "2024-01-04", "2024-01-05"]);
  assert.deepEqual(aligned.b.map(point => point.date), aligned.a.map(point => point.date));
  assert.equal(aligned.firstDate, "2024-01-02");
  assert.equal(aligned.lastDate, "2024-01-05");
  assert.equal(aligned.count, 3);
  assert.equal(a[0].date, "2024-01-09", "the input order is not mutated");
  assert.equal(a.length, 6, "deduplication does not mutate caller data");
  assert.notEqual(aligned.a[0], a[2]);
});

test("future observations are excluded and leap dates are validated strictly", () => {
  const history = [nav("2024-02-28", 1), nav("2024-02-29", 2), nav("2024-03-01", 100)];
  const aligned = alignFundHistories(history, history, "2024-02-29");
  assert.equal(aligned.count, 2);
  assert.equal(aligned.lastDate, "2024-02-29");
  assert.throws(() => alignFundHistories(history, history, "2023-02-29"), /无效比较日期/);
  assert.throws(() => alignFundHistories([nav("2024-02-30", 1)], history, "2024-03-01"), /无效比较日期/);
  assert.throws(() => alignFundHistories(history, history, "2024-2-29"), /YYYY-MM-DD/);
});

test("conflicting duplicates and non-finite or nonpositive NAV are rejected", () => {
  const valid = [nav("2024-01-01", 1)];
  assert.throws(() => alignFundHistories([nav("2024-01-01", 1), nav("2024-01-01", 2)], valid, "2024-01-01"), /同日冲突/);
  assert.throws(() => alignFundHistories([nav("2024-01-01", 1, 1), nav("2024-01-01", 1, 2)], valid, "2024-01-01"), /同日冲突/);
  for (const value of [NaN, Infinity, 0, -1]) {
    assert.throws(() => alignFundHistories([nav("2024-01-01", value)], valid, "2024-01-01"), /有效正数/);
  }
});

test("empty overlap returns an explicit empty range and no invented rolling samples", () => {
  const a = [nav("2024-01-01", 1)], b = [nav("2024-01-02", 1)];
  assert.deepEqual(alignFundHistories(a, b, "2024-01-02"), { a: [], b: [], firstDate: null, lastDate: null, count: 0 });
  const rolling = compareRolling(a, b, 1, "2024-01-02");
  assert.equal(rolling.a.stats.count, 0);
  assert.equal(rolling.b.stats.mean, null);
  assert.throws(() => compareDCA(a, b, { investmentStart: "2024-01-01", investmentEnd: "2024-01-01", dailyAmount: 100, settlementDate: "2024-01-02" }, "2024-01-02"), /暂无/);
});

test("rolling comparisons use the same starts and endpoints despite different original observation calendars", () => {
  const a = [nav("2024-01-01", 1), nav("2024-01-02", 2), nav("2024-01-04", 3), nav("2024-01-06", 100), nav("2024-01-08", 6), nav("2024-01-09", 6)];
  const b = [nav("2024-01-02", 10), nav("2024-01-03", 11), nav("2024-01-04", 8), nav("2024-01-08", 12), nav("2024-01-09", 12)];
  const result = compareRolling(a, b, 2, "2024-01-09");
  const windows = (side: typeof result.a) => side.points.map(({ startDate, targetDate, endDate, days }) => ({ startDate, targetDate, endDate, days }));
  assert.deepEqual(windows(result.a), windows(result.b));
  assert.deepEqual(result.a.points.map(point => point.endDate), ["2024-01-04", "2024-01-08"]);
  assert.equal(result.a.stats.count, 2);
  assert.equal(result.b.stats.count, 2);
  near(result.a.points[0].return, 0.5);
  near(result.a.points[1].return, 1);
  near(result.b.points[0].return, -0.2);
  near(result.b.stats.lossProbability, 0.5);
});

test("alignment preserves existing dividend adjustments instead of rebuilding ratios from unit NAV", () => {
  const a = [nav("2024-01-02", 2, 2), nav("2024-01-03", 2, 1)];
  const b = [nav("2024-01-02", 10), nav("2024-01-03", 11)];
  const result = compareRolling(a, b, 1, "2024-01-03");
  near(result.a.points[0].return, 0);
  near(result.b.points[0].return, 0.1);
  const dca = compareDCA(a, b, { investmentStart: "2024-01-02", investmentEnd: "2024-01-03", dailyAmount: 100, settlementDate: "2024-01-03" }, "2024-01-03");
  near(dca.a.value, 200);
  near(dca.b.value, 210);
});

test("DCA comparison has identical contribution dates and cost with hand-calculated ending values", () => {
  const a = [nav("2024-01-01", 1), nav("2024-01-02", 1), nav("2024-01-03", 2), nav("2024-01-04", 2), nav("2024-01-05", 4), nav("2024-01-06", 5)];
  const b = [nav("2024-01-02", 2), nav("2024-01-04", 4), nav("2024-01-05", 4), nav("2024-01-07", 10)];
  const result = compareDCA(a, b, { investmentStart: "2024-01-02", investmentEnd: "2024-01-04", dailyAmount: 100, settlementDate: "2024-01-05" }, "2024-01-07");
  assert.equal(result.a.cost, 200);
  assert.equal(result.b.cost, 200);
  assert.equal(result.a.contributions, 2);
  assert.equal(result.b.contributions, 2);
  assert.equal(result.a.settlementDate, result.b.settlementDate);
  assert.deepEqual(result.a.series.map(({ date, cost }) => ({ date, cost })), result.b.series.map(({ date, cost }) => ({ date, cost })));
  near(result.a.value, 600);
  near(result.b.value, 300);
  near(result.a.profit, 400);
  near(result.b.profit, 100);
});

test("comparison DCA rejects a plan outside the common history instead of giving unequal cashflows", () => {
  const a = [nav("2024-01-01", 1), nav("2024-01-02", 2), nav("2024-01-05", 4), nav("2024-01-06", 5)];
  const b = [nav("2024-01-02", 2), nav("2024-01-05", 4)];
  const plan = { investmentStart: "2024-01-02", investmentEnd: "2024-01-02", dailyAmount: 100, settlementDate: "2024-01-05" };
  assert.throws(() => compareDCA(a, b, { ...plan, investmentStart: "2024-01-01" }, "2024-01-06"), /超出/);
  assert.throws(() => compareDCA(a, b, { ...plan, settlementDate: "2024-01-06" }, "2024-01-06"), /超出/);
});

test("identical funds have identical rolling and DCA results and no winner", () => {
  const history = [nav("2024-01-02", 1), nav("2024-01-03", 1.5), nav("2024-01-04", 1.2)];
  const rolling = compareRolling(history, history, 1, "2024-01-04");
  assert.deepEqual(rolling.a, rolling.b);
  assert.equal(winner(rolling.a.stats.mean, rolling.b.stats.mean, "higher"), null);
  const dca = compareDCA(history, history, { investmentStart: "2024-01-02", investmentEnd: "2024-01-03", dailyAmount: 100, settlementDate: "2024-01-04" }, "2024-01-04");
  assert.deepEqual(dca.a, dca.b);
  assert.equal(winner(dca.a.value, dca.b.value, "higher"), null);
});

test("winner respects metric direction, neutral fields, finite inputs and relative tie tolerance", () => {
  assert.equal(winner(0.2, 0.3, "lower"), "a");
  assert.equal(winner(0.2, 0.3, "higher"), "b");
  assert.equal(winner(100, 200, "neutral"), null);
  assert.equal(winner(null, 1, "higher"), null);
  assert.equal(winner(1, NaN, "lower"), null);
  assert.equal(winner(Infinity, 1, "higher"), null);
  assert.equal(winner(1, 1 + 5e-11, "higher"), null);
  assert.equal(winner(1, 1 + 2e-10, "higher"), "b");
  assert.equal(winner(1e9, 1e9 + 0.05, "higher"), null);
  assert.equal(winner(1e9, 1e9 + 0.2, "higher"), "b");
});
