/* Runs only in an opaque-origin sandbox. It has no access to the parent DOM or storage. */
(() => {
  "use strict";
  const query = new URL(location.href).searchParams;
  const code = query.get("code") || "";
  const nonce = query.get("nonce") || "";
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{36}$/.test(nonce)) return;
  const channel = "openrt-fund-source-v1";
  const send = (message) => window.parent.postMessage({ channel, code, nonce, ...message }, "*");
  const script = document.createElement("script");
  script.async = true;
  script.referrerPolicy = "no-referrer";
  const hour = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 10);
  script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${hour}`;
  script.onerror = () => send({ ok: false, error: "无法连接天天基金数据源，可能被网络或浏览器拦截。" });
  script.onload = () => {
    try {
      if (window.fS_code !== code || typeof window.fS_name !== "string" ||
        !Array.isArray(window.Data_netWorthTrend) || window.Data_netWorthTrend.length > 25000) {
        throw new Error("基金不存在、类型不支持，或官方返回的数据格式已变更。");
      }
      const source = [
        `var ishb = ${window.ishb === true ? "true" : "false"};`,
        `var fS_name = ${JSON.stringify(window.fS_name)};`,
        `var fS_code = ${JSON.stringify(window.fS_code)};`,
        `var Data_netWorthTrend = ${JSON.stringify(window.Data_netWorthTrend)};`,
      ].join("\n");
      if (source.length > 4000000) throw new Error("官方数据体积超出安全读取范围。");
      send({ ok: true, source });
    } catch (error) {
      send({ ok: false, error: error instanceof Error ? error.message : "官方数据无法读取。" });
    }
  };
  document.head.appendChild(script);
})();
