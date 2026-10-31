"use client";

import { Fragment, useEffect, useRef, useState, useMemo, useSyncExternalStore } from "react";
import { MathFormula } from "./math";

import { getHelpTopics } from "../../lib/documentation";

import {getUserSettings,subscribeUserSettings} from '../../lib/user-settings';

export function MethodHelp() {
  const {language}=useSyncExternalStore(subscribeUserSettings,getUserSettings,getUserSettings);
  const topics=useMemo(()=>getHelpTopics(language),[language]);
  const contentRef=useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(()=>{if(contentRef.current)contentRef.current.scrollTop=0;},[selected,pageIndex]);
  const topic = topics[selected];
  const page = topic.pages[pageIndex];

  return <section className="help-panel glass" aria-label="计算方法与数据说明">
    <nav className="help-topics" aria-label="帮助主题">
      {topics.map((item, index) => <button
        key={item.id}
        type="button"
        className={`help-topic${selected === index ? " active" : ""}`}
        aria-pressed={selected === index}
        aria-controls="method-help-content"
        onClick={() => { setSelected(index); setPageIndex(0); }}
      >{item.label}</button>)}
    </nav>
    <article ref={contentRef} className="help-content" id="method-help-content" aria-labelledby="method-help-title">
      <nav className="help-subtabs" aria-label={`${topic.label}小节`}>
        {topic.pages.map((item, index) => <button
          key={item.label}
          type="button"
          className={pageIndex === index ? "active" : ""}
          aria-pressed={pageIndex === index}
          onClick={() => setPageIndex(index)}
        >{item.label}</button>)}
      </nav>
      <h2 id="method-help-title">{page.title}</h2>
      <p>{page.paragraphs[0]}</p>
      {page.math?.map(tex => <MathFormula key={tex} tex={tex}/>)}
      {page.variables && <p className="help-variables">{page.variables.map((variable, index) => <Fragment key={variable.tex}>
        {index > 0 && (language==='en'?'; ':'；')}<MathFormula tex={variable.tex} inline/>{language==='en'?': ':'：'}{variable.description}
      </Fragment>)}</p>}
      {page.paragraphs.slice(1).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      {page.example && <p className="help-example">{page.example}</p>}
      {page.note && <p className="help-note">{page.note}</p>}
      {page.links && <div className="help-links">{page.links.map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>}
      <div className="help-pager" aria-label="帮助翻页">
        <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex(value => value - 1)}>上一页</button>
        <span aria-live="polite">{pageIndex + 1} / {topic.pages.length}</span>
        <button type="button" disabled={pageIndex === topic.pages.length - 1} onClick={() => setPageIndex(value => value + 1)}>下一页</button>
      </div>
    </article>
  </section>;
}
