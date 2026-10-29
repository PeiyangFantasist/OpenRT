import test from "node:test";
import assert from "node:assert/strict";
import { beijingDate } from "../lib/calendar.ts";
import { rollingReturns } from "../lib/analytics.ts";

test("Beijing calendar crosses into November at UTC 16:00 regardless of device zone", () => {
  assert.equal(beijingDate(new Date("2026-10-31T15:59:59Z")), "2026-10-31");
  assert.equal(beijingDate(new Date("2026-10-31T16:00:00Z")), "2026-11-01");
});
test("a November entry matures when today's cutoff and a published endpoint both permit it", () => {
  const points = [{date:"2025-11-01",nav:1,adjustedNav:1},{date:"2026-11-01",nav:1.2,adjustedNav:1.2}];
  assert.equal(rollingReturns(points,365,10,"2026-10-31").points.length,0);
  const matured=rollingReturns(points,365,10,"2026-11-01");
  assert.equal(matured.points.length,1);
  assert.equal(matured.points[0].startDate,"2025-11-01");
  assert.ok(Math.abs(matured.points[0].return-.2)<1e-12);
  assert.equal(rollingReturns(points.slice(0,1),365,10,"2026-11-01").points.length,0);
});
