"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Info, RefreshCw, Search } from "lucide-react";
import { ALPHA_PRESETS, type DCAOptions, type ReturnStats } from "../../lib/analytics";
import { alignFundHistories, compareDCA, compareRolling } from "../../lib/comparison";
import { fetchFundClient } from "../../lib/fund-client";
import type { FundData } from "../../lib/fund-data";
import { AnimatedDialog } from "./animated-dialog";
import { ComparisonChart, type ComparisonPoint } from "./comparison-chart";
import { ComparisonMetrics, type ComparisonMetricRow } from "./comparison-metrics";
import { Distribution } from "./charts";
import { QuickFunds } from "./quick-funds";

export type ComparisonWorkspaceProps = {
  active: boolean;
  tab: "rt" | "dca";
  today: string;
  initialFund?: FundData | null;
  initialAlpha?: number;
  initialDca?: DCAOptions | null;
};
type Side = "a" | "b";
type Slot = { code: string; fund: FundData | null; loading: boolean; error: string };
const emptySlot = (): Slot => ({ code: "", fund: null, loading: false, error: "" });
const errorText = (error: unknown) => error instanceof Error ? error.message : "暂时无法完成，请稍后重试。";
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const clamp = (date: string, first: string, last: string) => date < first ? first : date > last ? last : date;
const RETURN_METRICS = new Set(["lossProbability", "mean", "median", "min", "max", "positiveProbability"]);

function rtRows(a: ReturnStats, b: ReturnStats): ComparisonMetricRow[] {
  const row = (id: keyof ReturnStats, label: string, direction: ComparisonMetricRow["direction"], format: ComparisonMetricRow["format"] = "percent", note?: string): ComparisonMetricRow => ({ id, label, a: a[id], b: b[id], direction, format, note });
  return [row("lossProbability", "P(R ≤ 0)", "lower", "percent", "历史非正收益比例"), row("mean", "平均收益", "higher"), row("median", "收益中位数", "higher"), row("count", "完整窗口", "neutral", "number"), row("min", "最差窗口", "higher"), row("max", "最好窗口", "higher"), row("p05", "下尾 P5", "higher"), row("p95", "上尾 P95", "higher"), row("p25", "下四分位 P25", "higher"), row("p75", "上四分位 P75", "higher"), row("sd", "样本标准差", "lower"), row("positiveProbability", "正收益窗口比例", "higher"), row("nonOverlappingCount", "非重叠窗口", "neutral", "number")];
}

export function ComparisonWorkspace({ active, tab, today, initialFund = null, initialAlpha = 365, initialDca = null }: ComparisonWorkspaceProps) {
  const [slots, setSlots] = useState({ a: emptySlot(), b: emptySlot() });
  const slotsRef = useRef(slots); slotsRef.current = slots;
  const requests = useRef({ a: 0, b: 0 });
  const [alpha, setAlpha] = useState(initialAlpha);
  const [alphaInput, setAlphaInput] = useState(String(initialAlpha));
  const [alphaError, setAlphaError] = useState("");
  const [draft, setDraft] = useState<DCAOptions | null>(initialDca);
  const [plan, setPlan] = useState<DCAOptions | null>(initialDca);
  const [formError, setFormError] = useState("");
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsTab, setStatsTab] = useState<"metrics" | "risk" | "distribution">("metrics");
  const lastDay = useRef(today);
  const planPair = useRef("");
  const patchSlot = useCallback((side: Side, patch: Partial<Slot>) => setSlots(current => ({ ...current, [side]: { ...current[side], ...patch } })), []);
  const query = useCallback(async (side: Side, code: string, forceRefresh = false, background = false) => {
    if (!/^\d{6}$/.test(code)) { patchSlot(side, { error: "请输入完整的 6 位基金代码。" }); return; }
    const request = ++requests.current[side];
    patchSlot(side, { loading: true, error: "", ...(!background ? { code } : {}) });
    try {
      const fund = await fetchFundClient(code, { forceRefresh });
      if (request === requests.current[side]) patchSlot(side, { fund, loading: false });
    } catch (error) {
      if (request === requests.current[side]) patchSlot(side, { error: errorText(error), loading: false });
    }
  }, [patchSlot]);
  useEffect(() => {
    if (active && initialFund && !slotsRef.current.a.fund && !slotsRef.current.a.code) patchSlot("a", { code: initialFund.code, fund: initialFund });
  }, [active, initialFund, patchSlot]);
  useEffect(() => { if (!active) setStatsOpen(false); }, [active]);
  useEffect(() => { setStatsTab("metrics"); }, [tab]);
  useEffect(() => {
    if (!active) return;
    const refresh = (force = false) => {
      if (document.visibilityState !== "visible") return;
      for (const side of ["a", "b"] as const) { const slot = slotsRef.current[side]; if (slot.fund && !slot.loading) void query(side, slot.fund.code, force, true); }
    };
    const checkDay = () => { if (document.visibilityState === "visible" && lastDay.current !== today) { lastDay.current = today; refresh(true); } };
    checkDay();
    const timer = setInterval(() => refresh(), 15 * 60_000);
    document.addEventListener("visibilitychange", checkDay);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", checkDay); };
  }, [active, today, query]);
  const { a, b } = slots;
  const labels: [string, string] = [`A · ${a.fund?.name ?? "第一支基金"}`, `B · ${b.fund?.name ?? "第二支基金"}`];
  const aligned = useMemo(() => {
    if (!a.fund || !b.fund) return { result: null, error: "" };
    try { return { result: alignFundHistories(a.fund.points, b.fund.points, today), error: "" }; }
    catch (error) { return { result: null, error: errorText(error) }; }
  }, [a.fund, b.fund, today]);
  const pair = a.fund && b.fund ? `${a.fund.code}/${b.fund.code}` : "";
  useEffect(() => {
    const range = aligned.result;
    if (!pair || planPair.current === pair || !range?.firstDate || !range.lastDate) return;
    planPair.current = pair;
    const first = range.firstDate, last = range.lastDate;
    const base = draft ?? initialDca;
    const start = clamp(base?.investmentStart || addDays(last, -365), first, last);
    const end = clamp(base?.investmentEnd || addDays(last, -90), start, last);
    const settings = { investmentStart: start, investmentEnd: end, settlementDate: clamp(base?.settlementDate || last, end, last), dailyAmount: base?.dailyAmount ?? 100, purchaseFeeRate: base?.purchaseFeeRate ?? 0, redemptionFeeRate: base?.redemptionFeeRate ?? 0 };
    setDraft(settings); setPlan(settings); setFormError("");
  }, [pair, aligned.result, draft, initialDca]);
  const rt = useMemo(() => {
    if (tab !== "rt" || !a.fund || !b.fund || !aligned.result?.count) return { result: null, error: "" };
    try { return { result: compareRolling(a.fund.points, b.fund.points, alpha, today), error: "" }; }
    catch (error) { return { result: null, error: errorText(error) }; }
  }, [tab, a.fund, b.fund, aligned.result, alpha, today]);
  const dca = useMemo(() => {
    if (tab !== "dca" || !a.fund || !b.fund || !plan || !aligned.result?.count) return { result: null, error: "" };
    try { return { result: compareDCA(a.fund.points, b.fund.points, plan, today), error: "" }; }
    catch (error) { return { result: null, error: errorText(error) }; }
  }, [tab, a.fund, b.fund, aligned.result, plan, today]);
  const detailRows = rt.result ? rtRows(rt.result.a.stats, rt.result.b.stats) : dca.result ? ([
    { id: "cost", label: "累计投入", a: dca.result.a.cost, b: dca.result.b.cost, format: "money", direction: "neutral" },
    { id: "value", label: "结算价值", a: dca.result.a.value, b: dca.result.b.value, format: "money", direction: "higher" },
    { id: "profit", label: "累计收益", a: dca.result.a.profit, b: dca.result.b.profit, format: "money", direction: "higher" },
    { id: "return", label: "累计收益率", a: dca.result.a.return, b: dca.result.b.return, format: "percent", direction: "higher", note: "未年化" },
    { id: "fees", label: "费用合计", a: dca.result.a.totalFees, b: dca.result.b.totalFees, format: "money", direction: "neutral" },
    { id: "contributions", label: "实际投入次数", a: dca.result.a.contributions, b: dca.result.b.contributions, format: "number", direction: "neutral" },
  ] satisfies ComparisonMetricRow[]) : [];
  const chartPoints = useMemo<ComparisonPoint[]>(() => {
    if (rt.result) return rt.result.a.points.flatMap((point, index) => { const other = rt.result!.b.points[index]; return other && other.startDate === point.startDate ? [{ date: point.startDate, a: point.return, b: other.return, detail: `共同到期 ${point.endDate} · 实际持有 ${point.days} 天` }] : []; });
    if (dca.result) return dca.result.a.series.flatMap((point, index) => { const other = dca.result!.b.series[index]; return other && other.date === point.date ? [{ date: point.date, a: point.value, b: other.value, cost: point.cost }] : []; });
    return [];
  }, [rt.result, dca.result]);
  const setPreset = (days: number) => { setAlpha(days); setAlphaInput(String(days)); setAlphaError(""); };
  const sharedError = aligned.error || (aligned.result && !aligned.result.count ? "两支基金没有可比较的共同净值日，请更换基金。" : "");
  const range = aligned.result;
  const ready = Boolean(a.fund && b.fund && range?.count && !sharedError);
  return <>
    <div className="comparison-bars">{(["a", "b"] as const).map(side => { const slot = slots[side]; return <section key={side} className="fund-toolbar glass" aria-label={`基金 ${side.toUpperCase()} 查询`}>
      <span className={`slot-letter slot-letter-${side}`}>{side.toUpperCase()}</span>
      <form className="fund-search" onSubmit={event => { event.preventDefault(); void query(side, slot.code); }}><Search size={15}/><input aria-label={`基金 ${side.toUpperCase()} 代码`} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={slot.code} onChange={event => patchSlot(side, { code: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6 位基金代码"/><button className="primary-button" disabled={slot.loading}>{slot.loading ? <RefreshCw size={14} className="spin"/> : "查询"}</button></form>
      {side === "a" && <QuickFunds onSelect={code => void query("a", code)} selectedCode={slot.fund?.code} disabled={slot.loading}/>}
      {slot.fund ? <><div className="fund-identity"><strong title={slot.fund.name}>{slot.fund.name}</strong><span>净值日 {slot.fund.latestNavDate} · {slot.fund.points.length.toLocaleString()} 条 · {slot.fund.basis === "unit-nav" ? "未复权" : "近似复权"}{slot.fund.qdii ? " · QDII" : ""}</span></div><div className="nav-value"><strong>{slot.fund.points.at(-1)!.nav.toFixed(4)}</strong><span>净值日 {slot.fund.latestNavDate}</span></div><button type="button" className="icon-button refresh-data" aria-label={`刷新基金 ${side.toUpperCase()}`} title={slot.fund.warnings.join("\n")} disabled={slot.loading} onClick={() => void query(side, slot.fund!.code, true, true)}><RefreshCw size={14}/></button></> : <span className="inline-note">{side === "a" ? "选择第一支基金" : "手动输入第二支基金编号"}</span>}
    </section>; })}</div>
    {(["a", "b"] as const).map(side => slots[side].error && <div key={side} className="error-banner" role="alert"><AlertCircle size={14}/><span>{side.toUpperCase()}：{slots[side].error}{slots[side].fund ? ` 仍显示 ${slots[side].fund!.code} 的上次结果。` : ""}</span><button type="button" aria-label={`关闭基金 ${side.toUpperCase()} 错误`} onClick={() => patchSlot(side, { error: "" })}>×</button></div>)}
    {sharedError && <div className="error-banner" role="alert"><AlertCircle size={14}/><span>{sharedError}</span></div>}
    {!ready ? <section className="loading-panel glass" role="status">{a.loading || b.loading ? <><RefreshCw className="spin" size={19}/><p>正在读取比较数据…</p></> : <p>{!a.fund ? "请输入第一支基金编号" : !b.fund ? "请输入第二支基金编号" : "请更换基金，以获得共同历史数据。"}</p>}</section> : <>
      {tab === "rt" ? <section className="alpha-toolbar" aria-label="比较持有期"><span className="toolbar-label">共同持有期 α</span><div className="segmented-control">{ALPHA_PRESETS.map(preset => <button type="button" key={preset.days} className={alpha === preset.days ? "active" : ""} aria-pressed={alpha === preset.days} onClick={() => setPreset(preset.days)}>{preset.label}</button>)}</div><form className="custom-alpha" onSubmit={event => { event.preventDefault(); const value = Number(alphaInput); if (!Number.isInteger(value) || value < 1 || value > 3650) { setAlphaError("请输入 1–3,650 的整数天数。"); return; } setPreset(value); }}><input aria-label="比较自定义持有天数" type="number" min="1" max="3650" step="1" value={alphaInput} onChange={event => setAlphaInput(event.target.value)}/><span>天</span><button aria-label="应用比较持有天数"><ArrowRight size={14}/></button></form>{alphaError && <span className="field-error" role="alert">{alphaError}</span>}<span className="inline-note">共同净值日 {range!.firstDate} — {range!.lastDate}</span></section> : draft && <form className="dca-form glass" onSubmit={event => { event.preventDefault(); try { compareDCA(a.fund!.points, b.fund!.points, draft, today); setPlan({ ...draft }); setFormError(""); } catch (error) { setFormError(errorText(error)); } }}><div className="dca-fields">
        <label>起始日<input type="date" aria-label="比较定投起始日" min={range!.firstDate!} max={range!.lastDate!} value={draft.investmentStart} onChange={event => setDraft({ ...draft, investmentStart: event.target.value })} required/></label><label>终止日<input type="date" aria-label="比较定投终止日" min={draft.investmentStart} max={range!.lastDate!} value={draft.investmentEnd} onChange={event => setDraft({ ...draft, investmentEnd: event.target.value })} required/></label><label>每日金额（元）<input type="number" aria-label="比较每日投入金额" min="0.01" max="100000000" step="0.01" value={draft.dailyAmount || ""} onChange={event => setDraft({ ...draft, dailyAmount: Number(event.target.value) })} required/></label><label>结算日<input type="date" aria-label="比较收益结算日" min={draft.investmentEnd} max={range!.lastDate!} value={draft.settlementDate} onChange={event => setDraft({ ...draft, settlementDate: event.target.value })} required/></label><label className="fee-field">申购费 %<input type="number" aria-label="比较申购费率" min="0" max="99" step="0.01" value={+((draft.purchaseFeeRate ?? 0) * 100).toFixed(4)} onChange={event => setDraft({ ...draft, purchaseFeeRate: Number(event.target.value) / 100 })}/></label><label className="fee-field">赎回费 %<input type="number" aria-label="比较赎回费率" min="0" max="99" step="0.01" value={+((draft.redemptionFeeRate ?? 0) * 100).toFixed(4)} onChange={event => setDraft({ ...draft, redemptionFeeRate: Number(event.target.value) / 100 })}/></label><button className="primary-button calculate-button">比较 <ArrowRight size={14}/></button>
      </div>{formError && <p className="field-error" role="alert">{formError}</p>}</form>}
      {(rt.error || dca.error) && <div className="error-banner" role="alert"><AlertCircle size={14}/><span>{rt.error || dca.error}</span></div>}
      <article className="curve-panel glass compare-curve"><div className="panel-title"><h1>{tab === "rt" ? "RT-α 双基金比较" : "双基金定投资产曲线"}{tab === "rt" && <span>α = {alpha} 天</span>}</h1><button type="button" className="secondary-button statistics-button" disabled={!detailRows.length} onClick={() => { setStatsTab("metrics"); setStatsOpen(true); }}>统计分析</button></div><div className="chart-subline"><span>{tab === "rt" ? "横轴：共同起投日 · 纵轴：到期收益率" : "同一日期、金额与费率 · 共同净值日投入"}</span><div className="comparison-legend"><span><i/>A 实线</span><span><i className="series-b"/>B 虚线</span>{tab === "dca" && <span><i className="series-cost"/>共同成本</span>}</div></div><div className="chart-body"><ComparisonChart key={`${pair}-${tab}`} points={chartPoints} labels={labels} money={tab === "dca"}/></div><div className="chart-meta"><span>共同数据 {range!.firstDate} — {range!.lastDate} · {range!.count.toLocaleString()} 日</span><span>{tab === "rt" ? `完整窗口 ${rt.result?.a.stats.count ?? "—"} 个` : `实际结算 ${dca.result?.a.settlementDate ?? "—"}`}</span></div></article>
      {detailRows.length > 0 && <ComparisonMetrics rows={detailRows.slice(0, 4)} labels={labels} compact/>}
      <div className="comparison-note"><Info size={12}/><span>今日（北京）{today} · {(a.fund!.basis === "unit-nav" || b.fund!.basis === "unit-nav") && <strong>含未复权数据，跨分红结果仅供参考。 </strong>}按共同净值日比较；同值不标胜者。「優勝！」仅按该项指标方向描述历史优劣，不是整体评级或投资建议。{a.fund!.basis !== b.fund!.basis && " 两基金复权口径不同，请结合数据说明解读。"}{(a.fund!.qdii || b.fund!.qdii) && " QDII 净值披露可能滞后。"}</span></div>
    </>}
    <AnimatedDialog open={statsOpen && active} onClose={() => setStatsOpen(false)} title="统计分析">
      <div className="help-subtabs" role="group" aria-label="比较统计内容">
        <button type="button" className={statsTab === "metrics" ? "active" : ""} onClick={() => setStatsTab("metrics")}>{tab === "rt" ? "收益指标" : "指标对比"}</button>
        {tab === "rt" && <><button type="button" className={statsTab === "risk" ? "active" : ""} onClick={() => setStatsTab("risk")}>分位与波动</button><button type="button" className={statsTab === "distribution" ? "active" : ""} onClick={() => setStatsTab("distribution")}>收益分布</button></>}
      </div>
      <div className="comparison-dialog-body">{statsTab !== "distribution" || tab === "dca" ? <ComparisonMetrics rows={tab === "dca" ? detailRows : detailRows.filter(row => statsTab === "metrics" ? RETURN_METRICS.has(row.id) : !RETURN_METRICS.has(row.id))} labels={labels}/> : <div className="compare-histograms">{rt.result && (["a", "b"] as const).map((side, index) => <section className="stats-panel glass" key={side}><div className="panel-title"><h2 title={labels[index]}>{labels[index]}</h2><span>{rt.result![side].stats.count} 个窗口</span></div><Distribution values={rt.result![side].points.map(point => point.return)}/></section>)}</div>}</div>
      <p className="panel-note">样本大量重叠，非独立试验。共有区间、相同日期口径下比较，历史结果不代表未来概率。</p>
    </AnimatedDialog>
  </>;
}
