"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ToolOutcome } from "../../lib/agent-tools";
import { CurveChart, Distribution } from "./charts";
import { ComparisonChart } from "./comparison-chart";

export function AgentResult({outcome,onOpenFund}:{outcome:ToolOutcome;onOpenFund:(code:string)=>void}){
  const [open,setOpen]=useState(false),chart=outcome.chart;
  if(!chart)return null;
  const points=chart.points??[];
  return <div className="agent-result"><button type="button" className="agent-result-trigger" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{chart.title}<ChevronDown size={14}/></button>{open&&<>
    <div className={`agent-chart${chart.kind==="density"?" agent-density":""}`}>
      {chart.kind==="density"?<Distribution values={chart.values??[]}/>:chart.kind.startsWith("compare-")?<ComparisonChart points={points.filter(p=>p.a!==undefined&&p.b!==undefined).map(p=>({date:p.date,a:p.a!,b:p.b!,cost:p.cost,detail:p.detail}))} labels={[chart.labels[0],chart.labels[1]]} money={chart.kind==="compare-dca"}/>:<CurveChart points={chart.kind==="nav"?points.map(p=>({...p,value:points[0]?.value?p.value/points[0].value-1:0})):points} money={chart.kind==="dca"} label={chart.kind==="nav"?"相对首日变化":chart.kind==="dca"?"持仓市值":chart.title}/>}
    </div><div className="agent-result-links">{chart.codes.map((code,i)=><button key={`${code}-${i}`} type="button" className="text-button" onClick={()=>onOpenFund(code)}>{code} · 打开 RT ↗</button>)}</div>
  </>}</div>;
}
