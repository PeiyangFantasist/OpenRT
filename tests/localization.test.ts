import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import ts from 'typescript';
import {translateUI,translateDisplayData} from '../lib/i18n.ts';
import {getHelpTopics,topics} from '../lib/documentation.ts';
import {runAgent,DEFAULT_AGENT_SETTINGS} from '../lib/agent-client.ts';
const han=/\p{Script=Han}/u;
test('every English documentation page retains its content and links without Chinese explanation or formula annotations',()=>{
  const en=getHelpTopics('en');assert.equal(en.length,topics.length);assert.equal(new Set(en.map(t=>t.id)).size,en.length);
  en.forEach((topic,i)=>{assert.equal(topic.pages.length,topics[i].pages.length);topic.pages.forEach((page,j)=>{assert.equal(page.paragraphs.length,topics[i].pages[j].paragraphs.length);assert.deepEqual(page.links?.map(l=>l.href),topics[i].pages[j].links?.map(l=>l.href));});});
  assert.equal(han.test(JSON.stringify(en)),false);
  assert.equal(getHelpTopics('zh'),topics);
});
test('rendered explanation fragments across active components have English coverage',async()=>{
  const paths=['app/page.tsx',...(await readdir('app/components')).filter(f=>f.endsWith('.tsx')&&f!=='quick-funds.tsx').map(f=>'app/components/'+f)];
  const missing:string[]=[];
  for(const path of paths){const source=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n:ts.Node){if(ts.isJsxText(n)){const s=n.text.trim();if(han.test(s)&&s!=='简体中文'&&han.test(translateUI(s)))missing.push(`${path}: ${s}`);}ts.forEachChild(n,visit);}visit(source);}
  assert.deepEqual(missing,[]);
});
test('dynamic dates, limits and chart captions translate while retaining numeric values and fund names',()=>{
  for(const s of ['净值截至 2026-10-30','预算不能低于已承诺模拟投入 1200.00 元。','日期超出已公布净值范围（2024-01-01 至 2024-12-31）。请使用已公布的历史日期。','按源事件标记及其日增长率近似校正了 3 次分红或拆分。日增长率有舍入误差，这不是官方认证复权净值；分红再投资的实际确认日可能不同。'])assert.equal(han.test(translateUI(s)),false,s);
  assert.match(translateUI('净值截至 2026-10-30'),/2026-10-30/);
  assert.match(translateUI('华夏成长混合 · 分析窗口累计收益'),/^华夏成长混合/);
  assert.match(translateUI('华夏成长混合 · 分析窗口累计收益'),/Analysis-window cumulative return/);
});
test('display localization preserves user text, names, labels, URLs and financial values without mutating data',()=>{
  const data={name:'收益',labels:['华夏成长'],instruction:'我的研究目标',url:'https://example.test/资料',warning:'样本较少，均值、相关性和尾部风险估计不稳定。',value:1.25};
  const displayed=translateDisplayData(data) as typeof data;
  for(const key of ['name','labels','instruction','url','value'] as const)assert.deepEqual(displayed[key],data[key]);
  assert.equal(han.test(displayed.warning),false);assert.equal(han.test(data.warning),true);
});
test('English interface preference reaches the model system message without changing user text',async()=>{
  const user='请查看我的基金';let system='';
  await runAgent({language:'en',settings:{...DEFAULT_AGENT_SETTINGS,apiKey:'fake-test-key'},messages:[{role:'user',content:user}],execute:async()=>({data:{}}),onEvent:()=>{},fetcher:async(_url,init)=>{const body=JSON.parse(String(init?.body));system=body.messages[0].content;assert.equal(body.messages[1].content,user);return new Response(JSON.stringify({choices:[{message:{content:'Ready'}}]}),{headers:{'content-type':'application/json'}});}});
  assert.match(system,/Answer concisely in English/);assert.equal(system.includes('用中文简洁回答'),false);
});
