import { parseFundSource, type FundData } from "./fund-data.ts";

export type FundCacheStatus = "scheduled-cache" | "browser-cache" | "source" | "stale";
export type ClientFundData = FundData & { cacheStatus: FundCacheStatus };
export type FetchFundOptions = {
  /** Vite BASE_URL is used by default, so GitHub Pages project paths work. */
  basePath?: string;
  /** Bypass fresh caches when the visitor explicitly asks for a refresh. */
  forceRefresh?: boolean;
  timeoutMs?: number;
};

const HOUR = 3_600_000;
const BROWSER_TTL = 6 * HOUR;
const SCHEDULED_TTL = 18 * HOUR;
const CACHE_VERSION = 1;
const CACHE_PREFIX = "openrt-fund-v1:";
const MAX_BODY_LENGTH = 4_000_000;
const MAX_STORAGE_LENGTH = 2_000_000;
const MAX_POINTS = 25_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODE_PATTERN = /^\d{6}$/;

type CacheRecord = { version: number; savedAt: number; data: FundData };

function validDate(date: unknown): date is string {
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}

/** Validate cached JSON before it can reach the financial engine or persistent cache. */
export function validateFundPayload(input: unknown, code: string): FundData {
  if (!input || typeof input !== "object") throw new Error("缓存数据格式无效。");
  const value = input as Record<string, unknown>;
  if (value.code !== code || !CODE_PATTERN.test(code) ||
    typeof value.name !== "string" || value.name.length < 1 || value.name.length > 240 ||
    !Array.isArray(value.points) || !value.points.length || value.points.length > MAX_POINTS ||
    (value.basis !== "event-adjusted-nav" && value.basis !== "unit-nav") ||
    typeof value.source !== "string" || value.source.length > 300 ||
    typeof value.sourceUrl !== "string" || value.sourceUrl.length > 1000 ||
    typeof value.fetchedAt !== "string" || !Number.isFinite(Date.parse(value.fetchedAt)) ||
    Date.parse(value.fetchedAt) > Date.now() + 5 * 60_000 ||
    typeof value.qdii !== "boolean" || !validDate(value.latestNavDate) ||
    (value.type !== undefined && (typeof value.type !== "string" || value.type.length > 100)) ||
    (value.adjustmentEvents !== undefined && (typeof value.adjustmentEvents !== "number" || !Number.isInteger(value.adjustmentEvents) || value.adjustmentEvents < 0 || value.adjustmentEvents > MAX_POINTS)) ||
    !Array.isArray(value.warnings) || value.warnings.length > 40 ||
    value.warnings.some((warning) => typeof warning !== "string" || warning.length > 2000)) {
    throw new Error("缓存数据与基金代码不匹配，或缺少有效净值信息。");
  }
  try {
    const sourceUrl = new URL(value.sourceUrl);
    if (sourceUrl.protocol !== "https:" || sourceUrl.hostname !== "fund.eastmoney.com") {
      throw new Error("untrusted source");
    }
  } catch {
    throw new Error("缓存来源链接不是受支持的官方数据源。");
  }
  // Copy only known financial fields. No arbitrary cached properties are retained.
  const points = value.points.map((inputPoint: unknown) => {
    if (!inputPoint || typeof inputPoint !== "object") throw new Error("缓存净值格式无效。");
    const point = inputPoint as Record<string, unknown>;
    if (!validDate(point.date) || typeof point.nav !== "number" || !Number.isFinite(point.nav) || point.nav <= 0 ||
      typeof point.adjustedNav !== "number" || !Number.isFinite(point.adjustedNav) || point.adjustedNav <= 0) {
      throw new Error("缓存包含无效日期或净值。");
    }
    return { date: point.date, nav: point.nav, adjustedNav: point.adjustedNav };
  });
  for (let index = 1; index < points.length; index++) {
    if (points[index].date <= points[index - 1].date) throw new Error("缓存净值日期必须严格递增。");
  }
  if (value.latestNavDate !== points[points.length - 1].date) throw new Error("缓存最新净值日期不一致。");
  return {
    code, name: value.name, points,
    basis: value.basis, source: value.source, sourceUrl: value.sourceUrl,
    fetchedAt: value.fetchedAt, latestNavDate: value.latestNavDate,
    warnings: [...value.warnings] as string[], qdii: value.qdii,
    ...(value.type !== undefined ? { type: value.type } : {}),
    ...(value.adjustmentEvents !== undefined ? { adjustmentEvents: value.adjustmentEvents } : {}),
  } as FundData;
}

function age(data: FundData): number {
  return Math.max(0, Date.now() - Date.parse(data.fetchedAt));
}

function readBrowserCache(code: string): FundData | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(CACHE_PREFIX + code);
    if (!raw || raw.length > MAX_STORAGE_LENGTH) return null;
    const record = JSON.parse(raw) as CacheRecord;
    if (record.version !== CACHE_VERSION || !Number.isFinite(record.savedAt)) return null;
    return validateFundPayload(record.data, code);
  } catch {
    // Private browsing and storage quotas must not prevent a live fund query.
    return null;
  }
}

function writeBrowserCache(code: string, data: FundData): void {
  try {
    if (typeof localStorage === "undefined") return;
    const record: CacheRecord = { version: CACHE_VERSION, savedAt: Date.now(), data };
    const raw = JSON.stringify(record);
    if (raw.length <= MAX_STORAGE_LENGTH) localStorage.setItem(CACHE_PREFIX + code, raw);
  } catch {
    // The browser cache is optional; the validated result remains usable.
  }
}

function withStatus(data: FundData, cacheStatus: FundCacheStatus, warning?: string): ClientFundData {
  return {
    ...data, cacheStatus,
    warnings: warning ? [...data.warnings, warning] : [...data.warnings],
  };
}

function defaultBasePath(): string {
  const environment = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return environment?.BASE_URL ?? "/OpenRT/";
}

async function scheduledCache(code: string, basePath: string, timeoutMs: number): Promise<FundData | null> {
  const normalizedBase = `${basePath.replace(/\/+$/, "")}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizedBase}data/${code}.json`, { signal: controller.signal, cache: "no-cache" });
    if (!response.ok) return null;
    const raw = await response.text();
    if (raw.length > MAX_BODY_LENGTH) return null;
    return validateFundPayload(JSON.parse(raw), code);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// A single queue bounds upstream concurrency, even when visitors submit rapidly.
let sourceQueue: Promise<unknown> = Promise.resolve();

function loadOfficialSource(code: string, basePath: string, timeoutMs: number): Promise<FundData> {
  const run = () => new Promise<FundData>((resolve, reject) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      reject(new Error("浏览器数据查询仅能在页面中使用。"));
      return;
    }
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, "0")).join("");
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.tabIndex = -1;
    frame.title = "OpenRT 官方基金数据读取";
    frame.referrerPolicy = "no-referrer";
    const normalizedBase = `${basePath.replace(/\/+$/, "")}/`;
    frame.src = `${normalizedBase}fund-frame.html?code=${code}&nonce=${nonce}`;
    // Without allow-same-origin the frame has an opaque origin: upstream scripts
    // cannot read this page, cookies, browser cache or other parent-origin data.
    let finished = false;
    const finish = (error?: Error, result?: FundData) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      frame.onerror = null;
      frame.remove();
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error("官方数据源响应超时，请稍后重试。")), timeoutMs);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== "null" || !event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.channel !== "openrt-fund-source-v1" || message.code !== code || message.nonce !== nonce) return;
      try {
        if (message.ok !== true) {
          throw new Error(typeof message.error === "string" ? message.error.slice(0, 2000) : "官方基金数据读取失败。");
        }
        if (typeof message.source !== "string" || message.source.length > MAX_BODY_LENGTH) throw new Error("官方数据体积超出安全读取范围。");
        // The bridge posts only captured data literals. Parsing never executes text.
        const result = validateFundPayload(parseFundSource(message.source, code, new Date().toISOString()), code);
        finish(undefined, result);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("官方基金数据无法解析。"));
      }
    };
    window.addEventListener("message", onMessage);
    frame.onerror = () => finish(new Error("浏览器阻止了官方数据读取窗口，请使用每日缓存或稍后重试。"));
    try {
      document.body.appendChild(frame);
    } catch {
      finish(new Error("浏览器阻止了官方数据读取窗口，请使用每日缓存或稍后重试。"));
    }
  });
  const pending = sourceQueue.then(run, run);
  sourceQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

/**
 * Static-hosting loader: scheduled JSON -> fresh local cache -> official JSONP.
 * Failed refreshes may show a validated old snapshot, explicitly marked stale.
 * Official scripts execute only from the hardcoded provider in a temporary frame.
 */
export async function fetchFundClient(codeInput: string, options: FetchFundOptions = {}): Promise<ClientFundData> {
  const code = codeInput.trim();
  if (!CODE_PATTERN.test(code)) throw new Error("请输入六位公募基金代码，例如 000001。");
  const requestedTimeout = options.timeoutMs ?? 15_000;
  const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(30_000, Math.max(1000, requestedTimeout)) : 15_000;
  const local = readBrowserCache(code);
  const basePath = options.basePath ?? defaultBasePath();
  const scheduled = await scheduledCache(code, basePath, Math.min(timeoutMs, 6000));
  if (!options.forceRefresh && scheduled && age(scheduled) <= SCHEDULED_TTL) {
    const newer = local && Date.parse(local.fetchedAt) > Date.parse(scheduled.fetchedAt) && age(local) <= BROWSER_TTL ? local : scheduled;
    if (newer === scheduled) writeBrowserCache(code, scheduled);
    return withStatus(newer, newer === scheduled ? "scheduled-cache" : "browser-cache");
  }
  if (!options.forceRefresh && local && age(local) <= BROWSER_TTL) {
    return withStatus(local, "browser-cache");
  }
  try {
    const source = await loadOfficialSource(code, basePath, timeoutMs);
    writeBrowserCache(code, source);
    return withStatus(source, "source");
  } catch (error) {
    const fallback = [scheduled, local].filter((item): item is FundData => item !== null)
      .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0];
    const message = error instanceof Error ? error.message : "数据刷新失败。";
    if (fallback) {
      return withStatus(fallback, "stale", `刷新失败，正在显示旧缓存（抓取于 ${fallback.fetchedAt}）。${message}`);
    }
    throw new Error(`${message} 暂无可用缓存，请稍后重试或选择已收录的基金。`);
  }
}
