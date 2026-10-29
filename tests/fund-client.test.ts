import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchFundClient, validateFundPayload } from "../lib/fund-client.ts";

const originals = new Map<string, PropertyDescriptor | undefined>();
const storage = new Map<string, string>();
let sourceLoads: string[] = [];
let frameRemovals = 0;
let sourceMode: "success" | "error" | "timeout" | "spoof" = "success";
let isMoneyFund = false;
let activeFrames = 0;
let maxActiveFrames = 0;
let frameSandbox = "";

function setGlobal(key: string, value: unknown) {
  if (!originals.has(key)) originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

function fixture(hoursOld = 0) {
  return {
    code: "000001", name: "测试基金", basis: "event-adjusted-nav", source: "天天基金 / 东方财富",
    sourceUrl: "https://fund.eastmoney.com/000001.html", qdii: false,
    fetchedAt: new Date(Date.now() - hoursOld * 3_600_000).toISOString(),
    latestNavDate: "2024-01-03", warnings: [],
    points: [{ date: "2024-01-02", nav: 1, adjustedNav: 1 }, { date: "2024-01-03", nav: 1.1, adjustedNav: 1.1 }],
  };
}

beforeEach(() => {
  storage.clear(); sourceLoads = []; frameRemovals = 0; sourceMode = "success";
  isMoneyFund = false; activeFrames = 0; maxActiveFrames = 0; frameSandbox = "";
  const listeners = new Set<(event: unknown) => void>();
  setGlobal("window", {
    addEventListener(type: string, handler: (event: unknown) => void) { if (type === "message") listeners.add(handler); },
    removeEventListener(type: string, handler: (event: unknown) => void) { if (type === "message") listeners.delete(handler); },
  });
  setGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  setGlobal("document", {
    body: { appendChild(frame: { src: string; contentWindow: object }) {
      activeFrames++; maxActiveFrames = Math.max(maxActiveFrames, activeFrames);
      sourceLoads.push(frame.src);
      queueMicrotask(() => {
        if (sourceMode === "timeout") return;
        const query = new URL(frame.src, "https://openrt.test").searchParams;
        const code = query.get("code"), nonce = query.get("nonce");
        const raw = [
          { x: Date.parse("2024-01-02T00:00:00Z"), y: 1, equityReturn: 0, unitMoney: "" },
          { x: Date.parse("2024-01-03T00:00:00Z"), y: 1.1, equityReturn: 10, unitMoney: "" },
        ];
        const source = `var ishb = ${isMoneyFund}; var fS_name = "测试基金"; var fS_code = "${code}"; var Data_netWorthTrend = ${JSON.stringify(raw)};`;
        const data = { channel: "openrt-fund-source-v1", code, nonce, ok: sourceMode !== "error", source, error: "无法连接天天基金数据源。" };
        const deliver = (event: unknown) => { for (const listener of [...listeners]) listener(event); };
        if (sourceMode === "spoof") {
          const fake = { ...data, source: source.replace("测试基金", "伪造基金") };
          deliver({ source: {}, origin: "null", data: fake });
          deliver({ source: frame.contentWindow, origin: "https://untrusted.test", data: fake });
          deliver({ source: frame.contentWindow, origin: "null", data: { ...fake, nonce: "wrong" } });
          deliver({ source: frame.contentWindow, origin: "null", data: { ...fake, code: "999999" } });
        }
        deliver({ source: frame.contentWindow, origin: "null", data });
      });
    } },
    createElement(tag: string) {
      assert.equal(tag, "iframe", "upstream scripts must never be injected into the parent page");
      return {
        src: "", contentWindow: {},
        setAttribute(name: string, value: string) { if (name === "sandbox") frameSandbox = value; },
        remove() { frameRemovals++; activeFrames--; },
      };
    },
  });
  setGlobal("fetch", async () => new Response("not found", { status: 404 }));
});

afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  originals.clear();
});

test("fresh scheduled JSON is served from the project base path without upstream requests", async () => {
  let fetchedUrl = "";
  setGlobal("fetch", async (url: string) => { fetchedUrl = url; return new Response(JSON.stringify(fixture(1))); });
  const result = await fetchFundClient("000001", { basePath: "/OpenRT/" });
  assert.equal(fetchedUrl, "/OpenRT/data/000001.json");
  assert.equal(result.cacheStatus, "scheduled-cache");
  assert.equal(sourceLoads.length, 0);
  assert.ok(storage.has("openrt-fund-v1:000001"));
});

test("fresh browser cache survives a missing scheduled entry", async () => {
  storage.set("openrt-fund-v1:000001", JSON.stringify({ version: 1, savedAt: Date.now(), data: fixture(2) }));
  const result = await fetchFundClient("000001");
  assert.equal(result.cacheStatus, "browser-cache");
  assert.equal(sourceLoads.length, 0);
});

test("an uncached code uses an opaque-origin sandbox bridge and cleans its frame", async () => {
  const result = await fetchFundClient("000001");
  assert.equal(result.cacheStatus, "source");
  assert.equal(result.code, "000001");
  assert.match(sourceLoads[0], /^\/OpenRT\/fund-frame\.html\?code=000001&nonce=[a-f0-9]{36}$/);
  assert.equal(frameSandbox, "allow-scripts");
  assert.equal(frameRemovals, 1);
  assert.equal(result.points.length, 2);
});

test("bridge messages must match the frame, opaque origin, fund code and random nonce", async () => {
  sourceMode = "spoof";
  const result = await fetchFundClient("000001");
  assert.equal(result.name, "测试基金");
  assert.equal(frameRemovals, 1);
});

test("a stale cache is explicitly marked after upstream failure", async () => {
  sourceMode = "error";
  setGlobal("fetch", async () => new Response(JSON.stringify(fixture(24))));
  const result = await fetchFundClient("000001");
  assert.equal(result.cacheStatus, "stale");
  assert.match(result.warnings.at(-1)!, /刷新失败.*旧缓存/);
  assert.equal(frameRemovals, 1);
});

test("source failure without validated cached data produces an actionable error", async () => {
  sourceMode = "error";
  storage.set("openrt-fund-v1:000001", "broken JSON");
  await assert.rejects(() => fetchFundClient("000001"), /暂无可用缓存/);
  assert.equal(frameRemovals, 1);
});

test("money funds are rejected consistently with the shared source parser", async () => {
  isMoneyFund = true;
  await assert.rejects(() => fetchFundClient("000001"), /货币基金/);
  assert.equal(frameRemovals, 1);
});

test("a source timeout removes its frame and releases the serialized request queue", async () => {
  sourceMode = "timeout";
  await assert.rejects(() => fetchFundClient("000001", { timeoutMs: 1000 }), /超时/);
  assert.equal(activeFrames, 0);
  sourceMode = "success";
  const result = await fetchFundClient("000001");
  assert.equal(result.cacheStatus, "source");
  assert.equal(frameRemovals, 2);
});

test("simultaneous queries serialize official source scripts", async () => {
  const results = await Promise.all([
    fetchFundClient("000001", { forceRefresh: true }),
    fetchFundClient("000001", { forceRefresh: true }),
  ]);
  assert.equal(results.length, 2);
  assert.equal(sourceLoads.length, 2);
  assert.equal(maxActiveFrames, 1);
  assert.equal(activeFrames, 0);
});

test("force refresh bypasses a fresh cache and storage refusal does not break a query", async () => {
  setGlobal("fetch", async () => new Response(JSON.stringify(fixture(1))));
  setGlobal("localStorage", { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } });
  const result = await fetchFundClient("000001", { forceRefresh: true });
  assert.equal(result.cacheStatus, "source");
  assert.equal(sourceLoads.length, 1);
});

test("code validation prevents arbitrary script paths before any network request", async () => {
  let fetches = 0;
  setGlobal("fetch", async () => { fetches++; return new Response("", { status: 404 }); });
  await assert.rejects(() => fetchFundClient("../../secret"), /六位/);
  await assert.rejects(() => fetchFundClient("000001?callback=x"), /六位/);
  assert.equal(fetches, 0);
  assert.equal(sourceLoads.length, 0);
});

test("invalid, mismatched and duplicate-date cache data is rejected", () => {
  assert.throws(() => validateFundPayload({ ...fixture(), code: "999999" }, "000001"));
  assert.throws(() => validateFundPayload({ ...fixture(), fetchedAt: "not-a-date" }, "000001"));
  const invalid = fixture(); invalid.points[1].adjustedNav = NaN;
  assert.throws(() => validateFundPayload(invalid, "000001"));
  const duplicate = fixture(); duplicate.points[1].date = duplicate.points[0].date;
  assert.throws(() => validateFundPayload(duplicate, "000001"));
  assert.throws(() => validateFundPayload({ ...fixture(), latestNavDate: "2024-01-04" }, "000001"));
  assert.throws(() => validateFundPayload({ ...fixture(), sourceUrl: "javascript:alert(1)" }, "000001"));
});
