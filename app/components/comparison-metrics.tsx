"use client";

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
};

const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const signedMetrics = new Set(["mean", "median", "min", "max", "p05", "p95", "p25", "p75", "profit", "return"]);

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

export function ComparisonMetrics({ rows, labels, compact = false }: ComparisonMetricsProps) {
  return <div className={`cmp-metrics${compact ? " cmp-metrics--compact" : ""}`}>
    {rows.map(row => {
      const preferred = winner(row.a, row.b, row.direction);
      return <section key={row.id} className={`cmp-metric cmp-metric--${row.format}`} data-metric={row.id} aria-label={row.label}>
        <h3 className="cmp-metric-heading">{row.label}</h3>
        <div className="cmp-metric-values">
          {(["a", "b"] as const).map((side, index) => {
            const value = row[side];
            const isWinner = preferred === side;
            const formatted = formatValue(value, row.format, !["lossProbability", "positiveProbability", "sd"].includes(row.id));
            return <div key={side} className={`cmp-value-cell cmp-value-cell--${side}${isWinner ? " cmp-value-cell--winner" : ""}`} data-winner={isWinner || undefined}>
              <span className="cmp-fund-label" title={labels[index]}><i aria-hidden="true"/>{labels[index]}</span>
              <strong className="cmp-value" style={{ color: signedMetrics.has(row.id) && value !== null && Number.isFinite(value) && value !== 0 ? value > 0 ? "var(--positive, #d9363e)" : "var(--negative, #168659)" : "var(--ink)" }} title={`${labels[index]}：${formatted}`}>{formatted}</strong>
              {isWinner && <span className="cmp-winner-badge" aria-label={`${labels[index]}在${row.label}指标较优`}>優勝！</span>}
            </div>;
          })}
        </div>
        <p className="cmp-metric-note" title={row.note ? `${row.note} · ${ruleLabels[row.direction]}` : ruleLabels[row.direction]}>{row.note && <span>{row.note}<span aria-hidden="true"> · </span></span>}{ruleLabels[row.direction]}</p>
      </section>;
    })}
  </div>;
}
