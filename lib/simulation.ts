import type {FundData} from './fund-data.ts';
export type SimulationMode='personal'|'agent';
export type OrderFrequency='once'|'daily'|'weekly'|'monthly';
export type SimulationOrder={id:string;code:string;name:string;createdAt:string;start:string;end:string;amount:number;limit:number;frequency:OrderFrequency;eligibleFrom?:string;stoppedOn?:string};
export type AgentSimulation={enabled:boolean;budget:number;instruction:string;autoDaily:boolean;lastAttempt?:string;lastReport?:string;lastError?:string};
export type SimulationAccount={orders:SimulationOrder[];config?:AgentSimulation};
export type Fill={orderId:string;code:string;date:string;amount:number;units:number;price:number};
export type SimulationDay={date:string;cost:number;value:number;profit:number;dailyProfit:number;dailyReturn:number|null;updated:boolean};
export type SimulationResult={series:SimulationDay[];fills:Fill[];positions:{code:string;name:string;cost:number;value:number;profit:number;units:number;date:string}[];pending:number;cost:number;value:number;profit:number;returnRate:number|null;maxDrawdown:number;warnings:string[];asOf:string|null};
export const SIMULATION_VERSION='paper-1.0.0';
export function validDay(s:unknown):s is string{return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export const addDays=(s:string,n:number)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function validateOrder(v:unknown):SimulationOrder{if(!v||typeof v!=='object')throw new Error('模拟委托无效。');const r=v as SimulationOrder;if(typeof r.id!=='string'||r.id.length>100||!/^\d{6}$/.test(r.code)||typeof r.name!=='string'||r.name.length>240||!Number.isFinite(Date.parse(r.createdAt))||!validDay(r.start)||!validDay(r.end)||r.end<r.start||Date.parse(r.end)-Date.parse(r.start)>3660*86400000||!['once','daily','weekly','monthly'].includes(r.frequency)||!Number.isFinite(r.amount)||r.amount<.01||r.amount>1e8||!Number.isFinite(r.limit)||r.limit<r.amount||r.limit>1e8||r.eligibleFrom!==undefined&&!validDay(r.eligibleFrom)||r.stoppedOn!==undefined&&!validDay(r.stoppedOn))throw new Error('模拟委托参数无效。');return {id:r.id,code:r.code,name:r.name,createdAt:r.createdAt,start:r.start,end:r.end,amount:r.amount,limit:r.limit,frequency:r.frequency,...(r.eligibleFrom?{eligibleFrom:r.eligibleFrom}:{}),...(r.stoppedOn?{stoppedOn:r.stoppedOn}:{})};}
export function validateSimulationFund(f:FundData){if(f.basis!=='event-adjusted-nav')throw new Error('该基金缺少可用复权净值，暂不能加入虚拟持仓。');if(/美元|港币|港元|英镑|日元|欧元/.test(f.name))throw new Error('虚拟持仓暂支持人民币份额，请选择对应人民币基金代码。');}
/** Today is submission day. Earliest NAV is tomorrow, preventing same-day known-price backfills. */
export function newOrder(input:Omit<SimulationOrder,'id'|'createdAt'|'stoppedOn'>,today:string,now=new Date().toISOString()):SimulationOrder{if(!validDay(today)||input.start<today)throw new Error('模拟只能从今日或未来开始。');return validateOrder({...input,id:globalThis.crypto.randomUUID(),createdAt:now,eligibleFrom:input.start===today?addDays(today,1):input.start});}
function scheduledDates(o:SimulationOrder,today:string):string[]{const end=[o.end,today,o.stoppedOn??today].sort()[0];if(end<o.start)return [];if(o.frequency==='once')return [o.start];const result:string[]=[];const origin=new Date(o.start+'T00:00:00Z');for(let date=o.start;date<=end;date=addDays(date,1)){const d=new Date(date+'T00:00:00Z');if(o.frequency==='daily'||o.frequency==='weekly'&&d.getUTCDay()===origin.getUTCDay()||o.frequency==='monthly'&&d.getUTCDate()===Math.min(origin.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()))result.push(date);}return result;}
export function calculateSimulation(account:SimulationAccount,funds:FundData[],today:string):SimulationResult{
  if(!validDay(today))throw new Error('模拟截止日期无效。');
  const byCode=new Map(funds.map(f=>[f.code,f])),fills:Fill[]=[],warnings=new Set<string>();let pending=0;
  for(const o of account.orders){const f=byCode.get(o.code);if(!f){warnings.add(`${o.code} 净值未载入；该基金未计入总值。`);pending++;continue;}try{validateSimulationFund(f);}catch(e){warnings.add(e instanceof Error?e.message:'基金净值不可用。');pending++;continue;}f.warnings.forEach(w=>warnings.add(`${f.code}：${w}`));if(f.cacheStatus==='stale')warnings.add(`${f.code} 使用旧缓存。`);
    const available=f.points.filter(p=>p.date<=today&&p.date>=(o.eligibleFrom??o.start)&&(!o.stoppedOn||p.date<=o.stoppedOn)),dates=scheduledDates(o,today);let committed=0,last='',awaiting=false,navIndex=0;
    // Daily means one contribution per actual NAV date. No holiday backfill.
    const targets=o.frequency==='daily'?available.filter(p=>p.date<=o.end).map(p=>p.date):dates;
    for(const target of targets){if(committed>=o.limit-.000001)break;while(navIndex<available.length&&available[navIndex].date<target)navIndex++;const p=available[navIndex];if(!p){awaiting=true;continue;}if(p.date===last)continue;last=p.date;const amount=Math.min(o.amount,o.limit-committed);fills.push({orderId:o.id,code:o.code,date:p.date,amount,units:amount/p.adjustedNav,price:p.adjustedNav});committed+=amount;}
    if(!o.stoppedOn&&committed<o.limit-.000001&&(awaiting||!fills.some(f=>f.orderId===o.id)))pending++;
  }
  fills.sort((a,b)=>a.date.localeCompare(b.date)||a.orderId.localeCompare(b.orderId));
  const first=fills[0]?.date;if(!first)return {series:[],fills,positions:[],pending,cost:0,value:0,profit:0,returnRate:null,maxDrawdown:0,warnings:[...warnings],asOf:null};
  const codes=[...new Set(fills.map(f=>f.code))],indices=new Map(codes.map(c=>[c,0])),units=new Map<string,number>(),costs=new Map<string,number>(),latest=new Map<string,{price:number;date:string}>(),series:SimulationDay[]=[];let cost=0,previousValue=0,unitIndex=1,peak=1,maxDrawdown=0,fillIndex=0;
  for(let date=first;date<=today;date=addDays(date,1)){let updated=false,inflow=0;for(const code of codes){const f=byCode.get(code)!;let i=indices.get(code)!;while(i<f.points.length&&f.points[i].date<=date){if(f.points[i].date===date)updated=true;latest.set(code,{price:f.points[i].adjustedNav,date:f.points[i].date});i++;}indices.set(code,i);}
    while(fillIndex<fills.length&&fills[fillIndex].date===date){const f=fills[fillIndex++];units.set(f.code,(units.get(f.code)??0)+f.units);costs.set(f.code,(costs.get(f.code)??0)+f.amount);inflow+=f.amount;cost+=f.amount;}
    const value=codes.reduce((sum,c)=>sum+(units.get(c)??0)*(latest.get(c)?.price??0),0),dailyProfit=value-previousValue-inflow,dailyReturn=previousValue>0?dailyProfit/previousValue:null;if(dailyReturn!==null){unitIndex*=1+dailyReturn;peak=Math.max(peak,unitIndex);maxDrawdown=Math.max(maxDrawdown,1-unitIndex/peak);}series.push({date,cost,value,profit:value-cost,dailyProfit,dailyReturn,updated});previousValue=value;
  }
  const positions=codes.map(code=>{const c=costs.get(code)??0,p=latest.get(code)!,v=(units.get(code)??0)*p.price;return {code,name:byCode.get(code)!.name,cost:c,value:v,profit:v-c,units:units.get(code)??0,date:p.date};});
  const last=series.at(-1)!;const asOf=positions.map(p=>p.date).sort()[0];return {series,fills,positions,pending,cost:last.cost,value:last.value,profit:last.profit,returnRate:last.cost?last.profit/last.cost:null,maxDrawdown,warnings:[...warnings],asOf};
}
