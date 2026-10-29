"use client";

import { useEffect, useId, useRef, useState } from "react";

type ChartPoint = { date: string; value: number; secondary?: number; detail?: string };
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

export function CurveChart({ points, money = false, label = "历史滚动持有收益率", secondaryLabel = "累计投入" }: { points: ChartPoint[]; money?: boolean; label?: string; secondaryLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [chartSize, setChartSize] = useState({ width: 1040, height: 330 });
  const chartRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const isEmpty = points.length === 0;
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      const next = { width: Math.max(320, Math.round(rect.width)), height: Math.max(150, Math.round(rect.height)) };
      setChartSize(current => current.width === next.width && current.height === next.height ? current : next);
    };
    resize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isEmpty]);
  if (!points.length) return <div className="chart-empty"><span className="empty-orbit">α</span><strong>这个持有期还没有完整样本</strong><p>试试较短的 α，或选择历史记录更长的基金。</p></div>;
  const { width, height } = chartSize;
  const left = width < 550 ? 50 : 62, right = 15, top = height < 210 ? 12 : 20, bottom = height < 210 ? 30 : 38;
  const plotW = width - left - right, plotH = height - top - bottom;
  const values = points.flatMap(p => p.secondary === undefined ? [p.value] : [p.value, p.secondary]);
  let low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = high - low || 0.1;
  low -= span * 0.10; high += span * 0.12;
  const y = (value: number) => top + ((high - value) / (high - low)) * plotH;
  const times = points.map(point => Date.parse(`${point.date}T00:00:00Z`));
  const firstTime = times[0], timeSpan = times[times.length - 1] - firstTime;
  const xDate = (time: number) => left + (timeSpan === 0 ? plotW / 2 : (time - firstTime) / timeSpan * plotW);
  const x = (index: number) => xDate(times[index]);
  const nearestDateIndex = (time: number) => {
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const middle = Math.floor((lo + hi) / 2); if (times[middle] < time) lo = middle + 1; else hi = middle; }
    return lo > 0 && Math.abs(times[lo - 1] - time) <= Math.abs(times[lo] - time) ? lo - 1 : lo;
  };
  const line = (secondary = false) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(secondary ? p.secondary ?? 0 : p.value).toFixed(2)}`).join(" ");
  const hasSecondary = points[0].secondary !== undefined;
  const mainLine = line();
  const fill = `${mainLine} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const zeroY = y(0);
  const zeroPercent = Math.max(0, Math.min(100, (zeroY - top) / plotH * 100));
  const activeIndex = hover === null ? null : Math.min(hover, points.length - 1);
  const active = activeIndex === null ? null : points[activeIndex];
  const tickCount = height < 210 ? 3 : 5;
  const ticks = Array.from({ length: tickCount }, (_, index) => high - index / (tickCount - 1) * (high - low));
  const format = (value: number) => money ? `¥${number.format(value)}` : percent(value);
  const dateTickCount = width < 420 ? 2 : width < 700 ? 3 : 4;
  const dateTicks = timeSpan === 0 ? [firstTime] : Array.from({ length: dateTickCount }, (_, index) => firstTime + timeSpan * index / (dateTickCount - 1));
  const axisDate = (time: number) => { const date = new Date(time).toISOString().slice(0, 10); return timeSpan === 0 ? date : timeSpan < 120 * 86400000 ? date.slice(5) : date.slice(0, 7); };
  return <div className="chart-wrap" ref={chartRef} style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
    <svg className="curve-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ flex: "1 1 0", minHeight: 0, width: "100%", height: "100%" }} role="img" aria-label={label} aria-describedby={`${id}-instructions`} tabIndex={0}
      onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * width; const fraction = Math.max(0, Math.min(1, (px - left) / plotW)); setHover(nearestDateIndex(firstTime + fraction * timeSpan)); }}
      onPointerLeave={() => setHover(null)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) { event.preventDefault(); setHover(current => event.key === "Escape" ? null : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (current ?? 0) + (event.key === "ArrowRight" ? 1 : -1)))); } }}>
      <desc id={`${id}-instructions`}>移动指针或轻触曲线查看详情；聚焦图表后可用左右方向键浏览样本，Home 和 End 跳到首尾，Escape 关闭提示。</desc>
      <defs>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e78a45" stopOpacity=".20"/><stop offset="100%" stopColor="#e78a45" stopOpacity=".015"/></linearGradient>
        <linearGradient id={`${id}-positive-area`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={zeroY}><stop offset="0%" stopColor="#cc584d" stopOpacity=".18"/><stop offset="100%" stopColor="#cc584d" stopOpacity=".025"/></linearGradient>
        <linearGradient id={`${id}-negative-area`} gradientUnits="userSpaceOnUse" x1="0" y1={zeroY} x2="0" y2={top + plotH}><stop offset="0%" stopColor="#36866d" stopOpacity=".025"/><stop offset="100%" stopColor="#36866d" stopOpacity=".18"/></linearGradient>
        <linearGradient id={`${id}-stroke`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={top + plotH}><stop offset={`${zeroPercent}%`} stopColor="#cc584d"/><stop offset={`${zeroPercent}%`} stopColor="#36866d"/></linearGradient>
        <clipPath id={`${id}-plot`}><rect x={left - 2} y={top - 2} width={plotW + 4} height={plotH + 4}/></clipPath>
        <clipPath id={`${id}-positive`}><rect x={left - 2} y={top - 2} width={plotW + 4} height={Math.max(0, zeroY - top + 2)}/></clipPath>
        <clipPath id={`${id}-negative`}><rect x={left - 2} y={zeroY} width={plotW + 4} height={Math.max(0, top + plotH - zeroY + 2)}/></clipPath>
      </defs>
      {ticks.map((value, i) => <g key={i}><line x1={left} y1={y(value)} x2={width - right} y2={y(value)} className="chart-grid"/><text x={left - 12} y={y(value) + 4} textAnchor="end" className="axis-label">{money ? number.format(value) : `${(value * 100).toFixed(0)}%`}</text></g>)}
      {!money && <g><line x1={left} y1={y(0)} x2={width - right} y2={y(0)} className="zero-line"/><text x={width - right - 4} y={y(0) - 7} textAnchor="end" className="zero-label">盈亏平衡</text></g>}
      <g clipPath={`url(#${id}-plot)`}>{money ? <path d={fill} fill={`url(#${id}-area)`}/> : <><path d={fill} fill={`url(#${id}-positive-area)`} clipPath={`url(#${id}-positive)`}/><path d={fill} fill={`url(#${id}-negative-area)`} clipPath={`url(#${id}-negative)`}/></>}<path d={mainLine} fill="none" stroke={money ? "#d97732" : `url(#${id}-stroke)`} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>{hasSecondary && <path d={line(true)} fill="none" stroke="#aba39a" strokeWidth="1.8" strokeDasharray="5 5" vectorEffect="non-scaling-stroke"/>}</g>
      {dateTicks.map((time, i) => <text key={time} x={xDate(time)} y={height - 15} textAnchor={dateTicks.length === 1 ? "middle" : i === 0 ? "start" : i === dateTicks.length - 1 ? "end" : "middle"} className="axis-label">{axisDate(time)}</text>)}
      {active && activeIndex !== null && <g><line x1={x(activeIndex)} y1={top} x2={x(activeIndex)} y2={height - bottom} stroke="#8b8179" strokeDasharray="4 4"/><circle cx={x(activeIndex)} cy={y(active.value)} r="5" fill={money ? "#d97732" : active.value > 0 ? "#cc584d" : "#36866d"} stroke="white" strokeWidth="3"/></g>}
    </svg>
    {active && activeIndex !== null && <div className="chart-tooltip" style={{ left: `${Math.min(72, Math.max(8, x(activeIndex) / width * 100))}%` }}><strong>{active.date}</strong><span>{label}<b style={{ color: money ? "#d97732" : active.value > 0 ? "#cc584d" : "#36866d" }}>{format(active.value)}</b></span>{hasSecondary && <span>{secondaryLabel}<b>{format(active.secondary ?? 0)}</b></span>}{active.detail && <small>{active.detail}</small>}</div>}
  </div>;
}

export function Distribution({ values }: { values: number[] }) {
  const [activeBin, setActiveBin] = useState<number | null>(null);
  const [focusedBin, setFocusedBin] = useState<number | null>(null);
  const tooltipId = useId();
  if (!values.length) return <div className="distribution-empty">完整样本出现后显示收益分布</div>;
  const min = Math.min(...values), max = Math.max(...values), constant = min === max;
  const padding = constant ? Math.max(0.01, Math.abs(min) * 0.05) : 0;
  const domainMin = min - padding, domainMax = max + padding, spread = domainMax - domainMin;
  // An odd bin count puts a constant series exactly at the center of its domain.
  const binCount = 31;
  const bins = Array.from({ length: binCount }, (_, i) => ({ count: 0, nonPositive: 0, lower: domainMin + i / binCount * spread, upper: domainMin + (i + 1) / binCount * spread }));
  values.forEach(value => { const bin = bins[Math.max(0, Math.min(binCount - 1, Math.floor((value - domainMin) / spread * binCount)))]; bin.count++; if (value <= 0) bin.nonPositive++; });
  const biggest = Math.max(1, ...bins.map(bin => bin.count));
  const nonPositiveCount = values.filter(value => value <= 0).length;
  const precision = Math.max(2, Math.min(8, Math.ceil(-Math.log10(spread / binCount * 100)) + 2));
  const intervalPercent = (value: number) => { const text = (value * 100).toFixed(precision); return `${Number(text) === 0 ? (0).toFixed(precision) : text}%`; };
  const interval = (index: number) => `[${intervalPercent(bins[index].lower)}, ${intervalPercent(bins[index].upper)}${index === binCount - 1 ? "]" : ")"}`;
  const details = (index: number) => { const bin = bins[index]; return `收益区间 ${interval(index)}，${bin.count} 个窗口，占总窗口 ${percent(bin.count / values.length)}；正收益 ${bin.count - bin.nonPositive} 个，非正收益 ${bin.nonPositive} 个。`; };
  const selected = activeBin === null ? null : bins[activeBin];
  return <div className="histogram" style={{ position: "relative" }} onPointerLeave={() => setActiveBin(focusedBin)}><div className="histogram-bars" role="group" aria-label={`历史持有收益分布：${nonPositiveCount} 个非正收益窗口，${values.length - nonPositiveCount} 个正收益窗口；红色为正收益，绿色为非正收益`}>{bins.map((bin, index) => {
    const lossShare = bin.count ? bin.nonPositive / bin.count * 100 : 0;
    return <div key={index} role={bin.count > 0 ? "button" : undefined} tabIndex={bin.count > 0 ? 0 : undefined} aria-hidden={bin.count === 0 || undefined} aria-label={bin.count > 0 ? details(index) : undefined} aria-describedby={activeBin === index ? tooltipId : undefined} className={`histogram-bar ${bin.count > 0 && bin.nonPositive === bin.count ? "negative" : ""}`} style={{ height: `${bin.count / biggest * 100}%`, ...(bin.nonPositive > 0 && bin.nonPositive < bin.count ? { background: `linear-gradient(to top, #36866d ${lossShare}%, #cc584d ${lossShare}%)` } : {}) }} title={details(index)}
      onPointerEnter={() => { if (bin.count) setActiveBin(index); }}
      onPointerMove={() => { if (bin.count) setActiveBin(index); }}
      onPointerDown={event => { if (bin.count) { setActiveBin(index); if (event.pointerType === "touch") event.currentTarget.focus({ preventScroll: true }); } }}
      onFocus={() => { setFocusedBin(index); setActiveBin(index); }}
      onBlur={() => { setFocusedBin(null); setActiveBin(current => current === index ? null : current); }}
      onKeyDown={event => {
        if (event.key === "Escape" && activeBin !== null) { event.preventDefault(); event.stopPropagation(); setActiveBin(null); }
        else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveBin(index); }
      }}/>
  })}</div><div className="histogram-axis"><span>{percent(domainMin)}</span><span>{constant ? `全部样本 ${percent(min)}` : "收益率"}</span><span>{percent(domainMax)}</span></div>{selected && activeBin !== null && <div className="distribution-tooltip" role="tooltip" id={tooltipId}><strong>{interval(activeBin)}</strong><span>窗口数量 <b>{selected.count}</b></span><span>占全部窗口 <b>{percent(selected.count / values.length)}</b></span><span>正收益 <b>{selected.count - selected.nonPositive}</b></span><span>非正收益 <b>{selected.nonPositive}</b></span></div>}</div>;
}
