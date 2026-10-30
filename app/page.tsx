"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Wallet, BookOpen, Columns2, ArrowUpRight, ArrowRight, Download, Search, RefreshCw, Sun, Moon, Settings2, ChevronDown, Info, ExternalLink, AlertCircle, Check } from "lucide-react";
import { ALPHA_PRESETS, rollingReturns, simulateDCA, type NavPoint } from "../lib/analytics";
import { fetchFundClient } from "../lib/fund-client";
import { CurveChart, Distribution } from "./components/charts";
const MethodHelp = lazy(()=>import("./components/method-help").then(module=>({default:module.MethodHelp})));
import { InteractionEffects } from "./components/interactions";
import { LiquidGlassEffects } from "./components/liquid-glass";
import { AnimatedDialog } from "./components/animated-dialog";
import { QuickFunds } from "./components/quick-funds";
import { ComparisonWorkspace } from "./components/comparison-workspace";
import type { FundData } from "../lib/fund-data";
import { beijingDate } from "../lib/calendar";

type Tab = "rt" | "dca" | "compare" | "help";
type Fund = FundData;

type DCASettings = { investmentStart: string; investmentEnd: string; dailyAmount: number; settlementDate: string; purchaseFeeRate: number; redemptionFeeRate: number };
const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (value: number | null | undefined, signed = false) => value == null ? "—" : `${signed && value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const money = (value: number | undefined) => value === undefined ? "—" : currency.format(value);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const errorText = (error: unknown) => error instanceof Error ? error.message : "暂时无法完成，请稍后重试。";


function downloadCSV(filename: string, columns: string[], rows: (string | number)[][]) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const file = new Blob(["\uFEFF", [columns, ...rows].map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function Brand() {
  return <a className="brand" href="#main" aria-label="OpenRT 首页"><span className="brand-icon" aria-hidden="true"/><span className="brand-text"><strong>Open<em>RT</em></strong><small>Return Curve Advise for Individual Investors</small></span></a>;
}
function ThemeControl() {
  const [theme, setTheme] = useState<"light"|"dark">(()=>{
    try { const saved=localStorage.getItem("openrt-theme"); if(saved==="light"||saved==="dark")return saved; } catch {}
    return typeof window!=="undefined"&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  });
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",theme==="dark"?"#000000":"#ffffff");
  },[theme]);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const changed=()=>{try{if(localStorage.getItem("openrt-theme"))return;}catch{}setTheme(media.matches?"dark":"light");};
    media.addEventListener("change",changed);return()=>media.removeEventListener("change",changed);
  },[]);
  return <button className="theme-toggle icon-button" type="button" aria-label={theme==="dark"?"切换明亮模式":"切换夜间模式"} title={theme==="dark"?"明亮模式":"夜间模式"} onClick={()=>{const next=theme==="dark"?"light":"dark";setTheme(next);try{localStorage.setItem("openrt-theme",next);}catch{}}}>{theme==="dark"?<Sun size={20}/>:<Moon size={20}/>}</button>;
}
function Metric({ label, value, note, change }: {label:string;value:string;note:string;change?:number|null}) {
  const [explaining,setExplaining]=useState(false);
  return <div className="metric"><span>{label}</span><button className="metric-info" type="button" aria-label={`${label}说明`} onClick={()=>setExplaining(true)}><Info size={12}/></button><strong className={change==null||change===0?"":change>0?"positive-value":"negative-value"}>{value}</strong><AnimatedDialog open={explaining} onClose={()=>setExplaining(false)} title={label}><p className="metric-explanation">{note}</p></AnimatedDialog></div>;
}
export default function Home() {
  const [statsOpen, setStatsOpen] = useState(false);
  const [today, setToday] = useState(()=>beijingDate());
  const lastToday = useRef(today);
  const loadedCode = useRef<string | null>(null);
  const [dataInfo, setDataInfo] = useState(false);
  const [tab, setTab] = useState<Tab>("rt");
  const compareMode=tab==="compare";
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
  const [dcaSettingsOpen,setDcaSettingsOpen]=useState(false);
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
    const refresh=setInterval(()=>{if(document.visibilityState==="visible"&&!compareMode&&loadedCode.current)void loadFund(loadedCode.current);},15*60_000);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{clearInterval(clock);clearInterval(refresh);document.removeEventListener("visibilitychange",onVisible);};
  },[loadFund,compareMode]);
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
  const navItems = [{id:"rt" as Tab,label:"RT",Icon:Activity},{id:"dca" as Tab,label:"定投",Icon:Wallet},{id:"compare" as Tab,label:"对比",Icon:Columns2},{id:"help" as Tab,label:"算法",Icon:BookOpen}];
  const selectTab=(next:Tab)=>{setTab(next);setDataInfo(false);setStatsOpen(false);setDcaSettingsOpen(false);};
  const renderStats = () => <aside className="stats-panel glass" aria-label="收益统计"><div className="panel-title"><h2>收益密度</h2><span>{fmt.format(stats?.count ?? 0)} 个窗口</span></div><Distribution values={(rt?.points ?? []).map(p=>p.return)}/><dl className="statistics">{[["最差",pct(stats?.min,true)],["最好",pct(stats?.max,true)],["P5",pct(stats?.p05,true)],["P95",pct(stats?.p95,true)],["P25",pct(stats?.p25,true)],["P75",pct(stats?.p75,true)],["样本标准差",pct(stats?.sd)],["正收益占比",pct(stats?.positiveProbability)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className={!["样本标准差","正收益占比"].includes(label)?(value.startsWith("-")?"negative-value":value.startsWith("+")?"positive-value":""):""}>{value}</dd></div>)}</dl></aside>;
  const renderDcaForm=()=>{if(!fund||!dcaDraft)return null;return <form className="dca-form dca-plan-editor" onSubmit={e=>{e.preventDefault();try{simulateDCA(fund.points,dcaDraft);setDcaSettings({...dcaDraft});setDcaFormError("");setDcaSettingsOpen(false);}catch(f){setDcaFormError(errorText(f));}}}><div className="dca-fields"><label>起始日<input type="date" aria-label="定投起始日" min={fund.points[0].date} max={fund.latestNavDate} value={dcaDraft.investmentStart} onChange={e=>setDcaDraft({...dcaDraft,investmentStart:e.target.value})} required/></label><label>终止日<input type="date" aria-label="定投终止日" min={dcaDraft.investmentStart} max={fund.latestNavDate} value={dcaDraft.investmentEnd} onChange={e=>setDcaDraft({...dcaDraft,investmentEnd:e.target.value})} required/></label><label>每日金额（元）<input type="number" aria-label="每日投入金额" min="0.01" max="100000000" step="0.01" value={dcaDraft.dailyAmount||""} onChange={e=>setDcaDraft({...dcaDraft,dailyAmount:Number(e.target.value)})} required/></label><label>结算日<input type="date" aria-label="收益结算日" min={dcaDraft.investmentEnd} max={fund.latestNavDate} value={dcaDraft.settlementDate} onChange={e=>setDcaDraft({...dcaDraft,settlementDate:e.target.value})} required/></label></div><details className="advanced-settings"><summary>费率设置 <ChevronDown size={12}/></summary><div className="advanced-fields"><label className="fee-field">申购费 %<input type="number" min="0" max="99" step="0.01" value={+(dcaDraft.purchaseFeeRate*100).toFixed(4)} onChange={e=>setDcaDraft({...dcaDraft,purchaseFeeRate:Number(e.target.value)/100})}/></label><label className="fee-field">赎回费 %<input type="number" min="0" max="99" step="0.01" value={+(dcaDraft.redemptionFeeRate*100).toFixed(4)} onChange={e=>setDcaDraft({...dcaDraft,redemptionFeeRate:Number(e.target.value)/100})}/></label></div></details><button className="primary-button calculate-button">计算 <ArrowRight size={14}/></button>{dcaFormError&&<p className="field-error" role="alert">{dcaFormError}</p>}</form>;};
  return <div className="app-shell"><InteractionEffects/><LiquidGlassEffects/>
    <header className="app-header"><Brand/><div className="header-actions"><span className="header-date"><time>{today}</time><small>北京日期</small></span><a className="github-link icon-button" href="https://github.com/PeiyangFantasist/OpenRT" target="_blank" rel="noreferrer" aria-label="GitHub 仓库"><ExternalLink size={18}/></a><ThemeControl/></div></header>
    <main id="main" className={`workspace view-${tab} ${compareMode?"mode-compare":""}`}>
    <div className="comparison-host" hidden={!compareMode}><ComparisonWorkspace active={compareMode} today={today} initialFund={fund} initialAlpha={alpha} initialDca={dcaSettings}/></div>
    <div className="single-workspace" hidden={compareMode}>
      {tab!=="help" && <section className="fund-toolbar" aria-label="基金查询">
        <div className="search-surface liquid-surface glass"><form className="fund-search" onSubmit={e=>{e.preventDefault();void loadFund(code);}}><Search size={20}/><input id="fund-code" aria-label="基金代码" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="输入 6 位基金代码"/><button className="primary-button" disabled={loading} aria-label="查询基金">{loading?<RefreshCw size={16} className="spin"/>:<ArrowRight size={20}/>}</button></form></div>
        <QuickFunds onSelect={next=>void loadFund(next)} selectedCode={fund?.code} disabled={loading}/>
        {fund&&!loading&&<><div className="fund-identity"><strong title={fund.name}>{fund.name}</strong><span>{fund.code}{fund.qdii?" · QDII":""} · 净值日 {fund.latestNavDate}</span></div><div className="nav-value"><strong>{fund.points.at(-1)!.nav.toFixed(4)}</strong><span>单位净值</span></div><button className="icon-button refresh-data" aria-label="刷新基金数据" title="重新读取官方数据" disabled={loading} onClick={()=>void loadFund(fund.code,true)}><RefreshCw size={16}/></button></>}
      </section>}
      {error&&tab!=="help"&&<div className="error-banner" role="alert"><AlertCircle size={15}/><span>{error}{fund?` 当前仍显示 ${fund.code} 的上次结果。`:""}</span><button onClick={()=>setError("")} aria-label="关闭错误提示">×</button></div>}
      {tab==="help"?<Suspense fallback={<section className="loading-panel glass" role="status">正在载入说明…</section>}><MethodHelp/></Suspense>:loading?<section className="loading-panel glass" role="status"><RefreshCw size={21} className="spin"/><p>正在读取历史净值…</p></section>:!fund?<section className="loading-panel empty-state"><div className="empty-mark" aria-hidden="true"><Activity size={40} strokeWidth={1.5}/></div><h1>查询基金</h1><p>请输入基金编号查询或快捷按键查看基金</p></section>:<>
      {tab==="rt"&&<>
        <section className="alpha-toolbar" aria-label="持有期设置"><span className="toolbar-label">持有期 α</span><div className="segmented-control">{ALPHA_PRESETS.map(p=><button key={p.days} aria-pressed={alpha===p.days} className={alpha===p.days?"active":""} onClick={()=>setPreset(p.days)}>{p.label}</button>)}</div><form className="custom-alpha" onSubmit={e=>{e.preventDefault();applyCustomAlpha();}}><input aria-label="自定义持有天数" type="number" min="1" max="3650" step="1" value={alphaInput} onChange={e=>setAlphaInput(e.target.value)}/><span>天</span><button aria-label="应用自定义持有天数"><ArrowRight size={14}/></button></form>{alphaError&&<span className="field-error" role="alert">{alphaError}</span>}<div className="data-info-wrap"><button className="text-button" onClick={()=>setDataInfo(!dataInfo)} aria-expanded={dataInfo}><Info size={13}/>{fund.cacheStatus==="stale"?"旧缓存":fund.basis==="unit-nav"?"未复权":"近似复权"}</button><div className={`data-popover glass ${dataInfo?"open":""}`} aria-hidden={!dataInfo} inert={!dataInfo} role="status"><strong>数据说明</strong>{fund.warnings.map((w,i)=><p key={i}>{w}</p>)}<button className="text-button" onClick={()=>{setTab("help");setDataInfo(false);}}>查看算法与数据 <ArrowUpRight size={12}/></button></div></div></section>


        <section className="analysis-grid"><article className="curve-panel glass"><div className="panel-title"><h1>RT-α <span>α = {alpha} 天</span></h1><button className="secondary-button statistics-button" onClick={()=>setStatsOpen(true)}>统计分析</button><button className="secondary-button" onClick={exportRT} disabled={!rt?.points.length}><Download size={13}/><span>CSV</span></button></div><div className="chart-subline"><div className="legend"><span><i/>正收益</span><span><i className="negative"/>非正收益</span></div></div><div className="chart-body"><CurveChart key={`${fund.code}-${alpha}`} points={(rt?.points??[]).map(p=>({date:p.startDate,value:p.return,detail:`到期 ${p.endDate} · 实际 ${p.days} 天`}))}/></div><div className="chart-meta"><span>最晚完整起投日 {rt?.points.at(-1)?.startDate??"暂无完整窗口"}</span><span>长缺口 {rt?.skippedGaps??0} · 未到期 {rt?.incompleteCount??0}</span></div></article></section>
        <section className="metric-strip glass" aria-label="滚动收益指标"><Metric label="亏损率" value={pct(stats?.lossProbability)} note="包含零收益"/><Metric label="平均收益" value={pct(stats?.mean,true)} note={`持有 ${alpha} 个自然日`} change={stats?.mean}/><Metric label="中位数" value={pct(stats?.median,true)} note="完整窗口收益中位数" change={stats?.median}/><Metric label="完整窗口" value={stats?fmt.format(stats.count):"—"} note={`非重叠 ${stats?.nonOverlappingCount??0} 个`}/></section>
      </>}
      {tab==="dca"&&dcaDraft&&<>
        <section className="single-plan-toolbar"><button className="secondary-button" type="button" onClick={()=>setDcaSettingsOpen(true)}><Settings2 size={14}/>定投设置</button><div><strong>每日 {money(dcaSettings?.dailyAmount)}</strong><span>{dcaSettings?.investmentStart} — {dcaSettings?.investmentEnd}</span></div><span className="plan-settlement">结算 {dcaSettings?.settlementDate}</span></section>

        {dca.error&&<div className="error-banner" role="alert">{dca.error}</div>}
        {dca.result&&<><section className="metric-strip glass dca-metrics" aria-label="定投结果"><Metric label="累计投入" value={money(dca.result.cost)} note={`${dca.result.contributions} 次投入`}/><Metric label="结算价值" value={money(dca.result.value)} note={dca.result.settlementDate}/><Metric label="累计收益" value={money(dca.result.profit)} note={`费用 ${money(dca.result.totalFees)}`} change={dca.result.profit}/><Metric label="累计收益率" value={pct(dca.result.return,true)} note="未年化 · 收益 / 成本" change={dca.result.return}/></section><article className="curve-panel glass dca-curve"><div className="panel-title"><h1>定投资产曲线</h1><button className="secondary-button" onClick={exportDCA}><Download size={13}/>CSV</button></div><div className="chart-subline"><div className="legend"><span><i/>盈利</span><span><i className="negative"/>亏损</span><span><i className="cost"/>投入</span></div></div><div className="chart-body"><CurveChart key={`${fund.code}-${JSON.stringify(dcaSettings)}`} points={dca.result.series.map(p=>({date:p.date,value:p.value,secondary:p.cost,detail:`收益 ${money(p.profit)}`}))} money label="持仓市值"/></div><div className="chart-meta"><span>结算 {dca.result.settlementDate}</span></div></article></>}
      </>}
      <footer className="app-footer"><span><a href={fund.sourceUrl} target="_blank" rel="noreferrer">{fund.source}</a> · 净值日 {fund.latestNavDate} · 今日 {today}</span><button className="text-button" aria-label="算法与数据说明" onClick={()=>selectTab("help")}><Info size={14}/></button></footer>
      </>}
    </div></main><div className="dock-zone"><nav className="bottom-dock glass liquid-surface" data-glass-priority="2" aria-label="主要功能" style={{"--nav-index":navItems.findIndex(item=>item.id===tab)} as React.CSSProperties}><span className="dock-selection" aria-hidden="true"/>{navItems.map(({id,label,Icon})=><button type="button" key={id} className={tab===id?"active":""} onClick={()=>selectTab(id)} aria-pressed={tab===id} aria-label={label}><Icon size={24} strokeWidth={tab===id?2.5:1.8}/><span>{label}</span></button>)}</nav></div><AnimatedDialog open={dcaSettingsOpen} onClose={()=>setDcaSettingsOpen(false)} title="定投设置">{renderDcaForm()}</AnimatedDialog><AnimatedDialog open={statsOpen} onClose={()=>setStatsOpen(false)} title="统计分析">{renderStats()}</AnimatedDialog>{toast&&<div className="toast" role="status"><Check size={15}/>{toast}</div>}
  </div>;
}



