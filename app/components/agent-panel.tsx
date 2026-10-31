"use client";
import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, Check, ChevronDown, Info, Plus, Settings2, Square, X } from "lucide-react";
import { DEFAULT_AGENT_SETTINGS, completionEndpoint, runAgent, type AgentSettings, type ToolCall } from "../../lib/agent-client";
import { createToolExecutor, TOOL_LABELS, type AnalysisContext, type ToolOutcome } from "../../lib/agent-tools";
import { getPersonalStore } from "../../lib/personal-store";
import { fetchFundClient } from "../../lib/fund-client";
import { AnimatedDialog } from "./animated-dialog";
import { AgentResult } from "./agent-result";
import {getAgentConfiguration,saveAgentConfiguration,markAgentVerified,subscribeAgentConfiguration} from "../../lib/agent-configuration";

type Trace={call:ToolCall;outcome?:ToolOutcome;error?:boolean};
type ChatMessage={id:string;role:"user"|"assistant";content:string;calls:Trace[];status?:"running"|"error"|"stopped";error?:string};
const CHAT_KEY="openrt-agent-chat-v1";
function loadChat():ChatMessage[]{
  try{const raw=localStorage.getItem(CHAT_KEY);if(!raw||raw.length>700_000)return [];const list=JSON.parse(raw);if(!Array.isArray(list))return [];return list.slice(-60).filter(v=>v&&typeof v.id==="string"&&(v.role==="user"||v.role==="assistant")&&typeof v.content==="string").map(v=>({id:v.id.slice(0,100),role:v.role,content:v.content.slice(0,16000),calls:[]}));}catch{return [];}
}
const TraceCard=memo(function TraceCard({trace,onOpenFund}:{trace:Trace;onOpenFund:(code:string)=>void}){
  const [expanded,setExpanded]=useState(false);
  return <div className={`agent-tool${trace.error?" agent-tool-error":""}`}><button type="button" className="agent-tool-title" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{trace.outcome?<Check size={13}/>:<span className="agent-working-dot"/>}<span>{TOOL_LABELS[trace.call.function.name]??trace.call.function.name}</span><ChevronDown size={12}/></button>{expanded&&<div className="agent-tool-details"><code>{trace.call.function.arguments}</code>{trace.outcome&&<pre>{JSON.stringify(trace.outcome.data,null,2)}</pre>}</div>}{trace.outcome&&<AgentResult outcome={trace.outcome} onOpenFund={onOpenFund}/>}</div>;
});
export function AgentPanel({context,onOpenFund,onBusyChange,active}:{context:()=>AnalysisContext;onOpenFund:(code:string)=>void;onBusyChange:(busy:boolean)=>void;active:boolean}){
  const config=useSyncExternalStore(subscribeAgentConfiguration,getAgentConfiguration,getAgentConfiguration),{settings,remember}=config;
  const [draft,setDraft]=useState(settings),[draftRemember,setDraftRemember]=useState(remember);
  const [configOpen,setConfigOpen]=useState(false),[configError,setConfigError]=useState(""),[infoOpen,setInfoOpen]=useState(false),[clearOpen,setClearOpen]=useState(false);
  const [messages,setMessages]=useState<ChatMessage[]>(loadChat),[question,setQuestion]=useState(""),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState("");
  const controller=useRef<AbortController|null>(null),listRef=useRef<HTMLDivElement>(null),follow=useRef(true),serial=useRef(0);
  const id=()=>`${Date.now()}-${++serial.current}`;
  useEffect(()=>{onBusyChange(busy);},[busy,onBusyChange]);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  useEffect(()=>{if(!busy){try{localStorage.setItem(CHAT_KEY,JSON.stringify(messages.slice(-60).map(m=>({id:m.id,role:m.role,content:m.content.slice(0,16000)}))));}catch{setStorageError("对话仅在本页保留");}}},[busy,messages]);
  useEffect(()=>{if(active&&follow.current&&listRef.current)listRef.current.scrollTop=listRef.current.scrollHeight;},[messages,active]);
  const openConfig=()=>{setDraft({...settings});setDraftRemember(remember);setConfigError("");setConfigOpen(true);};
  const saveSettings=()=>{
    try{completionEndpoint(draft.baseUrl);if(!draft.model.trim())throw new Error("请填写模型名称。");if(!Number.isInteger(draft.maxRounds)||draft.maxRounds<1||draft.maxRounds>12)throw new Error("工具轮次需为1–12。");if(/[\r\n]/.test(draft.apiKey))throw new Error("API Key 不能包含换行。");
      const clean={...draft,baseUrl:draft.baseUrl.trim(),model:draft.model.trim(),apiKey:draft.apiKey.trim()};
      if(!saveAgentConfiguration(clean,draftRemember))setStorageError("设置仅在本页生效");
      setConfigOpen(false);
    }catch(e){setConfigError(e instanceof Error?e.message:"设置无效。");}
  };
  const send=async(text=question)=>{
    const content=text.trim();if(!content||busy)return;if(!settings.apiKey){openConfig();return;}
    const user:ChatMessage={id:id(),role:"user",content:content.slice(0,12000),calls:[]},bot:ChatMessage={id:id(),role:"assistant",content:"",calls:[],status:"running"};
    const history=[...messages.filter(m=>m.content.trim()&&m.status!=="running"),user].slice(-30);
    setMessages([...messages,user,bot]);setQuestion("");setBusy(true);follow.current=true;
    const abort=new AbortController();controller.current=abort;
    const update=(fn:(message:ChatMessage)=>ChatMessage)=>setMessages(rows=>rows.map(m=>m.id===bot.id?fn(m):m));
    try{
      const execute=createToolExecutor({fetchFund:code=>fetchFundClient(code),context,personal:()=>getPersonalStore().getSnapshot()});
      await runAgent({settings:{...settings},messages:history.map(m=>({role:m.role,content:m.content})),execute,signal:abort.signal,onEvent:event=>{
        if(event.type==="text")update(m=>({...m,content:m.content+event.delta}));
        else if(event.type==="tool-start")update(m=>({...m,calls:[...m.calls,{call:event.call}]}));
        else update(m=>({...m,calls:m.calls.map(t=>t.call.id===event.call.id?{...t,outcome:event.outcome,error:event.error}:t)}));
      }});
      markAgentVerified(settings);update(m=>({...m,status:undefined}));
    }catch(e){const stopped=abort.signal.aborted;update(m=>({...m,status:stopped?"stopped":"error",error:stopped?"已停止":e instanceof Error?e.message:"请求失败。"}));}
    finally{controller.current=null;setBusy(false);}
  };
  return <section className="agent-panel" aria-label="我的Agent">
    <div className="agent-toolbar"><span className="agent-model"><Bot size={16}/>{settings.model}</span><div><button type="button" className="icon-button" aria-label="新建对话" disabled={busy} onClick={()=>setClearOpen(true)}><Plus size={18}/></button><button type="button" className="icon-button" aria-label="Agent说明" onClick={()=>setInfoOpen(true)}><Info size={16}/></button><button type="button" className="icon-button" aria-label="Agent设置" onClick={openConfig}><Settings2 size={18}/></button></div></div>
    <div className="agent-messages" ref={listRef} onScroll={()=>{const el=listRef.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}} role="log" aria-label="Agent对话">
      {messages.length===0?<div className="agent-empty"><Bot size={40} strokeWidth={1.5}/><h2>我的Agent</h2>{!settings.apiKey&&<button type="button" className="secondary-button" onClick={openConfig}>配置 API</button>}<div className="agent-prompts">{["查看我的收藏与历史，分析关注方向","比较收藏中两只基金的1年RT","根据当前基金和定投计划做分析"].map(prompt=><button key={prompt} type="button" onClick={()=>void send(prompt)}>{prompt}</button>)}</div></div>:messages.map(message=><article key={message.id} className={`agent-message agent-message-${message.role}`}><span className="agent-speaker">{message.role==="user"?"你":"Agent"}</span>{message.calls.map(trace=><TraceCard key={trace.call.id} trace={trace} onOpenFund={onOpenFund}/>)}{message.content&&<div className="agent-answer"><Markdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:({alt})=><span>{alt??""}</span>}}>{message.content}</Markdown></div>}{message.status==="running"&&!message.content&&<span className="agent-status"><span className="agent-working-dot"/>{message.calls.length?"正在分析":"正在思考"}</span>}{message.error&&<p className="agent-error" role={message.status==="error"?"alert":"status"}>{message.error}</p>}</article>)}
    </div>
    <form className="agent-composer glass" onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="给Agent的消息" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={12000} rows={2} placeholder="询问收藏、历史或基金分析…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>{busy?<button type="button" className="agent-send" aria-label="停止生成" onClick={()=>controller.current?.abort()}><Square size={16} fill="currentColor"/></button>:<button className="agent-send" aria-label="发送消息" disabled={!question.trim()}><ArrowUp size={20}/></button>}</form>
    {storageError&&<button type="button" className="agent-storage-notice" onClick={()=>setInfoOpen(true)}>{storageError}</button>}
    <AnimatedDialog open={configOpen} onClose={()=>setConfigOpen(false)} title="Agent设置" className="personal-dialog"><form className="personal-form" onSubmit={e=>{e.preventDefault();saveSettings();}}><label>API 地址<input type="url" aria-label="Agent API地址" value={draft.baseUrl} onChange={e=>setDraft({...draft,baseUrl:e.target.value})} placeholder="https://api.deepseek.com" required/></label><label>模型<input aria-label="Agent模型" list="agent-model-presets" value={draft.model} onChange={e=>setDraft({...draft,model:e.target.value})} required/><datalist id="agent-model-presets"><option value="deepseek-flash"/><option value="deepseek-v4-pro"/></datalist></label><label>API Key<input type="password" aria-label="Agent API Key" autoComplete="off" value={draft.apiKey} onChange={e=>setDraft({...draft,apiKey:e.target.value})} placeholder="仅发送到你配置的 API"/></label><label className="personal-checkbox"><input type="checkbox" checked={draftRemember} onChange={e=>setDraftRemember(e.target.checked)}/>在本机记住 API Key</label><details className="personal-details"><summary>运行设置 <ChevronDown size={14}/></summary><label>每轮最多工具轮次<input type="number" min="1" max="12" value={draft.maxRounds} onChange={e=>setDraft({...draft,maxRounds:Number(e.target.value)})}/></label></details>{configError&&<p className="field-error" role="alert">{configError}</p>}<button className="primary-button">保存</button></form></AnimatedDialog>
    <AnimatedDialog open={infoOpen} onClose={()=>setInfoOpen(false)} title="Agent与数据" className="personal-dialog"><div className="personal-info"><p>发送消息后，聊天和被调用的收藏、历史、基金数据及分析结果会发送到你配置的 API 服务。头像不发送，密钥仅用于该地址的请求认证。</p><p>默认仅本页保留密钥；选择“在本机记住”会保存到当前浏览器。请只在可信设备使用。API 调用费用由服务商计费。</p><p>工具可读取真实净值、技术文档、RT、密度、定投与对比；调用过程和图表可以展开查看。切换栏目会继续运行，关闭网页后停止。模型建议可能出错，关注列表不代表持仓。</p><a href="https://api-docs.deepseek.com/guides/tool_calls/" target="_blank" rel="noreferrer">DeepSeek 工具调用文档 ↗</a></div></AnimatedDialog>
    <AnimatedDialog open={clearOpen} onClose={()=>setClearOpen(false)} title="新建对话" className="personal-dialog"><p>清空当前对话并重新开始？</p><div className="personal-dialog-actions"><button className="secondary-button" onClick={()=>setClearOpen(false)}>取消</button><button className="primary-button" onClick={()=>{setMessages([]);setClearOpen(false);}}>新建</button></div></AnimatedDialog>
  </section>;
}
