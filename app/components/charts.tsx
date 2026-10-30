"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { estimateDensity } from "../../lib/density";
import "../density.css";

type ChartPoint = { date: string; value: number; secondary?: number; detail?: string };
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const positive = "var(--positive, #d9363e)";
const negative = "var(--negative, #168659)";
const signColor = (value: number) => value > 0 ? positive : value < 0 ? negative : "var(--ink)";

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
      const next = { width: Math.max(240, Math.round(rect.width)), height: Math.max(150, Math.round(rect.height)) };
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
  const left = width < 550 ? 48 : 64, right = 16, top = height < 210 ? 16 : 24, bottom = height < 210 ? 32 : 40;
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
  // Split the asset line exactly where value crosses cost, rather than colouring
  // every positive currency value as a gain. Paths remain continuous per run.
  const moneyLines = { positive: "", negative: "" };
  if (money) {
    const key = (difference: number) => difference > 0 ? "positive" as const : "negative" as const;
    let previousKey = key(points[0].value - (points[0].secondary ?? 0));
    moneyLines[previousKey] = `M${x(0)},${y(points[0].value)}`;
    for (let i = 1; i < points.length; i++) {
      const before = points[i - 1], point = points[i];
      const beforeDifference = before.value - (before.secondary ?? 0);
      const difference = point.value - (point.secondary ?? 0);
      const currentKey = key(difference);
      if (currentKey !== previousKey) {
        const fraction = beforeDifference / (beforeDifference - difference);
        const crossX = x(i - 1) + (x(i) - x(i - 1)) * fraction;
        const crossY = y(before.value + (point.value - before.value) * fraction);
        moneyLines[previousKey] += ` L${crossX},${crossY}`;
        moneyLines[currentKey] += ` M${crossX},${crossY}`;
      }
      moneyLines[currentKey] += ` L${x(i)},${y(point.value)}`;
      previousKey = currentKey;
    }
  }
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
  const tooltipWidth = Math.min(240, width - 16);
  const tooltipLeft = activeIndex === null ? 8 : Math.max(8, Math.min(width - tooltipWidth - 8, x(activeIndex) + 16));
  return <div className="chart-wrap" ref={chartRef} style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
    <svg className="curve-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ flex: "1 1 0", minHeight: 0, width: "100%", height: "100%" }} role="img" aria-label={label} aria-describedby={`${id}-instructions`} tabIndex={0}
      onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * width; const fraction = Math.max(0, Math.min(1, (px - left) / plotW)); setHover(nearestDateIndex(firstTime + fraction * timeSpan)); }}
      onPointerLeave={() => setHover(null)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) { event.preventDefault(); setHover(current => event.key === "Escape" ? null : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (current ?? 0) + (event.key === "ArrowRight" ? 1 : -1)))); } }}>
      <desc id={`${id}-instructions`}>移动指针或轻触曲线查看详情；聚焦图表后可用左右方向键浏览样本，Home 和 End 跳到首尾，Escape 关闭提示。</desc>
      <defs>
        <linearGradient id={`${id}-positive-area`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={zeroY}><stop offset="0%" stopColor={positive} stopOpacity=".12"/><stop offset="100%" stopColor={positive} stopOpacity=".01"/></linearGradient>
        <linearGradient id={`${id}-negative-area`} gradientUnits="userSpaceOnUse" x1="0" y1={zeroY} x2="0" y2={top + plotH}><stop offset="0%" stopColor={negative} stopOpacity=".01"/><stop offset="100%" stopColor={negative} stopOpacity=".12"/></linearGradient>
        <linearGradient id={`${id}-stroke`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={top + plotH}><stop offset={`${zeroPercent}%`} stopColor={positive}/><stop offset={`${zeroPercent}%`} stopColor={negative}/></linearGradient>
        <clipPath id={`${id}-plot`}><rect x={left - 2} y={top - 2} width={plotW + 4} height={plotH + 4}/></clipPath>
        <clipPath id={`${id}-positive`}><rect x={left - 2} y={top - 2} width={plotW + 4} height={Math.max(0, zeroY - top + 2)}/></clipPath>
        <clipPath id={`${id}-negative`}><rect x={left - 2} y={zeroY} width={plotW + 4} height={Math.max(0, top + plotH - zeroY + 2)}/></clipPath>
      </defs>
      {ticks.map((value, i) => <g key={i}><line x1={left} y1={y(value)} x2={width - right} y2={y(value)} className="chart-grid"/><text x={left - 12} y={y(value) + 4} textAnchor="end" className="axis-label">{money ? number.format(value) : `${(value * 100).toFixed(0)}%`}</text></g>)}
      {!money && <g><line x1={left} y1={y(0)} x2={width - right} y2={y(0)} className="zero-line"/><text x={width - right - 4} y={y(0) - 7} textAnchor="end" className="zero-label">盈亏平衡</text></g>}
      <g clipPath={`url(#${id}-plot)`}>{money ? <>{hasSecondary && <path d={line(true)} fill="none" stroke="var(--ink)" opacity=".4" strokeWidth="1.6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/>}{(["positive", "negative"] as const).map(sign => <path key={sign} d={moneyLines[sign]} fill="none" stroke={sign === "positive" ? positive : negative} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)}</> : <><path d={fill} fill={`url(#${id}-positive-area)`} clipPath={`url(#${id}-positive)`}/><path d={fill} fill={`url(#${id}-negative-area)`} clipPath={`url(#${id}-negative)`}/><path d={mainLine} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/></>}</g>
      {dateTicks.map((time, i) => <text key={time} x={xDate(time)} y={height - 15} textAnchor={dateTicks.length === 1 ? "middle" : i === 0 ? "start" : i === dateTicks.length - 1 ? "end" : "middle"} className="axis-label">{axisDate(time)}</text>)}
      {active && activeIndex !== null && <g><line x1={x(activeIndex)} y1={top} x2={x(activeIndex)} y2={height - bottom} stroke="var(--ink)" opacity=".4" strokeDasharray="4 4"/><circle cx={x(activeIndex)} cy={y(active.value)} r="5" fill={signColor(active.value - (money ? active.secondary ?? 0 : 0))} stroke="var(--page)" strokeWidth="3"/></g>}
    </svg>
    {active && activeIndex !== null && <div className="chart-tooltip" style={{ left: tooltipLeft, width: tooltipWidth, minWidth: 0, maxWidth: "calc(100% - 16px)" }}><strong>{active.date}</strong><span>{label}<b style={{ color: signColor(active.value - (money ? active.secondary ?? 0 : 0)) }}>{format(active.value)}</b></span>{hasSecondary && <span>{secondaryLabel}<b style={{ color: "var(--ink)" }}>{format(active.secondary ?? 0)}</b></span>}{active.detail && <small>{active.detail}</small>}</div>}
  </div>;
}

export function Distribution({ values }: { values: number[] }) {
  const estimate = useMemo(() => estimateDensity(values), [values]);
  const [activeValue, setActiveValue] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const hostRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const id = `density-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  useEffect(() => { setActiveValue(null); }, [estimate]);
  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const resize = () => setWidth(Math.max(240, Math.round(element.getBoundingClientRect().width)));
    resize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [!!estimate]);
  if (!estimate) return <div className="distribution-empty">完整样本出现后显示收益分布</div>;
  const height = width < 480 ? 160 : 192;
  const left = 48, right = 16, top = 24, bottom = 32;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const [domainMin, domainMax] = estimate.domain;
  const peak = Math.max(...estimate.curve.map(point => point.density)) * 1.08;
  const x = (value: number) => left + (value - domainMin) / (domainMax - domainMin) * plotWidth;
  const y = (density: number) => top + (1 - density / peak) * plotHeight;
  const baseline = height - bottom, zeroX = x(0);
  const curve = estimate.curve.map((point, index) => `${index ? "L" : "M"}${x(point.value).toFixed(3)},${y(point.density).toFixed(3)}`).join(" ");
  const area = `${curve} L${x(domainMax)},${baseline} L${x(domainMin)},${baseline} Z`;
  const selected = activeValue === null ? null : Math.max(domainMin, Math.min(domainMax, activeValue));
  const selectedDensity = selected === null ? null : estimate.evaluate(selected);
  const cumulative = selected === null ? null : estimate.empirical(selected);
  const loss = estimate.empirical(0);
  const densityText = (value: number) => value > 0 && value < 0.0001 ? value.toExponential(2) : value.toFixed(4);
  const thresholdText = (value: number) => `${(value * 100).toFixed(3)}%`;
  const ticks = [domainMin, (domainMin + domainMax) / 2, domainMax].filter(value => Math.abs(x(value) - zeroX) > 32);
  const tooltipWidth = Math.min(width < 480 ? 208 : 240, width - 16);
  const tooltipLeft = selected === null ? 8 : Math.max(8, Math.min(width - tooltipWidth - 8, x(selected) + 16));
  const selectAtPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pixel = Math.max(left, Math.min(width - right, (event.clientX - rect.left) / rect.width * width));
    const value = domainMin + (pixel - left) / plotWidth * (domainMax - domainMin);
    setActiveValue(Math.abs(pixel - zeroX) <= 4 ? 0 : value);
  };
  return <div className="density-chart" ref={hostRef}>
    <div className="density-summary"><span><i className="density-negative"/>亏损率 <b>{percent(loss.probability)}</b></span><span><i className="density-positive"/>正收益占比 <b>{percent(1 - loss.probability)}</b></span></div>
    <svg className="density-svg" viewBox={`0 0 ${width} ${height}`} style={{ height }} role="img" aria-label="历史收益的平滑概率密度曲线，零收益左侧绿色，右侧红色" aria-describedby={`${id}-instructions${selected !== null ? ` ${id}-tooltip` : ""}`} tabIndex={0}
      onPointerMove={selectAtPointer} onPointerDown={event => { selectAtPointer(event); if (event.pointerType === "touch") event.currentTarget.focus({ preventScroll: true }); }}
      onPointerLeave={event => { if (event.pointerType !== "touch" && !focused.current) setActiveValue(null); }}
      onFocus={() => { focused.current = true; setActiveValue(current => current ?? 0); }} onBlur={() => { focused.current = false; setActiveValue(null); }}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Escape") { event.stopPropagation(); setActiveValue(null); return; }
        if (event.key === "Home") { setActiveValue(domainMin); return; }
        if (event.key === "End") { setActiveValue(domainMax); return; }
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const current = selected ?? 0;
        const next = direction > 0 ? estimate.curve.find(point => point.value > current) : [...estimate.curve].reverse().find(point => point.value < current);
        setActiveValue(next?.value ?? (direction > 0 ? domainMax : domainMin));
      }}>
      <desc id={`${id}-instructions`}>横轴是持有收益率，纵轴是每一个百分点的概率密度。曲线高度不是概率。移动指针或轻触查看阈值处的密度与真实样本累计占比；左右方向键逐点浏览，Home、End 跳至首尾，Escape 关闭提示。</desc>
      <defs><clipPath id={`${id}-negative`}><rect x={left} y={top} width={Math.max(0, zeroX - left)} height={plotHeight}/></clipPath><clipPath id={`${id}-positive`}><rect x={zeroX} y={top} width={Math.max(0, width - right - zeroX)} height={plotHeight}/></clipPath>
        <linearGradient id={`${id}-negative-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={negative} stopOpacity=".18"/><stop offset="100%" stopColor={negative} stopOpacity=".02"/></linearGradient><linearGradient id={`${id}-positive-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={positive} stopOpacity=".18"/><stop offset="100%" stopColor={positive} stopOpacity=".02"/></linearGradient>
      </defs>
      {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1={left} x2={width - right} y1={y(peak * fraction)} y2={y(peak * fraction)} className="chart-grid"/><text x={left - 8} y={y(peak * fraction) + 4} textAnchor="end" className="axis-label">{(peak * fraction / 100).toFixed(3)}</text></g>)}
      <text x={left} y={16} className="axis-label">密度 / 1 个百分点</text>
      <path d={area} fill={`url(#${id}-negative-fill)`} clipPath={`url(#${id}-negative)`}/><path d={area} fill={`url(#${id}-positive-fill)`} clipPath={`url(#${id}-positive)`}/>
      <path d={curve} fill="none" stroke={negative} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${id}-negative)`} vectorEffect="non-scaling-stroke"/><path d={curve} fill="none" stroke={positive} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${id}-positive)`} vectorEffect="non-scaling-stroke"/>
      <line x1={zeroX} x2={zeroX} y1={top} y2={baseline} className="density-zero-line"/><text x={zeroX} y={height - 8} textAnchor="middle" className="density-zero-label">0%</text>
      {ticks.map((value, index) => <text key={value} x={x(value)} y={height - 8} textAnchor={index === 0 && value === domainMin ? "start" : value === domainMax ? "end" : "middle"} className="axis-label">{percent(value)}</text>)}
      {selected !== null && selectedDensity !== null && <g><line x1={x(selected)} x2={x(selected)} y1={top} y2={baseline} stroke="var(--ink)" opacity=".4" strokeDasharray="4 4"/><circle cx={x(selected)} cy={y(selectedDensity)} r="4" fill={signColor(selected)} stroke="var(--page)" strokeWidth="2"/></g>}
    </svg>
    {selected !== null && selectedDensity !== null && cumulative && <div id={`${id}-tooltip`} className="distribution-tooltip density-tooltip" role="tooltip" style={{ left: tooltipLeft, right: "auto", width: tooltipWidth, minWidth: 0, maxWidth: "calc(100% - 16px)" }}><strong>收益阈值 <b style={{ color: signColor(selected) }}>{thresholdText(selected)}</b></strong><span>密度 / 1 个百分点 <b>{densityText(selectedDensity / 100)}</b></span><span>累计样本占比 <b>{percent(cumulative.probability)}</b></span><span>≤ 阈值窗口 <b>{cumulative.count} / {estimate.count}</b></span></div>}
    <p className="density-note">高斯核平滑 · 曲线高度不是概率；尾部可能超出已观察收益。{estimate.constant && " 当前样本收益相同，宽度仅用于显示。"}</p>
    <span className="density-sr-only" aria-live="polite" aria-atomic="true">{focused.current && selected !== null && cumulative ? `收益阈值 ${thresholdText(selected)}，密度每一个百分点 ${densityText((selectedDensity ?? 0) / 100)}，历史累计占比 ${percent(cumulative.probability)}，${cumulative.count} / ${estimate.count} 个窗口。` : ""}</span>
  </div>;
}
