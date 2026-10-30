"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { AnimatedDialog } from "./animated-dialog";
import { winner } from "../../lib/comparison";
import "../comparison.css";

export type ComparisonMetricRow = {
  id: string;
  label: string;
  a: number | null;
  b: number | null;
  format: "percent" | "money" | "number";
  direction: "higher" | "lower" | "neutral";
  note?: string;
};

export type ComparisonMetricsProps = {
  rows: ComparisonMetricRow[];
  labels: [string, string];
  compact?: boolean;
  active?: boolean;
};

const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const signedMetrics = new Set(["mean", "median", "min", "max", "p05", "p95", "p25", "p75", "profit", "return"]);

function metricColor(id: string, value: number | null, side: "a" | "b") {
  if (!signedMetrics.has(id) || value === null || !Number.isFinite(value) || value === 0) return "var(--ink)";
  if (side === "b") return value > 0 ? "var(--compare-b-positive, #1976e9)" : "var(--compare-b-negative, #c69200)";
  return value > 0 ? "var(--positive, #d9363e)" : "var(--negative, #168659)";
}

function formatValue(value: number | null, format: ComparisonMetricRow["format"], signed = true) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (format === "money") return currency.format(value);
  if (format === "number") return integer.format(value);
  return `${signed && value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

const ruleLabels = {
  higher: "越高越优",
  lower: "越低越优",
  neutral: "中性指标，不判优劣",
} as const;

const metricDescriptions: Record<string, string> = {
  lossProbability: "完整窗口中，收益小于或等于零的数量占比，包含零收益。它是历史样本比例。",
  mean: "所有完整窗口收益率的算术平均值，未年化。",
  median: "按收益率排序后位于中间的结果，用于观察历史样本的中心位置。",
  count: "两支基金在相同起投日、相同到期日下可计算的完整窗口数。重叠窗口不是独立试验。",
  min: "完整窗口中的最低历史收益，不是未来收益下限。",
  max: "完整窗口中的最高历史收益，不是未来收益上限。",
  p05: "历史收益的第 5 百分位数，按排序位置在相邻样本间线性插值。",
  p25: "历史收益的第 25 百分位数，即下四分位数。",
  p75: "历史收益的第 75 百分位数，即上四分位数。",
  p95: "历史收益的第 95 百分位数，按排序位置在相邻样本间线性插值。",
  sd: "窗口收益围绕均值的离散程度，采用样本标准差；只有一个样本时不计算。",
  positiveProbability: "完整窗口中收益大于零的数量占比，不包含零收益。",
  nonOverlappingCount: "按较早到期顺序选取的不重叠窗口数，仍不等于有效独立样本量。",
  cost: "在共同净值日实际投入金额的合计；已从每笔投入扣除的申购费包含在成本中。",
  value: "在实际结算净值日按模型份额估值，并扣除简化赎回费后的价值。",
  profit: "结算价值减累计投入后的金额。",
  return: "累计收益除以累计投入，未年化。",
  fees: "按所设固定申购费率和赎回费率计算的费用合计。",
  contributions: "共同净值日内实际投入的次数；无共同净值的日期不补投。",
};

export function ComparisonMetrics({ rows, labels, compact = false, active = true }: ComparisonMetricsProps) {
  const [selected, setSelected] = useState<ComparisonMetricRow | null>(null);
  useEffect(() => { if (!active) setSelected(null); }, [active]);
  return <><div className={`cmp-metrics${compact ? " cmp-metrics--compact" : ""}`}>
    {rows.map(row => {
      const preferred = winner(row.a, row.b, row.direction);
      return <section key={row.id} className={`cmp-metric cmp-metric--${row.format}`} data-metric={row.id} aria-label={row.label}>
        <h3 className="cmp-metric-heading"><span>{row.label}</span><button type="button" className="cmp-info-button" aria-label={`${row.label}说明`} aria-haspopup="dialog" onClick={() => setSelected(row)}><Info size={12}/></button></h3>
        <div className="cmp-metric-values">
          {(["a", "b"] as const).map((side, index) => {
            const value = row[side];
            const isWinner = preferred === side;
            const formatted = formatValue(value, row.format, !["lossProbability", "positiveProbability", "sd"].includes(row.id));
            return <div key={side} className={`cmp-value-cell cmp-value-cell--${side}${isWinner ? " cmp-value-cell--winner" : ""}`} data-winner={isWinner || undefined}>
              <span className="cmp-fund-label" title={labels[index]}><i aria-hidden="true"/>{labels[index]}</span>
              <strong className="cmp-value" style={{ color: metricColor(row.id, value, side) }} title={`${labels[index]}：${formatted}`}>{formatted}</strong>
              {isWinner && <span className="cmp-winner-badge" aria-label={`${labels[index]}在${row.label}指标较优`}>WIN!</span>}
            </div>;
          })}
        </div>
      </section>;
    })}
  </div><AnimatedDialog open={Boolean(selected) && active} onClose={() => setSelected(null)} title={selected?.label ?? "指标说明"}><div className="cmp-metric-explanation">{selected?.note && <p>{selected.note}</p>}<p>{selected && metricDescriptions[selected.id]}</p><p>{selected && ruleLabels[selected.direction]}。WIN! 只标记这一项的历史比较结果，不表示基金整体评级。</p></div></AnimatedDialog></>;
}
