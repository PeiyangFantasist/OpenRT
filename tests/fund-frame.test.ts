import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseFundSource } from "../lib/fund-data.ts";

const bridge = readFileSync(new URL("../public/fund-frame.js", import.meta.url), "utf8");
const nonce = "0123456789abcdef0123456789abcdef0123";

function frameHarness(code: string, nonceInput = nonce) {
  const messages: Record<string, unknown>[] = [];
  const scripts: { src?: string; onload?: () => void; onerror?: () => void }[] = [];
  const frameWindow: Record<string, unknown> = {
    parent: { postMessage(message: Record<string, unknown>) { messages.push(message); } },
  };
  // Execute our authored bridge, never any remote script, in a controlled test context.
  runInNewContext(bridge, {
    URL,
    location: { href: `https://openrt.test/fund-frame.html?code=${encodeURIComponent(code)}&nonce=${encodeURIComponent(nonceInput)}` },
    window: frameWindow,
    document: {
      createElement(tag: string) { assert.equal(tag, "script"); return {}; },
      head: { appendChild(script: { src?: string; onload?: () => void; onerror?: () => void }) { scripts.push(script); } },
    },
  });
  return { messages, scripts, frameWindow };
}

test("the sandbox bridge accepts only a six-digit code and a fixed-length random nonce", () => {
  assert.equal(frameHarness("000001?callback=evil").scripts.length, 0);
  assert.equal(frameHarness("000001", "wrong").scripts.length, 0);
  const { scripts } = frameHarness("000001");
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src!, /^https:\/\/fund\.eastmoney\.com\/pingzhongdata\/000001\.js\?v=\d{10}$/);
});

test("the bridge sends captured strings as data literals without executing their contents", () => {
  const { scripts, messages, frameWindow } = frameHarness("000001");
  const name = '测试;基金 "; window.injected = true; //';
  Object.assign(frameWindow, {
    fS_name: name, fS_code: "000001", ishb: false,
    Data_netWorthTrend: [
      { x: Date.parse("2024-01-02T00:00:00Z"), y: 1, equityReturn: 0, unitMoney: "" },
      { x: Date.parse("2024-01-03T00:00:00Z"), y: 1.1, equityReturn: 10, unitMoney: "" },
    ],
  });
  scripts[0].onload!();
  assert.equal(messages[0].ok, true);
  assert.equal(messages[0].nonce, nonce);
  const parsed = parseFundSource(messages[0].source as string, "000001");
  assert.equal(parsed.name, name);
  assert.equal(parsed.points.length, 2);
  assert.equal(frameWindow.injected, undefined);
});

test("mismatched source codes and provider load failures become bounded error messages", () => {
  const mismatch = frameHarness("000001");
  Object.assign(mismatch.frameWindow, { fS_name: "另一基金", fS_code: "999999", Data_netWorthTrend: [] });
  mismatch.scripts[0].onload!();
  assert.equal(mismatch.messages[0].ok, false);
  assert.equal(mismatch.messages[0].source, undefined);
  const unavailable = frameHarness("000001");
  unavailable.scripts[0].onerror!();
  assert.equal(unavailable.messages[0].ok, false);
  assert.match(unavailable.messages[0].error as string, /无法连接/);
});
