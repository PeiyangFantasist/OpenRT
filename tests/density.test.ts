import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateDensity } from "../lib/density.ts";

test("density handles empty input and rejects non-finite observations", () => {
  assert.equal(estimateDensity([]), null);
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => estimateDensity([0.1, invalid]), /有限数值/);
});

test("constant and single-observation samples have a finite positive display bandwidth", () => {
  for (const values of [[0], [0.1], [0.02, 0.02, 0.02], [-0.1, -0.1]]) {
    const estimate = estimateDensity(values)!;
    assert.equal(estimate.constant, true);
    assert.ok(estimate.bandwidth >= 0.0025);
    assert.ok(Number.isFinite(estimate.evaluate(values[0])));
    assert.ok(estimate.evaluate(values[0]) > 0);
    assert.ok(estimate.domain[0] < 0 && estimate.domain[1] > 0);
    assert.equal(estimate.empirical(values[0]).probability, 1);
  }
});

test("KDE follows Silverman's robust bandwidth and leaves caller data unchanged", () => {
  const values = [0.3, -0.1, 0.1, 0, 0.2];
  const before = [...values], estimate = estimateDensity(values)!;
  const sd = Math.sqrt(0.1 / 4);
  const expected = 0.9 * Math.min(sd, 0.2 / 1.349) * 5 ** -0.2;
  assert.ok(Math.abs(estimate.bandwidth - expected) < 1e-12);
  assert.deepEqual(values, before);
});

test("coincident quartiles fall back to sample SD and empirical CDF includes ties and zero", () => {
  const estimate = estimateDensity([0, 0, 0, 0, 0, 0.1])!;
  assert.ok(estimate.bandwidth > 0);
  assert.equal(estimate.constant, false);
  assert.deepEqual(estimate.empirical(-0.0001), { count: 0, probability: 0 });
  assert.deepEqual(estimate.empirical(0), { count: 5, probability: 5 / 6 });
  assert.deepEqual(estimate.empirical(0.1), { count: 6, probability: 1 });
  assert.throws(() => estimate.empirical(NaN), /有限数值/);
});

test("Gaussian density approximately integrates to one and is symmetric for a symmetric sample", () => {
  const estimate = estimateDensity([-0.2, -0.1, 0, 0.1, 0.2], 2048)!;
  let area = 0;
  for (let index = 1; index < estimate.curve.length; index++) {
    const left = estimate.curve[index - 1], right = estimate.curve[index];
    area += (right.value - left.value) * (left.density + right.density) / 2;
  }
  assert.ok(Math.abs(area - 1) < 0.0001, `area ${area}`);
  assert.ok(Math.abs(estimate.evaluate(-0.075) - estimate.evaluate(0.075)) < 1e-12);
  assert.equal(estimate.curve.find(point => point.value === 0)?.density, estimate.evaluate(0));
  // Displaying density per percentage point divides decimal-unit density by100.
  assert.ok(estimate.evaluate(0) / 100 < 1);
});
