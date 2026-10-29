"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/** Only authored explanations are rendered. Source data never becomes TeX/HTML. */
export function MathFormula({ tex, inline = false }: { tex: string; inline?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, {
    displayMode: !inline,
    output: "htmlAndMathml",
    throwOnError: false,
    trust: false,
    strict: "ignore",
    maxExpand: 1000,
    maxSize: 20,
  }), [tex, inline]);
  return inline
    ? <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
    : <div className="help-formula" dangerouslySetInnerHTML={{ __html: html }} />;
}
