# Data source and adjustment policy

OpenRT reads publicly accessible daily open-end fund NAV histories from Eastmoney / 天天基金. No API key is required. This is an undocumented upstream endpoint, not a contracted service or a guaranteed free redistribution license. Fund codes select separate share classes; money-market funds are rejected because their 万份收益 is not unit NAV.

- History endpoint: `https://fund.eastmoney.com/pingzhongdata/{six-digit-code}.js`
- User-facing source: [天天基金数据](https://fund.eastmoney.com/data/).
- Primary implementation reference: [AKShare fund adapter](https://github.com/akfamily/akshare/blob/main/akshare/fund/fund_em.py), `fund_open_fund_info_em`, identifies `Data_netWorthTrend` as NAV, daily growth rate, and event data. Its timestamp conversion uses Asia/Shanghai. OpenRT implements its own JSON literal parser and does not execute the upstream JavaScript in the server adapter.
- [天天基金 on reinvesting dividends](https://fundtest.eastmoney.com/help/question_250.html).
- [Fund manager 易方达 on QDII disclosure delays](https://edu.efunds.com.cn/c/42/42718.shtml): check the valuation date, because cross-market disclosure can be later than domestic funds.

## NAV and adjustment

The adapter accepts only finite positive NAVs and plausible timestamps, converts to China calendar dates, sorts, deduplicates exact matches and rejects conflicting dates. It limits responses to 8 MiB and times out requests. Unit NAV and adjusted research index are both retained.

**Cumulative NAV is not used as a reinvested NAV.** Ordinary dates use exact unit NAV ratios. At explicit dividend/split event markers, the published daily percentage growth bridges the event: `factor *= (1 + equityReturn / 100) / (nav[t] / nav[t-1])`, then `adjustedNav[t] = nav[t] * factor`. This avoids compounding rounded daily growth rates on every ordinary day. Event growth rates can still be rounded, so this is an approximate event-adjusted series, not certified official adjusted NAV. Event text sometimes lacks the cash dividend or split amount; neither is invented.

Only recognized dividend/split phrases are treated as events. If an event has no usable growth rate, an unknown annotation appears, or a large unmarked daily rate discontinuity appears, the entire series falls back to raw unit NAV with a prominent warning. The absence of upstream event markers does not prove no event occurred. Users should verify material results against fund manager announcements. A local simulator using this index assumes dividends are reinvested using that index; actual reinvestment confirmation dates may differ.

## Freshness and rights

This is daily published data, not intraday valuation or a live trading signal. `latestNavDate` is the NAV's valuation date; `fetchedAt` is the retrieval timestamp. QDII is flagged when present in the source fund name. Do not synthesize missing observations or advance NAV dates to the current day. Holiday and publication gaps are preserved.

The live upstream was checked on 2026-10-29 for 161725, 019454 and 000001; all returned complete historical records with latest valuation date 2026-10-28. This observation is not a future freshness guarantee. The JavaScript response did not include an Access-Control-Allow-Origin header, so browser `fetch` cannot be assumed to work. Prefer a same-origin server adapter or scheduled snapshots.

## Browser execution trust boundary

The static-hosting fallback uses a classic script from the hardcoded HTTPS host `fund.eastmoney.com`, with a validated six-digit path. It is not a text fetch and it **does execute the complete upstream JavaScript** before inspecting and serializing its named data variables. The adapter parser itself does not evaluate source text; that claim does not make classic script loading data-only.

Execution occurs inside a temporary iframe with `sandbox="allow-scripts"` and no `allow-same-origin`. The frame has an opaque origin and cannot read the parent page's DOM, cookies or browser storage. Its local bridge (`fund-frame.html` and `fund-frame.js`) posts only captured data literals back. The parent accepts a message only from that exact frame's `contentWindow`, with the expected opaque `null` origin, channel, requested fund code and per-request cryptographic nonce. It then applies the shared literal parser and independent payload checks. The frame is removed after completion or timeout, and its message listener is removed. The frame content policy permits local bridge scripts and the fixed provider host while blocking network `fetch`, images, forms and unrelated resources.

The sandbox protects the parent page; it does not certify the financial data. Upstream code can still alter its own fields or send fabricated source data bearing the frame's nonce. Code/date/NAV validation rejects malformed payloads but cannot prove that plausible prices are correct. The provider remains a data trust dependency. Use scheduled snapshots or a server text adapter when executing any third-party source code is unsuitable. Source-derived names and messages are rendered as text rather than HTML.

Queries use scheduled validated JSON and browser cache before that fallback. Failure returns a visibly stale validated snapshot when available. The scheduled updater and server adapter retrieve text and parse only expected JSON literals without executing source code. Source-derived names and warnings must render as text, never HTML.

Low-frequency caching reduces upstream traffic. Cache failure must not be silently replaced by synthetic data. Display source attribution, timestamp and stale/error state. OpenRT establishes no right to bulk republish third-party histories: personal research deployment does not grant public commercial data use. Confirm the provider's authorization and current terms before broader public operation; replace this adapter with a licensed provider if necessary.
