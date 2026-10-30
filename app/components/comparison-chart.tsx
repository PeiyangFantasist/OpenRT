"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";

export type ComparisonPoint = { date: string; a: number; b: number; cost?: number; detail?: string };
type ComparisonChartProps = { points: ComparisonPoint[]; labels: [string, string]; money?: boolean };
const DAY = 86_400_000;
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const POSITIVE = "var(--positive, #d9363e)";
const NEGATIVE = "var(--negative, #168659)";
const COST = "var(--ink)";

export function ComparisonChart({ points, labels, money = false }: ComparisonChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 1040, height: 330 });
  const id = `comparison-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const data = useMemo(() => points.flatMap(point => {
    const time = Date.parse(`${point.date}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== point.date ||
      !Number.isFinite(point.a) || !Number.isFinite(point.b)) return [];
    return [{ ...point, time, cost: point.cost !== undefined && Number.isFinite(point.cost) ? point.cost : undefined }];
  }).sort((a, b) => a.time - b.time), [points]);
  const empty = data.length === 0;

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      const next = { width: Math.max(240, Math.round(rect.width)), height: Math.max(120, Math.round(rect.height)) };
      setSize(current => current.width === next.width && current.height === next.height ? current : next);
    };
    resize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [empty]);
  useEffect(() => { setHover(null); }, [data, money]);

  // Hover changes only the markers and tooltip; long historical paths stay memoized.
  const geometry = useMemo(() => {
    if (!data.length) return null;
    const { width, height } = size;
    const left = width < 550 ? 50 : 65;
    const right = 14;
    const top = height < 210 ? 11 : 20;
    const bottom = height < 210 ? 29 : 37;
    const plotW = Math.max(1, width - left - right);
    const plotH = Math.max(1, height - top - bottom);
    let low = 0, high = 0;
    for (const point of data) {
      low = Math.min(low, point.a, point.b, point.cost ?? 0);
      high = Math.max(high, point.a, point.b, point.cost ?? 0);
    }
    const span = high - low || (money ? 1 : 0.01);
    low = money && low === 0 ? 0 : low - span * 0.10;
    high += span * 0.12;
    const y = (value: number) => top + (high - value) / (high - low) * plotH;
    const firstTime = data[0].time;
    const timeSpan = data[data.length - 1].time - firstTime;
    const xDate = (time: number) => left + (timeSpan === 0 ? plotW / 2 : (time - firstTime) / timeSpan * plotW);
    const x = (index: number) => xDate(data[index].time);
    const path = (field: "a" | "b" | "cost") => {
      let connected = false;
      return data.map((point, index) => {
        const value = point[field];
        if (value === undefined) { connected = false; return ""; }
        const command = connected ? "L" : "M";
        connected = true;
        return `${command}${x(index).toFixed(2)},${y(value).toFixed(2)}`;
      }).join(" ");
    };
    const signedPaths = (field: "a" | "b") => {
      const result = { positive: "", negative: "" };
      const key = (difference: number) => difference > 0 ? "positive" as const : "negative" as const;
      let previousKey = key(data[0][field] - (data[0].cost ?? 0));
      result[previousKey] = `M${x(0)},${y(data[0][field])}`;
      for (let index = 1; index < data.length; index++) {
        const before = data[index - 1], point = data[index];
        const beforeDifference = before[field] - (before.cost ?? 0);
        const difference = point[field] - (point.cost ?? 0);
        const currentKey = key(difference);
        if (currentKey !== previousKey) {
          const fraction = beforeDifference / (beforeDifference - difference);
          const crossX = x(index - 1) + (x(index) - x(index - 1)) * fraction;
          const crossY = y(before[field] + (point[field] - before[field]) * fraction);
          result[previousKey] += ` L${crossX},${crossY}`;
          result[currentKey] += ` M${crossX},${crossY}`;
        }
        result[currentKey] += ` L${x(index)},${y(point[field])}`;
        previousKey = currentKey;
      }
      return result;
    };
    const tickCount = height < 210 ? 3 : 5;
    const ticks = Array.from({ length: tickCount }, (_, index) => high - index / (tickCount - 1) * (high - low));
    const dateCount = width < 420 ? 2 : width < 700 ? 3 : 4;
    const dateTicks = timeSpan === 0 ? [firstTime] : Array.from({ length: dateCount }, (_, index) => firstTime + timeSpan * index / (dateCount - 1));
    return {
      width, height, left, right, top, bottom, plotW, plotH, y, x, xDate,
      firstTime, timeSpan, ticks, dateTicks,
      pathA: path("a"), pathB: path("b"), pathCost: path("cost"),
      moneyPaths: money ? { a: signedPaths("a"), b: signedPaths("b") } : null,
      hasCost: data.some(point => point.cost !== undefined),
      zeroY: y(0), zeroPercent: Math.max(0, Math.min(100, (y(0) - top) / plotH * 100)),
    };
  }, [data, size, money]);

  if (!geometry) return <div className="chart-empty"><strong>需要两支基金的共同净值数据</strong></div>;
  const { width, height, left, right, top, bottom, plotW, plotH, x, y, xDate, timeSpan, firstTime } = geometry;
  const selected = hover === null ? null : Math.max(0, Math.min(data.length - 1, hover));
  const active = selected === null ? null : data[selected];
  const color = (value: number, cost = 0) => value > cost ? POSITIVE : value < cost ? NEGATIVE : COST;
  const format = (value: number) => money ? currency.format(value) : `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
  const axisDate = (time: number) => {
    const date = new Date(time).toISOString().slice(0, 10);
    return timeSpan === 0 ? date : timeSpan < 120 * DAY ? date.slice(5) : date.slice(0, 7);
  };
  const nearest = (time: number) => {
    let lo = 0, hi = data.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (data[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && time - data[lo - 1].time <= data[lo].time - time ? lo - 1 : lo;
  };
  const pointAtPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pixel = (event.clientX - rect.left) / rect.width * width;
    const fraction = Math.max(0, Math.min(1, (pixel - left) / plotW));
    setHover(nearest(firstTime + fraction * timeSpan));
  };
  const tooltipWidth = Math.min(width < 550 ? 210 : 240, width * 0.7);
  const tooltipLeft = selected === null ? 8 : Math.max(8, Math.min(width - tooltipWidth - 8, x(selected) + 14));
  const activeDescription = active ? `${active.date}，A ${labels[0]} ${format(active.a)}，B ${labels[1]} ${format(active.b)}${active.cost === undefined ? "" : `，累计投入 ${format(active.cost)}`}${active.detail ? `。${active.detail}` : ""}` : "";
  const nameStyle = { flex: "1 1 0", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

  return <div className="chart-wrap" ref={chartRef} style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
    <svg
      className="curve-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ flex: "1 1 0", minHeight: 0, width: "100%", height: "100%", touchAction: "pan-y" }}
      role="img"
      aria-label={`两支基金${money ? "定投资产" : "滚动收益"}对比：A ${labels[0]}，B ${labels[1]}。A 为实线，B 为虚线。`}
      aria-describedby={`${id}-instructions${active ? ` ${id}-tooltip` : ""}`}
      tabIndex={0}
      onPointerMove={pointAtPointer}
      onPointerDown={event => { pointAtPointer(event); if (event.pointerType === "touch") event.currentTarget.focus({ preventScroll: true }); }}
      onPointerLeave={event => { if (event.pointerType !== "touch" && !focused.current) setHover(null); }}
      onFocus={() => { focused.current = true; setHover(current => current ?? 0); }}
      onBlur={() => { focused.current = false; setHover(null); }}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Escape") { setHover(null); return; }
        if (event.key === "Home") { setHover(0); return; }
        if (event.key === "End") { setHover(data.length - 1); return; }
        setHover(current => current === null
          ? (event.key === "ArrowRight" ? 0 : data.length - 1)
          : Math.max(0, Math.min(data.length - 1, current + (event.key === "ArrowRight" ? 1 : -1))));
      }}
    >
      <desc id={`${id}-instructions`}>两支基金使用相同日期和纵轴比例。移动指针或轻触查看同日数值；聚焦后可用左右方向键浏览，Home、End 跳到首尾，Escape 关闭提示。</desc>
      <defs>
        <linearGradient id={`${id}-signed`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={top} y2={top + plotH}>
          <stop offset={`${geometry.zeroPercent}%`} stopColor={POSITIVE}/>
          <stop offset={`${geometry.zeroPercent}%`} stopColor={NEGATIVE}/>
        </linearGradient>
        <clipPath id={`${id}-plot`}><rect x={left - 3} y={top - 3} width={plotW + 6} height={plotH + 6}/></clipPath>
      </defs>
      {geometry.ticks.map((value, index) => <g key={index}>
        <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid"/>
        <text x={left - 10} y={y(value) + 4} textAnchor="end" className="axis-label">{money ? Math.abs(value) >= 10_000 ? compact.format(value) : integer.format(value) : `${(value * 100).toFixed(0)}%`}</text>
      </g>)}
      {!money && <g>
        <line x1={left} x2={width - right} y1={geometry.zeroY} y2={geometry.zeroY} className="zero-line"/>
        <text x={width - right - 4} y={geometry.zeroY - 7} textAnchor="end" className="zero-label">盈亏平衡</text>
      </g>}
      <g clipPath={`url(#${id}-plot)`}>
        {geometry.hasCost && <path d={geometry.pathCost} fill="none" stroke={COST} opacity=".4" strokeWidth="1.6" strokeDasharray="2 4" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
        {geometry.moneyPaths ? (["a", "b"] as const).map(series => (["positive", "negative"] as const).map(sign => <path key={`${series}-${sign}`} d={geometry.moneyPaths![series][sign]} fill="none" stroke={sign === "positive" ? POSITIVE : NEGATIVE} strokeWidth="2.2" strokeDasharray={series === "b" ? "7 5" : undefined} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)) : <><path d={geometry.pathA} fill="none" stroke={`url(#${id}-signed)`} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/><path d={geometry.pathB} fill="none" stroke={`url(#${id}-signed)`} strokeWidth="2.2" strokeDasharray="7 5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/></>}
        {data.length === 1 && <>
          <circle cx={x(0)} cy={y(data[0].a)} r="3" fill={color(data[0].a, money ? data[0].cost : 0)}/>
          <circle cx={x(0)} cy={y(data[0].b)} r="5" fill="none" stroke={color(data[0].b, money ? data[0].cost : 0)} strokeWidth="2" strokeDasharray="2 2"/>
        </>}
      </g>
      {geometry.dateTicks.map((time, index) => <text key={time} x={xDate(time)} y={height - 13} textAnchor={geometry.dateTicks.length === 1 ? "middle" : index === 0 ? "start" : index === geometry.dateTicks.length - 1 ? "end" : "middle"} className="axis-label">{axisDate(time)}</text>)}
      {active && selected !== null && <g>
        <line x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} stroke="var(--ink)" opacity=".4" strokeDasharray="4 4"/>
        {active.cost !== undefined && <circle cx={x(selected)} cy={y(active.cost)} r="3" fill={COST} stroke="var(--page)" strokeWidth="1.5"/>}
        <circle cx={x(selected)} cy={y(active.a)} r="4" fill={color(active.a, money ? active.cost : 0)} stroke="var(--page)" strokeWidth="2"/>
        <circle cx={x(selected)} cy={y(active.b)} r="5.5" fill="none" stroke={color(active.b, money ? active.cost : 0)} strokeWidth="2" strokeDasharray="3 2"/>
      </g>}
    </svg>
    {active && <div id={`${id}-tooltip`} className="chart-tooltip" role="tooltip" style={{ left: tooltipLeft, width: tooltipWidth, maxWidth: "calc(100% - 16px)", minWidth: 0, maxHeight: "calc(100% - 16px)", overflow: "hidden" }}>
      <strong>{active.date}</strong>
      <span style={{ gap: 8 }}><span style={nameStyle} title={labels[0]}>A · {labels[0]}</span><b style={{ color: color(active.a, money ? active.cost : 0), flexShrink: 0 }}>{format(active.a)}</b></span>
      <span style={{ gap: 8 }}><span style={nameStyle} title={labels[1]}>B · {labels[1]}</span><b style={{ color: color(active.b, money ? active.cost : 0), flexShrink: 0 }}>{format(active.b)}</b></span>
      {active.cost !== undefined && <span style={{ gap: 8 }}><span style={nameStyle}>累计投入</span><b style={{ color: "var(--ink)", flexShrink: 0 }}>{format(active.cost)}</b></span>}
      {active.detail && <small style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{active.detail}</small>}
    </div>}
    <span aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0 }}>{focused.current ? activeDescription : ""}</span>
  </div>;
}
