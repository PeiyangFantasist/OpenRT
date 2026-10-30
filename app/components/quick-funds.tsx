"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, ChevronDown } from "lucide-react";
import { AnimatedDialog } from "./animated-dialog";

type QuickFund = { code: string; name: string };
type QuickFundsProps = {
  onSelect: (code: string) => void;
  selectedCode?: string;
  disabled?: boolean;
};
type StorageNotice = { summary: string; message: string };

const STORAGE_KEY = "openrt-quick-funds-v1";
const MAX_ROWS = 6;
const DEFAULT_FUNDS: QuickFund[] = [
  { code: "000001", name: "华夏成长" },
  { code: "161725", name: "白酒" },
  { code: "019454", name: "QDII" },
];
const copyFunds = (funds: QuickFund[]) => funds.map(fund => ({ ...fund }));

/** Keep only the editable, validated fields from this device's saved settings. */
function parseSettings(raw: string): QuickFund[] {
  if (raw.length > 10_000) throw new Error("设置过长");
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input) || input.length > MAX_ROWS) throw new Error("设置格式无效");
  const codes = new Set<string>();
  return input.map((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("基金条目无效");
    const fund = row as Record<string, unknown>;
    if (typeof fund.code !== "string" || !/^\d{6}$/.test(fund.code) ||
      (fund.name !== undefined && (typeof fund.name !== "string" || fund.name.length > 20)) ||
      codes.has(fund.code)) throw new Error("基金代码或名称无效");
    codes.add(fund.code);
    return { code: fund.code, name: typeof fund.name === "string" ? fund.name.trim() : "" };
  });
}

export function QuickFunds({ onSelect, selectedCode, disabled = false }: QuickFundsProps) {
  const inputId = useId();
  const [funds, setFunds] = useState<QuickFund[]>(() => copyFunds(DEFAULT_FUNDS));
  const [draft, setDraft] = useState<QuickFund[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<StorageNotice | null>(null);

  useEffect(() => {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      setNotice({ summary: "本地设置不可用", message: "浏览器暂时无法读取设置，已使用默认快捷基金。仍可修改并在本页使用。" });
      return;
    }
    if (raw === null) return;
    try {
      // An explicitly saved empty array means the user wants no quick buttons.
      setFunds(parseSettings(raw));
    } catch {
      setFunds(copyFunds(DEFAULT_FUNDS));
      setNotice({ summary: "已恢复默认按钮", message: "保存的设置格式无效，已恢复默认快捷基金。编辑后点击保存，可替换旧设置。" });
    }
  }, []);

  const openEditor = () => {
    setDraft(copyFunds(funds));
    setError("");
    setOpen(true);
  };
  const closeEditor = () => {
    setOpen(false);
    setError("");
  };
  const editRow = (index: number, field: keyof QuickFund, value: string) => {
    setDraft(rows => rows.map((row, position) => position === index ? { ...row, [field]: value } : row));
    setError("");
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = draft.map(fund => ({ code: fund.code.trim(), name: fund.name.trim() }));
    if (normalized.length > MAX_ROWS) {
      setError("最多设置 6 只快捷基金。");
      return;
    }
    const codes = new Set<string>();
    for (let index = 0; index < normalized.length; index++) {
      const fund = normalized[index];
      if (!/^\d{6}$/.test(fund.code)) {
        setError(`第 ${index + 1} 行需要填写完整的 6 位基金代码，或删除这一行。`);
        return;
      }
      if (fund.name.length > 20) {
        setError(`第 ${index + 1} 行的名称不能超过 20 个字符。`);
        return;
      }
      if (codes.has(fund.code)) {
        setError(`基金代码 ${fund.code} 重复，请保留一行。`);
        return;
      }
      codes.add(fund.code);
    }
    setFunds(normalized);
    setDraft(copyFunds(normalized));
    setError("");
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setNotice(null);
      setOpen(false);
    } catch {
      // Storage can be disabled or full; explicit changes still work this session.
      setNotice({ summary: "修改仅在本页生效", message: "快捷基金已在本页更新，但浏览器无法保存设置；刷新后可能恢复原设置。可以关闭此窗口继续使用。" });
    }
  };

  return <>
    <details className="quick-menu"><summary>快捷基金 <ChevronDown size={12}/></summary><div className="quick-funds glass" aria-label="快捷基金">
      <div className="quick-code-buttons">
        {funds.map(fund => <button
          type="button"
          key={fund.code}
          className={selectedCode === fund.code ? "selected" : ""}
          disabled={disabled}
          title={fund.name ? `${fund.name} · ${fund.code}` : fund.code}
          aria-label={`选择${fund.name || "基金"} ${fund.code}`}
          onClick={() => onSelect(fund.code)}
        >{fund.name || fund.code}</button>)}
      </div>
      <button type="button" className="quick-edit" onClick={openEditor} aria-label="设置快捷基金" title="设置快捷基金"><Pencil size={13}/></button>
      {notice && !open && <span className="quick-note" role="status" title={notice.message}>{notice.summary}</span>}
    </div></details>
    <AnimatedDialog open={open} onClose={closeEditor} title="快捷基金设置">
      <form className="quick-editor" onSubmit={save} noValidate>
        <p className="quick-note">最多 6 只。名称可留空；点击保存后生效，直接关闭会放弃未保存的修改。</p>
        {draft.map((fund, index) => <div className="quick-row" key={index}>
          <label htmlFor={`${inputId}-code-${index}`}>基金代码
            <input
              id={`${inputId}-code-${index}`}
              aria-label={`第 ${index + 1} 只基金代码`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              pattern="[0-9]{6}"
              value={fund.code}
              placeholder="6 位代码"
              onChange={event => editRow(index, "code", event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <label htmlFor={`${inputId}-name-${index}`}>名称（可选）
            <input
              id={`${inputId}-name-${index}`}
              aria-label={`第 ${index + 1} 只基金名称`}
              autoComplete="off"
              maxLength={20}
              value={fund.name}
              placeholder="最多 20 字符"
              onChange={event => editRow(index, "name", event.target.value.slice(0, 20))}
            />
          </label>
          <button type="button" aria-label={`删除第 ${index + 1} 只快捷基金`} title="删除" onClick={() => { setDraft(rows => rows.filter((_, position) => position !== index)); setError(""); }}><Trash2 size={15}/></button>
        </div>)}
        {draft.length === 0 && <p className="quick-note">没有快捷基金。可以添加，也可以直接保存为空列表。</p>}
        {error && <p className="quick-error" role="alert">{error}</p>}
        {notice && <p className="quick-note" role="status">{notice.message}</p>}
        <div className="quick-save-row">
          <button type="button" className="secondary-button" disabled={draft.length >= MAX_ROWS} onClick={() => { setDraft(rows => [...rows, { code: "", name: "" }]); setError(""); }}><Plus size={13}/>添加基金</button>
          <button type="submit" className="primary-button">保存</button>
        </div>
      </form>
    </AnimatedDialog>
  </>;
}
