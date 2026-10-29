"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Wallet, BookOpen, ArrowUpRight, ArrowRight, Download, Search, RefreshCw, CalendarDays, Info, ExternalLink, AlertCircle, Check } from "lucide-react";
import { ALPHA_PRESETS, rollingReturns, simulateDCA, type NavPoint } from "../lib/analytics";
import { fetchFundClient } from "../lib/fund-client";
import { CurveChart, Distribution } from "./components/charts";
const MethodHelp = lazy(()=>import("./components/method-help").then(module=>({default:module.MethodHelp})));
import { InteractionEffects } from "./components/interactions";
import { AnimatedDialog } from "./components/animated-dialog";
import { QuickFunds } from "./components/quick-funds";
import { beijingDate } from "../lib/calendar";

type Tab = "rt" | "dca" | "help";
type Fund = {
  code: string; name: string; points: NavPoint[]; basis: string; source: string;
  sourceUrl: string; fetchedAt: string; latestNavDate: string; warnings: string[];
  qdii: boolean; cacheStatus?: string;
};
type DCASettings = { investmentStart: string; investmentEnd: string; dailyAmount: number; settlementDate: string; purchaseFeeRate: number; redemptionFeeRate: number };
const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (value: number | null | undefined, signed = false) => value == null ? "—" : `${signed && value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const money = (value: number | undefined) => value === undefined ? "—" : currency.format(value);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const errorText = (error: unknown) => error instanceof Error ? error.message : "暂时无法完成，请稍后重试。";
const sampleFunds = [{ code: "000001", name: "华夏成长" }, { code: "161725", name: "招商中证白酒" }, { code: "019454", name: "QDII 示例" }];

function downloadCSV(filename: string, columns: string[], rows: (string | number)[][]) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const file = new Blob(["\uFEFF", [columns, ...rows].map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function Brand() {
  return <a className="brand" href="#main" aria-label="OpenRT 首页"><span className="brand-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 23V9m0 14h21" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45"/><path d="m8 20 5-6 5 3 7-10" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span className="brand-text"><strong>Open<span>RT</span></strong><small>Return Curve Advise for Individual Investors</small></span></a>;
}
function Metric({ label, value, note, accent=false }: {label:string;value:string;note:string;accent?:boolean}) {
  return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}
export default function Home() {
  const [statsOpen, setStatsOpen] = useState(false);
  const [today, setToday] = useState(()=>beijingDate());
  const lastToday = useRef(today);
  const loadedCode = useRef<string | null>(null);
  const [dataInfo, setDataInfo] = useState(false);
  const [tab, setTab] = useState<Tab>("rt");
  const [code, setCode] = useState("");
  const [fund, setFund] = useState<Fund | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alpha, setAlpha] = useState(365);
  const [alphaInput, setAlphaInput] = useState("365");
  const [alphaError, setAlphaError] = useState("");
  const [dcaDraft, setDcaDraft] = useState<DCASettings | null>(null);
  const [dcaSettings, setDcaSettings] = useState<DCASettings | null>(null);
  const [dcaFormError, setDcaFormError] = useState("");
  const [toast, setToast] = useState("");
  const requestRef = useRef(0);
  const loadFund = useCallback(async (nextCode: string, forceRefresh = false) => {
    if (!/^\d{6}$/.test(nextCode)) { setError("请输入完整的 6 位基金代码，例如 000001。"); return; }
    const requestId = ++requestRef.current;
    setLoading(true); setError(""); setCode(nextCode);
    try {
      const payload = await fetchFundClient(nextCode, { forceRefresh });
      if (requestId !== requestRef.current) return;
      const data = payload as Fund;
      const changedFund = loadedCode.current !== nextCode;
      loadedCode.current = nextCode;
      setFund(data);
      const first = data.points[0].date, last = data.latestNavDate;
      const start = addDays(last, -365) < first ? first : addDays(last, -365);
      const end = addDays(last, -90) < start ? last : addDays(last, -90);
      const settings = { investmentStart: start, investmentEnd: end, dailyAmount: 100, settlementDate: last, purchaseFeeRate: 0, redemptionFeeRate: 0 };
      setDcaDraft(current=>changedFund||!current?settings:current); setDcaSettings(current=>changedFund||!current?settings:current); setDcaFormError("");
    } catch (failure) { if (requestId === requestRef.current) setError(errorText(failure)); }
    finally { if (requestId === requestRef.current) setLoading(false); }
  }, []);

  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timeout); }, [toast]);
  useEffect(()=>{
    const readClock=()=>setToday(beijingDate());
    const clock=setInterval(readClock,30_000);
    const onVisible=()=>{if(document.visibilityState==="visible")readClock();};
    const refresh=setInterval(()=>{if(document.visibilityState==="visible"&&loadedCode.current)void loadFund(loadedCode.current);},15*60_000);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{clearInterval(clock);clearInterval(refresh);document.removeEventListener("visibilitychange",onVisible);};
  },[loadFund]);
  useEffect(()=>{if(lastToday.current!==today){lastToday.current=today;if(loadedCode.current)void loadFund(loadedCode.current,true);}},[today,loadFund]);
  const rt = useMemo(() => {
    if (!fund) return null;
    try { return rollingReturns(fund.points, alpha, 10, today); } catch { return null; }
  }, [fund, alpha, today]);
  const dca = useMemo(() => {
    if (!fund || !dcaSettings) return { result: null, error: "" };
    try { return { result: simulateDCA(fund.points, dcaSettings), error: "" }; }
    catch (failure) { return { result: null, error: errorText(failure) }; }
  }, [fund, dcaSettings]);
  const setPreset = (days: number) => { setAlpha(days); setAlphaInput(String(days)); setAlphaError(""); };
  const applyCustomAlpha = () => { const parsed = Number(alphaInput); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) { setAlphaError("α 需要是 1–3,650 之间的整数天数。"); return; } setAlpha(parsed); setAlphaError(""); };
  const exportRT = () => { if (!rt?.points.length || !fund) return; downloadCSV(`OpenRT-${fund.code}-${alpha}d.csv`, ["起投日", "目标日", "实际到期日", "实际日历天数", "区间收益率", "数据口径"], rt.points.map(p => [p.startDate, p.targetDate, p.endDate, p.days, p.return, fund.basis])); setToast("RT-α 样本已导出为 CSV"); };
  const exportDCA = () => { if (!dca.result || !fund) return; downloadCSV(`OpenRT-${fund.code}-DCA.csv`, ["净值日", "累计投入", "持仓市值", "收益"], dca.result.series.map(p => [p.date, p.cost, p.value, p.profit])); setToast("定投曲线已导出为 CSV"); };
  const stats = rt?.stats;
  const navItems = [{id:"rt" as Tab,label:"RT-α",Icon:Activity},{id:"dca" as Tab,label:"每日定投",Icon:Wallet},{id:"help" as Tab,label:"算法与数据",Icon:BookOpen}];
  const renderStats = () => <aside className="stats-panel glass" aria-label="收益统计"><div className="panel-title"><h2>收益分布</h2><span>{fmt.format(stats?.count ?? 0)} 个窗口</span></div><Distribution values={(rt?.points ?? []).map(p=>p.return)}/><dl className="statistics">{[["最差",pct(stats?.min,true)],["最好",pct(stats?.max,true)],["P5",pct(stats?.p05,true)],["P95",pct(stats?.p95,true)],["P25",pct(stats?.p25,true)],["P75",pct(stats?.p75,true)],["样本标准差",pct(stats?.sd)],["正收益占比",pct(stats?.positiveProbability)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="panel-note">窗口有重叠；历史比例不代表未来概率。</p></aside>;
  return <div className="app-shell"><InteractionEffects/>
    <header className="app-header"><Brand/><nav className="main-nav" aria-label="主要功能">{navItems.map(({id,label,Icon})=><button key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setDataInfo(false);}} aria-pressed={tab===id}><Icon size={16}/>{label}</button>)}</nav><a className="github-link" href="https://github.com/PeiyangFantasist/OpenRT" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12}/></a></header>
    <main id="main" className={`workspace view-${tab}`}>
      {tab!=="help" && <section className="fund-toolbar glass" aria-label="基金查询"><form className="fund-search" onSubmit={e=>{e.preventDefault();void loadFund(code);}}><Search size={16}/><input id="fund-code" aria-label="基金代码" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="6 位基金代码"/><button className="primary-button" disabled={loading}>{loading?<RefreshCw size={15} className="spin"/>:"查询"}</button></form><QuickFunds onSelect={next=>void loadFund(next)} selectedCode={fund?.code} disabled={loading}/>{fund&&!loading&&<><div className="fund-identity"><strong title={fund.name}>{fund.name}</strong><span>{fund.qdii?"QDII · ":""}{fund.points.length.toLocaleString()} 条净值 · {fund.points[0].date} 起</span></div><div className="calendar-status"><span>今日（北京）</span><time>{today}</time></div><div className="nav-value"><strong>{fund.points.at(-1)!.nav.toFixed(4)}</strong><span>净值日 {fund.latestNavDate}</span></div><button className="icon-button refresh-data" aria-label="刷新基金数据" title="重新读取官方数据" disabled={loading} onClick={()=>void loadFund(fund.code,true)}><RefreshCw size={15}/></button></>}</section>}
      {error&&tab!=="help"&&<div className="error-banner" role="alert"><AlertCircle size={15}/><span>{error}{fund?` 当前仍显示 ${fund.code} 的上次结果。`:""}</span><button onClick={()=>setError("")} aria-label="关闭错误提示">×</button></div>}
      {tab==="help"?<Suspense fallback={<section className="loading-panel glass" role="status">正在载入说明…</section>}><MethodHelp/></Suspense>:loading?<section className="loading-panel glass" role="status"><RefreshCw size={21} className="spin"/><p>正在读取历史净值…</p></section>:!fund?<section className="loading-panel glass"><p>请输入基金编号查询或快捷按键查看基金</p></section>:<>
      {tab==="rt"&&<>
        <section className="alpha-toolbar" aria-label="持有期设置"><span className="toolbar-label">持有期 α</span><div className="segmented-control">{ALPHA_PRESETS.map(p=><button key={p.days} aria-pressed={alpha===p.days} className={alpha===p.days?"active":""} onClick={()=>setPreset(p.days)}>{p.label}</button>)}</div><form className="custom-alpha" onSubmit={e=>{e.preventDefault();applyCustomAlpha();}}><input aria-label="自定义持有天数" type="number" min="1" max="3650" step="1" value={alphaInput} onChange={e=>setAlphaInput(e.target.value)}/><span>天</span><button aria-label="应用自定义持有天数"><ArrowRight size={14}/></button></form><span className="inline-note">自然日 · 终点向后容差 10 天</span>{alphaError&&<span className="field-error" role="alert">{alphaError}</span>}<div className="data-info-wrap"><button className="text-button" onClick={()=>setDataInfo(!dataInfo)} aria-expanded={dataInfo}><Info size={13}/>{fund.cacheStatus==="stale"?"旧缓存":fund.basis==="unit-nav"?"未复权":"近似复权"}</button><div className={`data-popover glass ${dataInfo?"open":""}`} aria-hidden={!dataInfo} inert={!dataInfo} role="status"><strong>数据说明</strong>{fund.warnings.map((w,i)=><p key={i}>{w}</p>)}<button className="text-button" onClick={()=>{setTab("help");setDataInfo(false);}}>查看算法与数据 <ArrowUpRight size={12}/></button></div></div></section>


        <section className="analysis-grid"><article className="curve-panel glass"><div className="panel-title"><h1>RT-α 滚动持有收益 <span>α = {alpha} 天</span></h1><button className="secondary-button statistics-button" onClick={()=>setStatsOpen(true)}>统计分析</button><button className="secondary-button" onClick={exportRT} disabled={!rt?.points.length}><Download size={13}/><span>CSV</span></button></div><div className="chart-subline"><span>横轴：起投日 · 纵轴：持有到期收益率</span><div className="legend"><span><i/>正收益</span><span><i className="negative"/>非正收益</span></div></div><div className="chart-body"><CurveChart key={`${fund.code}-${alpha}`} points={(rt?.points??[]).map(p=>({date:p.startDate,value:p.return,detail:`到期 ${p.endDate} · 实际 ${p.days} 天`}))}/></div><div className="chart-meta"><span>最晚完整起投日 {rt?.points.at(-1)?.startDate??"暂无完整窗口"} · 随已公布净值更新</span><span>长缺口 {rt?.skippedGaps??0} · 未到期 {rt?.incompleteCount??0}</span></div></article></section>
        <section className="metric-strip glass" aria-label="滚动收益指标"><Metric label="P(R ≤ 0)" value={pct(stats?.lossProbability)} note="历史非正收益比例" accent/><Metric label="平均收益" value={pct(stats?.mean,true)} note={`持有 ${alpha} 个自然日`}/><Metric label="中位数" value={pct(stats?.median,true)} note="完整窗口收益中位数"/><Metric label="完整窗口" value={stats?fmt.format(stats.count):"—"} note={`非重叠 ${stats?.nonOverlappingCount??0} 个`}/></section>
      </>}
      {tab==="dca"&&dcaDraft&&<>
        <form className="dca-form glass" onSubmit={e=>{e.preventDefault();try{simulateDCA(fund.points,dcaDraft);setDcaSettings({...dcaDraft});setDcaFormError("");}catch(f){setDcaFormError(errorText(f));}}}><div className="dca-fields"><label>起始日<input type="date" aria-label="定投起始日" min={fund.points[0].date} max={fund.latestNavDate} value={dcaDraft.investmentStart} onChange={e=>setDcaDraft({...dcaDraft,investmentStart:e.target.value})} required/></label><label>终止日<input type="date" aria-label="定投终止日" min={dcaDraft.investmentStart} max={fund.latestNavDate} value={dcaDraft.investmentEnd} onChange={e=>setDcaDraft({...dcaDraft,investmentEnd:e.target.value})} required/></label><label>每日金额（元）<input type="number" aria-label="每日投入金额" min="0.01" max="100000000" step="0.01" value={dcaDraft.dailyAmount||""} onChange={e=>setDcaDraft({...dcaDraft,dailyAmount:Number(e.target.value)})} required/></label><label>结算日<input type="date" aria-label="收益结算日" min={dcaDraft.investmentEnd} max={fund.latestNavDate} value={dcaDraft.settlementDate} onChange={e=>setDcaDraft({...dcaDraft,settlementDate:e.target.value})} required/></label><label className="fee-field">申购费 %<input type="number" min="0" max="99" step="0.01" value={+(dcaDraft.purchaseFeeRate*100).toFixed(4)} onChange={e=>setDcaDraft({...dcaDraft,purchaseFeeRate:Number(e.target.value)/100})}/></label><label className="fee-field">赎回费 %<input type="number" min="0" max="99" step="0.01" value={+(dcaDraft.redemptionFeeRate*100).toFixed(4)} onChange={e=>setDcaDraft({...dcaDraft,redemptionFeeRate:Number(e.target.value)/100})}/></label><button className="primary-button calculate-button">计算 <ArrowRight size={14}/></button></div>{dcaFormError&&<p className="field-error" role="alert">{dcaFormError}</p>}</form>
        {dca.error&&<div className="error-banner" role="alert">{dca.error}</div>}
        {dca.result&&<><section className="metric-strip glass dca-metrics" aria-label="定投结果"><Metric label="累计投入" value={money(dca.result.cost)} note={`${dca.result.contributions} 次投入`}/><Metric label="结算价值" value={money(dca.result.value)} note={dca.result.settlementDate} accent/><Metric label="累计收益" value={money(dca.result.profit)} note={`费用 ${money(dca.result.totalFees)}`}/><Metric label="累计收益率" value={pct(dca.result.return,true)} note="未年化 · 收益 / 成本"/></section><article className="curve-panel glass dca-curve"><div className="panel-title"><h1>定投资产曲线</h1><button className="secondary-button" onClick={exportDCA}><Download size={13}/>CSV</button></div><div className="chart-subline"><span>金额：人民币元 · 无净值日跳过、不补投</span><div className="legend"><span><i/>持仓市值</span><span><i className="negative"/>累计投入</span></div></div><div className="chart-body"><CurveChart key={`${fund.code}-${JSON.stringify(dcaSettings)}`} points={dca.result.series.map(p=>({date:p.date,value:p.value,secondary:p.cost,detail:`收益 ${money(p.profit)}`}))} money label="持仓市值"/></div><div className="chart-meta"><span>分红再投资假设 · 费用按固定比例简化</span><span>净值所属日回溯，非实际成交模拟</span></div></article></>}
      </>}
      <footer className="app-footer"><span><a href={fund.sourceUrl} target="_blank" rel="noreferrer">{fund.source}</a> · 净值日 {fund.latestNavDate}<span className="footer-fetch"> · 抓取 {new Date(fund.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}</span></span><span>{fund.qdii?"QDII 披露可能滞后 · ":""}历史数据，不构成投资建议</span><button className="text-button" onClick={()=>setTab("help")}>数据说明</button></footer>
      </>}
    </main><AnimatedDialog open={statsOpen} onClose={()=>setStatsOpen(false)} title="统计分析">{renderStats()}</AnimatedDialog>{toast&&<div className="toast" role="status"><Check size={15}/>{toast}</div>}
  </div>;
}



