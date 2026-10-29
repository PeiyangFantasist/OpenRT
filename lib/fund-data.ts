/** Public Eastmoney fund data adapter. Parses JSON literals; never executes upstream JavaScript. */
export interface FundPoint { date: string; nav: number; adjustedNav: number }
export interface FundData {
  code: string;
  name: string;
  points: FundPoint[];
  basis: 'event-adjusted-nav' | 'unit-nav';
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  latestNavDate: string;
  warnings: string[];
  qdii: boolean;
  type?: string;
  adjustmentEvents?: number;
  cacheStatus?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
const DAY = 86_400_000;
export function validateFundCode(code: string): string {
  if (!/^\d{6}$/.test(code)) throw new Error('请输入 6 位数字基金代码。');
  return code;
}

/** Balanced literal extraction handles strings containing semicolons or brackets. */
function literal(source: string, name: string): unknown {
  const match = new RegExp('(?:^|[;\\s]|\\*/)(?:var|let|const)\\s+' + name + '\\s*=\\s*').exec(source);
  if (!match) return undefined;
  let i = match.index + match[0].length;
  const start = i;
  const first = source[i];
  if (first === '"') {
    i++;
    for (; i < source.length; i++) {
      if (source[i] === '\\') { i++; continue; }
      if (source[i] === '"') return JSON.parse(source.slice(start, i + 1));
    }
    throw new Error('上游名称字段不完整。');
  }
  if (first !== '[' && first !== '{') {
    const end = source.indexOf(';', i);
    return JSON.parse(source.slice(i, end === -1 ? undefined : end).trim());
  }
  const stack: string[] = [];
  let quoted = false;
  for (; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '\\') { i++; continue; }
      if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === '[' || c === '{') stack.push(c);
    else if (c === ']' || c === '}') {
      const open = stack.pop();
      if ((c === ']' && open !== '[') || (c === '}' && open !== '{')) throw new Error('上游数据括号不匹配。');
      if (!stack.length) return JSON.parse(source.slice(start, i + 1));
    }
  }
  throw new Error('上游净值数据不完整。');
}

interface RawPoint { x: number; y: number; equityReturn?: unknown; unitMoney?: unknown }
function chinaDate(timestamp: number): string {
  return new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 10);
}
function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function parseFundSource(source: string, code: string, fetchedAt = new Date().toISOString()): FundData {
  validateFundCode(code);
  if (source.length > MAX_BYTES) throw new Error('上游数据超出大小限制。');
  if (literal(source, 'ishb') === true) throw new Error('货币基金以万份收益计价，暂不适用本净值分析模型。');
  const suppliedCode = literal(source, 'fS_code');
  if (suppliedCode !== undefined && suppliedCode !== code) throw new Error('上游基金代码与请求不符。');
  const nameValue = literal(source, 'fS_name');
  if (typeof nameValue !== 'string' || !nameValue.trim() || nameValue.length > 160) throw new Error('未找到基金，或上游返回了无效数据。');
  const raw = literal(source, 'Data_netWorthTrend');
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 20_000) throw new Error('该基金没有足够的历史单位净值，暂不支持分析。');
  const now = Date.parse(fetchedAt);
  if (!Number.isFinite(now)) throw new Error('抓取时间无效。');
  const dates = new Map<string, RawPoint>();
  for (const unknownRow of raw) {
    if (!unknownRow || typeof unknownRow !== 'object' || Array.isArray(unknownRow)) throw new Error('净值记录格式无效。');
    const row = unknownRow as RawPoint;
    if (finiteNumber(row.x) === null || row.x < Date.UTC(1990, 0, 1) || row.x > now + DAY || finiteNumber(row.y) === null || row.y <= 0 || row.y > 1_000_000) throw new Error('净值记录包含无效日期或数值。');
    const date = chinaDate(row.x);
    const existing = dates.get(date);
    if (existing && (existing.y !== row.y || existing.equityReturn !== row.equityReturn || existing.unitMoney !== row.unitMoney)) throw new Error('同一日期存在冲突净值，拒绝计算。');
    dates.set(date, row);
  }
  const sorted = [...dates.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length < 2) throw new Error('历史净值不足两条。');
  let adjustment = 1;
  let adjustmentEvents = 0;
  let fallback = false;
  let unmarkedDiscontinuities = 0;
  let unknownEventMarkers = 0;
  const points: FundPoint[] = sorted.map(([date, row], index) => {
    if (index > 0) {
      const previous = sorted[index - 1][1];
      const rawRatio = row.y / previous.y;
      const rate = finiteNumber(row.equityReturn);
      const marker = typeof row.unitMoney === 'string' ? row.unitMoney.trim() : '';
      const hasEvent = /分红|拆分|折算|派现|分拆|份额转换/.test(marker);
      // Event text often omits cash/split amounts. Bridge with the source's published
      // daily growth rate only on event dates, avoiding compounded rounding every day.
      if (marker && !hasEvent) {
        // Unknown annotation text must not silently become a dividend/split.
        unknownEventMarkers++;
        fallback = true;
      } else if (hasEvent) {
        if (rate === null || rate <= -100 || rate > 10_000) fallback = true;
        else {
          adjustment *= (1 + rate / 100) / rawRatio;
          adjustmentEvents++;
        }
      } else if (index > 5 && rate !== null && rate > -100 && Math.abs(rawRatio - (1 + rate / 100)) > 0.01) {
        // A large unmarked discrepancy may indicate a missing corporate action.
        // Do not invent an adjustment with no verifiable event marker.
        unmarkedDiscontinuities++;
        fallback = true;
      }
    }
    const adjustedNav = row.y * adjustment;
    if (!Number.isFinite(adjustedNav) || adjustedNav <= 0) throw new Error('净值校正结果无效。');
    return { date, nav: row.y, adjustedNav };
  });
  if (fallback) for (const point of points) point.adjustedNav = point.nav;
  const qdii = /QDII/i.test(nameValue);
  const warnings = [
    '数据为最新已公布的历史日净值，不是盘中实时行情；净值所属日期与本站抓取时间分别列示。',
    '公开接口没有服务保障或已确认的公开再分发授权；仅供个人研究，权利归数据源，正式运营需另行确认授权。',
  ];
  if (fallback) {
    warnings.push('无法可靠校正全部分红或拆分，本次回退为未复权单位净值；跨事件收益可能失真，请核对基金公告。');
    if (unmarkedDiscontinuities) warnings.push(`发现 ${unmarkedDiscontinuities} 处未标记的净值与日增长率显著不一致。`);
    if (unknownEventMarkers) warnings.push(`发现 ${unknownEventMarkers} 处无法识别的源事件说明，未将任意文字当作分红或拆分。`);
  } else if (adjustmentEvents) {
    warnings.push(`按源事件标记及其日增长率近似校正了 ${adjustmentEvents} 次分红或拆分。日增长率有舍入误差，这不是官方认证复权净值；分红再投资的实际确认日可能不同。`);
  } else {
    warnings.push('所获历史没有分红或拆分标记，校正序列等于单位净值；上游遗漏事件仍可能导致误差。');
  }
  if (qdii) warnings.push('QDII 可能因境外时区、节假日及估值流程延后披露；以净值所属日期为准，不补造未公布数据。');
  const latestNavDate = points[points.length - 1].date;
  const calendarLag = Math.floor((now - Date.parse(latestNavDate + 'T00:00:00+08:00')) / DAY);
  if (calendarLag > (qdii ? 7 : 5)) warnings.push(`最新净值距抓取时间已有 ${calendarLag} 个自然日；可能为假期、暂停披露或源未更新。`);
  return {
    code, name: nameValue, points, basis: fallback ? 'unit-nav' : 'event-adjusted-nav',
    source: '东方财富 · 天天基金', sourceUrl: `https://fund.eastmoney.com/${code}.html`,
    fetchedAt, latestNavDate, warnings, qdii, adjustmentEvents,
    type: qdii ? 'QDII' : '开放式基金',
  };
}

export interface FetchOptions { fetcher?: typeof fetch; timeoutMs?: number; now?: Date }
export async function getFundData(code: string, options: FetchOptions = {}): Promise<FundData> {
  validateFundCode(code);
  const now = options.now ?? new Date();
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${now.toISOString().slice(0, 10)}`, {
      signal: controller.signal,
      headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'OpenRT/1.0 personal-research (cached daily NAV)' },
    });
    if (!response.ok) throw new Error(`基金数据源暂不可用（HTTP ${response.status}）。`);
    const size = Number(response.headers.get('content-length') ?? 0);
    if (size > MAX_BYTES) throw new Error('上游数据超出大小限制。');
    if (!response.body) throw new Error('上游数据为空。');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let source = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error('上游数据超出大小限制。'); }
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
    return parseFundSource(source, code, now.toISOString());
  } finally { clearTimeout(timer); }
}

export const fetchFundData = getFundData;
