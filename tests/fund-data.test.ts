import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFundSource, getFundData, validateFundCode } from '../lib/fund-data.ts';
import { simulateDCA } from '../lib/analytics.ts';

const time = (day: number) => Date.UTC(2024, 0, day) - 8 * 3_600_000;
const row = (day: number, y: number, equityReturn: unknown = 0, unitMoney = '') => ({ x: time(day), y, equityReturn, unitMoney });
const source = (rows: unknown[], extra = '', name = '测试基金') => `var ishb=false;var fS_name=${JSON.stringify(name)};var fS_code="123456";var Data_netWorthTrend=${JSON.stringify(rows)};${extra}`;
const parse = (rows: unknown[], extra = '', name?: string) => parseFundSource(source(rows, extra, name), '123456', '2024-02-01T00:00:00Z');

test('sorts and deduplicates exact records using Shanghai dates', () => {
  const data = parse([row(3, 1.2), row(1, 1), row(2, 1.1), row(2, 1.1)]);
  assert.deepEqual(data.points.map(x => x.date), ['2024-01-01', '2024-01-02', '2024-01-03']);
  assert.equal(data.points[2].adjustedNav, 1.2);
  assert.equal(data.latestNavDate, '2024-01-03');
});

test('accepts compact declarations immediately after upstream comments', () => {
  const js = source([row(1, 1), row(2, 1.1)]).replaceAll('var ', '/*source*/var ');
  assert.equal(parseFundSource(js, '123456', '2024-02-01T00:00:00Z').points.length, 2);
});

test('uses NAV ratio on normal dates even when early source rate is zero', () => {
  const data = parse([row(1, 1), row(2, 1.1, 0)]);
  assert.equal(data.points[1].adjustedNav, 1.1);
});

test('bridges dividend and split events with published growth rate', () => {
  const data = parse([row(1, 2), row(2, 1, 0, '拆分：每份折算'), row(3, 0.9, 0, '分红：每10份派现金元'), row(4, 0.99, 10)]);
  assert.equal(data.basis, 'event-adjusted-nav');
  assert.equal(data.adjustmentEvents, 2);
  assert.ok(Math.abs(data.points[3].adjustedNav - 2.2) < 1e-10);
  assert.ok(data.warnings.some(x => x.includes('近似')));
});

test('falls back completely to raw NAV if one corporate action lacks a usable rate', () => {
  const data = parse([row(1, 2), row(2, 1, 0, '拆分'), row(3, 0.9, null, '分红')]);
  assert.equal(data.basis, 'unit-nav');
  assert.deepEqual(data.points.map(x => x.adjustedNav), [2, 1, 0.9]);
});

test('unknown annotation is not assumed to identify a corporate action', () => {
  const data = parse([row(1, 1), row(2, 0.9, 0, '未知说明')]);
  assert.equal(data.basis, 'unit-nav');
  assert.equal(data.points[1].adjustedNav, 0.9);
  assert.ok(data.warnings.some(x => x.includes('无法识别')));
});

test('actual 161725 split event avoids a false 33% loss in DCA', () => {
  // Public source 2017-09-26: 1.500 -> 1.000, daily growth -0.3865%.
  const data = parse([row(1, 1.5), row(2, 1, -0.3865, '拆分：每份基金份额折算份')]);
  const result = simulateDCA(data.points, { investmentStart: '2024-01-01', investmentEnd: '2024-01-02', dailyAmount: 100, settlementDate: '2024-01-02' });
  assert.ok(Math.abs(result.value - 199.6135) < 1e-9);
  assert.equal(result.cost, 200);
});

test('actual 000001 cash dividend adjusts earlier holdings but not fresh event-day investment', () => {
  // Public source 2007-01-12: 1.834 -> 0.979, daily growth -1.3086%.
  const data = parse([row(1, 1.834), row(2, 0.979, -1.3086, '分红：每10份派现金元')]);
  const previous = simulateDCA(data.points, { investmentStart: '2024-01-01', investmentEnd: '2024-01-01', dailyAmount: 100, settlementDate: '2024-01-02' });
  const fresh = simulateDCA(data.points, { investmentStart: '2024-01-02', investmentEnd: '2024-01-02', dailyAmount: 100, settlementDate: '2024-01-02' });
  assert.ok(Math.abs(previous.value - 98.6914) < 1e-9);
  assert.ok(Math.abs(fresh.value - 100) < 1e-9);
});

test('does not execute trailing upstream JavaScript or strings with brackets', () => {
  const data = parse([row(1, 1), row(2, 1.1)], 'globalThis.__fundParserExecuted=true;', '名称 ";[];');
  assert.equal(data.name, '名称 ";[];');
  assert.equal((globalThis as Record<string, unknown>).__fundParserExecuted, undefined);
});

test('rejects expression literals, invalid NAV, conflicts and money funds', () => {
  assert.throws(() => parseFundSource('var fS_name="test";var Data_netWorthTrend=(globalThis.x=1);', '123456'));
  assert.throws(() => parse([row(1, 1), row(2, 0)]), /无效/);
  assert.throws(() => parse([row(1, 1), row(1, 1.1)]), /冲突/);
  assert.throws(() => parseFundSource('var ishb=true;', '123456'), /货币基金/);
  assert.throws(() => validateFundCode('../../1'));
});

test('identifies QDII and keeps fetch time separate from NAV date', () => {
  const data = parse([row(1, 1), row(2, 1.1)], '', '全球股票(QDII)A');
  assert.equal(data.qdii, true);
  assert.equal(data.fetchedAt, '2024-02-01T00:00:00Z');
  assert.equal(data.latestNavDate, '2024-01-02');
  assert.ok(data.warnings.some(x => x.includes('QDII')));
});

test('fetch validates HTTP status and declared payload size', async () => {
  await assert.rejects(getFundData('123456', { fetcher: async () => new Response('bad', { status: 503 }) }), /503/);
  await assert.rejects(getFundData('123456', { fetcher: async () => new Response('x', { headers: { 'content-length': '999999999' } }) }), /大小限制/);
});

test('fetch parses an actual response-shaped fixture with fixed retrieval timestamp', async () => {
  const data = await getFundData('123456', { now: new Date('2024-02-01T00:00:00Z'), fetcher: async (url) => {
    assert.match(String(url), /^https:\/\/fund\.eastmoney\.com\/pingzhongdata\/123456\.js/);
    return new Response(source([row(1, 1), row(2, 1.1)]));
  } });
  assert.equal(data.points.length, 2);
  assert.equal(data.fetchedAt, '2024-02-01T00:00:00.000Z');
});
