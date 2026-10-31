import { rollingReturns, simulateDCA, type DCAOptions } from "./analytics.ts";
import { compareDCA, compareRolling } from "./comparison.ts";
import { estimateDensity } from "./density.ts";
import { topics, getHelpTopics } from "./documentation.ts";
import type { FundData } from "./fund-data.ts";
import type { PersonalSnapshot } from "./personal-store.ts";
import {loadFundCatalog,searchCatalog,type FundCatalog} from './fund-catalog.ts';
import {getSimulationStore} from './simulation-store.ts';
import {calculateSimulation,newOrder,validateSimulationFund,addDays,type OrderFrequency,type SimulationMode} from './simulation.ts';
import { buildSample, assetStatistics, autocorrelation, DEFAULT_WINDOW, type WindowSettings } from './analysis-statistics.ts';
import { efficientFrontier, equalRiskContribution, advancedPortfolio, backtestPortfolio, DEFAULT_PREFERENCES, portfolioMetrics, type Preferences, type BacktestMode } from './portfolio-optimizer.ts';

export type AnalysisContext = {
  today: string; activeView: string; fundCode?: string; alphaDays: number;
  dcaSettings?: DCAOptions | null;
  comparison?: { codes: string[]; mode: string; alphaDays: number; plan: DCAOptions | null };
  analysis?: {codes:string[];window:WindowSettings;strategy:string;preferences:Preferences;backtest:BacktestMode;targetRisk?:number;selectedFrontierIndex?:number;maxLag?:number;statView?:string;focusedCode?:string;portfolioRTAlpha?:number;resultView?:string;sample?:{start:string;end:string;count:number;fingerprint:string};currentPortfolio?:{weights:number[];codes:string[];annualReturn:number;annualVolatility:number;riskShares:(number|null)[];maxDrawdown:number;cumulative:number;status:string}};
};
export type AgentChart = {
  kind: "nav"|"rt"|"dca"|"compare-rt"|"compare-dca"|"density";
  title: string; codes: string[]; labels: string[];
  points?: {date:string;value:number;secondary?:number;a?:number;b?:number;cost?:number;detail?:string}[];
  values?: number[];
};
export type ToolOutcome = { data: Record<string,unknown>; chart?: AgentChart };
export type ToolDependencies = { fetchFund:(code:string)=>Promise<FundData>; context:()=>AnalysisContext; personal:()=>PersonalSnapshot;catalog?:()=>Promise<FundCatalog>;simulation?:ReturnType<typeof getSimulationStore>;allowSimulationWrites?:boolean;language?:'zh'|'en' };
type Property = Record<string,unknown>;
const code:Property={type:"string",pattern:"^[0-9]{6}$",description:"中国公募基金六位代码"};
const date:Property={type:"string",description:"YYYY-MM-DD，自然日"};
const alpha:Property={type:"integer",minimum:1,maximum:3650,description:"持有自然日数，1y=365，默认使用页面所选α"};
const common={as_of_date:{...date,description:"截止日，不能晚于今日；默认北京时间今日"}};
const analysisArgs={codes:{type:'array',minItems:1,maxItems:12,items:code,description:'基金代码列表；省略时使用分析栏所选基金'},start_date:date,end_date:date,frequency:{type:'string',enum:['daily','weekly','monthly']},annual_factor:{type:'number',minimum:1,maximum:366},...common};
const plan={investment_start:date,investment_end:date,settlement_date:date,daily_amount:{type:"number",minimum:0.01,maximum:100000000},purchase_fee_rate:{type:"number",minimum:0,maximum:0.99,description:"小数费率，0.001=0.1%"},redemption_fee_rate:{type:"number",minimum:0,maximum:0.99}};
const tool=(name:string,description:string,properties:Record<string,Property>,required:string[]=[])=>({type:"function" as const,function:{name,description,parameters:{type:"object",properties,required,additionalProperties:false}}});
export const AGENT_TOOLS=[
  tool('search_funds','搜索全市场公开基金目录，包含用户从未浏览或收藏的基金。支持代码、中文名称、拼音、类型；目录顺序不是推荐排名。先搜索，再读取真实净值做分析。',{query:{type:'string',description:'代码、名称、指数或主题关键词；空串表示浏览目录'},fund_type:{type:'string',description:'可选类型关键词，如股票、债券、指数、QDII'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}}),
  tool('get_virtual_holdings','读取个人或Agent的独立虚拟持仓、模拟委托、成交记录、收益日历和曲线。不是实盘；按今日前已公布净值计算。',{mode:{type:'string',enum:['personal','agent']}},['mode']),
  tool('create_agent_simulation_order','仅Agent模拟运行时可用：在用户设置的Agent预算内提交虚拟买入或定投；不会修改个人模式。今天提交从明日起首个实际净值日执行，不可回填历史。必须先读取该基金真实净值。',{code,amount:{type:'number',minimum:.01,maximum:100000000},frequency:{type:'string',enum:['once','daily','weekly','monthly']},start_date:date,end_date:date,total_limit:{type:'number',minimum:.01,maximum:100000000,description:'本条计划最多累计投入；所有计划的上限之和不得超过Agent预算'}},['code','amount','frequency','total_limit']),
  tool("get_current_context","读取北京时间、当前基金、α、定投计划、对比基金，以及收藏/历史数量。",{}),
  tool("get_user_funds","读取用户已授权的收藏或最近100条查看记录；收藏来自原快捷基金。关注不等于实际持仓。",{section:{type:"string",enum:["favorites","history"]},offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:100}},["section"]),
  tool("read_documentation","读取与技术文档页面相同的完整算法、算例、公式、数据来源、QDII、复权、统计局限。topic为空或all表示全部。",{topic:{type:"string",enum:["all",...topics.map(t=>t.id)]}}),
  tool("get_data_sources","读取本站外部基金数据源、缓存更新、授权状态及公开资料网址。",{}),
  tool("get_fund_history","获取真实历史单位净值和近似复权净值。返回数据来源/日期/警告，附可视化。默认最近120条，最多1000条，按offset分页；计算工具始终用全量净值。",{code,start_date:date,end_date:date,offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:1000},...common},["code"]),
  tool("analyze_rt","用全量真实净值计算RT-α曲线与所有统计，亏损率含零；未到期和过长缺口排除。返回图表数据、极端窗口、来源和口径。",{code,alpha_days:alpha,...common},["code"]),
  tool("analyze_distribution","计算RT收益的高斯核密度；返回密度曲线、带宽、原始样本亏损率，密度高度不是概率。",{code,alpha_days:alpha,...common},["code"]),
  tool("simulate_dca","按实际净值日每日定投，节假日跳过不补投。日期、金额必须明确；返回成本、市值、费用、收益及资产曲线。",{code,...plan,...common},["code","investment_start","investment_end","settlement_date","daily_amount"]),
  tool("compare_rt","两基金先按实际共同净值日对齐，再使用相同起止日期窗口比较RT与统计；A红绿粗线，B蓝黄细线。",{code_a:code,code_b:code,alpha_days:alpha,...common},["code_a","code_b"]),
  tool("compare_dca","在共同净值日按同一现金流比较两基金定投；总成本、投入次数相同。",{code_a:code,code_b:code,...plan,...common},["code_a","code_b","investment_start","investment_end","settlement_date","daily_amount"]),
  tool('analyze_statistics','分析栏同源计算：共同实际净值日转换简单收益，窗口筛选、独立统计、协方差、收益相关矩阵、ACF与Ljung–Box。不得直接关联净值水平。日期必须成对提供；未提供时沿用页面窗口或MAX。',{...analysisArgs,max_lag:{type:'integer',minimum:1,maximum:60}}),
  tool('optimize_portfolio','至少两基金的非负权重、和为1优化。MEF含MVP和非支配前沿；ERC等风险贡献；advanced四项归一化偏好，CVaR按组合损失计算。返回约束、收敛、样本内回测及可选组合RT。',{...analysisArgs,strategy:{type:'string',enum:['mef','erc','advanced']},target_annual_volatility:{type:'number',minimum:0,maximum:10,description:'年化波动上限，小数；在此上限内最大化样本期望年化'},frontier_index:{type:'integer',minimum:0,maximum:48,description:'MEF目标点，0=MVP，48=最高均值端点；当前页面分析可沿用所选点'},return_preference:{type:'number',minimum:0,maximum:100},variance_penalty:{type:'number',minimum:0,maximum:100},cvar_penalty:{type:'number',minimum:0,maximum:100},concentration_penalty:{type:'number',minimum:0,maximum:100},backtest_mode:{type:'string',enum:['buy-hold','daily','monthly']},alpha_days:alpha}),
];
export const TOOL_LABELS:Record<string,string>={search_funds:"搜索全市场基金",get_virtual_holdings:"读取虚拟持仓",create_agent_simulation_order:"提交Agent虚拟委托",analyze_statistics:"计算统计与相关性",optimize_portfolio:"计算组合优化",get_current_context:"读取页面状态",get_user_funds:"读取收藏与历史",read_documentation:"查阅技术文档",get_data_sources:"查看外部数据源",get_fund_history:"读取基金净值",analyze_rt:"计算 RT-α",analyze_distribution:"计算收益密度",simulate_dca:"计算每日定投",compare_rt:"对比 RT-α",compare_dca:"对比定投"};
export function sampleSeries<T>(points:T[],limit:number):T[]{if(points.length<=limit)return points;return Array.from({length:limit},(_,i)=>points[Math.round(i*(points.length-1)/(limit-1))]);}
function objectArgs(name:string,input:unknown):Record<string,unknown>{
  const definition=AGENT_TOOLS.find(t=>t.function.name===name);
  if(!definition)throw new Error("不支持的工具。");
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("工具参数必须是对象。");
  const args=input as Record<string,unknown>, props=definition.function.parameters.properties;
  for(const key of Object.keys(args))if(!Object.hasOwn(props,key))throw new Error(`未知参数：${key}`);
  for(const key of definition.function.parameters.required)if(args[key]===undefined||args[key]===null)throw new Error(`缺少参数：${key}`);
  return args;
}
const text=(a:Record<string,unknown>,k:string,fallback?:string)=>{const v=a[k]??fallback;if(typeof v!=="string"||!v.trim()||v.length>200)throw new Error(`无效参数：${k}`);return v.trim();};
const number=(a:Record<string,unknown>,k:string,fallback:number,min:number,max:number,integer=false)=>{const v=a[k]??fallback;if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))throw new Error(`无效数值：${k}`);return v;};
function iso(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw new Error("日期无效，请使用YYYY-MM-DD。");return value;}
function fundCode(a:Record<string,unknown>,key:string){const value=text(a,key);if(!/^\d{6}$/.test(value))throw new Error("基金代码需要六位数字。");return value;}
const metadata=(f:FundData)=>({code:f.code,name:f.name,source:f.source,sourceUrl:f.sourceUrl,fetchedAt:f.fetchedAt,latestNavDate:f.latestNavDate,basis:f.basis,qdii:f.qdii,cacheStatus:f.cacheStatus??"unknown",warnings:f.warnings,adjustmentEvents:f.adjustmentEvents??0,observations:f.points.length,firstNavDate:f.points[0]?.date});
function options(a:Record<string,unknown>):DCAOptions{return {investmentStart:iso(text(a,"investment_start")),investmentEnd:iso(text(a,"investment_end")),settlementDate:iso(text(a,"settlement_date")),dailyAmount:number(a,"daily_amount",NaN,0.01,1e8),purchaseFeeRate:number(a,"purchase_fee_rate",0,0,0.99),redemptionFeeRate:number(a,"redemption_fee_rate",0,0,0.99)};}

export function createToolExecutor(deps:ToolDependencies){
  return async(name:string,input:unknown,signal?:AbortSignal):Promise<ToolOutcome>=>{
    signal?.throwIfAborted();
    const a=objectArgs(name,input),context=deps.context();
    const cutoff=iso(text(a,"as_of_date",context.today));
    if(cutoff>context.today)throw new Error("不能读取未来净值或计算未来收益。");
    if(name==='search_funds'){const q=a.query??'',t=a.fund_type??'';if(typeof q!=='string'||q.length>200||typeof t!=='string'||t.length>100)throw new Error('搜索条件无效。');const c=await(deps.catalog??loadFundCatalog)();signal?.throwIfAborted();return {data:searchCatalog(c,q,t,number(a,'offset',0,0,100000,true),number(a,'limit',30,1,100,true))};}
    if(name==='get_virtual_holdings'){const mode=text(a,'mode');if(mode!=='personal'&&mode!=='agent')throw new Error('模拟模式无效。');const account=(deps.simulation??getSimulationStore()).getSnapshot()[mode as SimulationMode];const funds=await Promise.all([...new Set(account.orders.map(o=>o.code))].map(c=>deps.fetchFund(c)));signal?.throwIfAborted();const r=calculateSimulation(account,funds,context.today);return {data:{mode,version:'paper-1.0.0',orders:account.orders,config:account.config,...r,series:sampleSeries(r.series,180),fills:r.fills.slice(-1000),funds:funds.map(metadata),method:'虚拟人民币投入，复权指数份额、红利再投，费用为0；今日提交最早明日净值执行；无净值日期不买入，账面估值沿用最近公布价格并标注日期。'},chart:{kind:'dca',title:mode==='agent'?'Agent模拟持仓':'个人虚拟持仓',codes:funds.map(f=>f.code),labels:funds.map(f=>f.name),points:sampleSeries(r.series,600).map(p=>({date:p.date,value:p.value,secondary:p.cost,detail:`收益 ${p.profit.toFixed(2)}`}))}};}
    if(name==='create_agent_simulation_order'){if(!deps.allowSimulationWrites)throw new Error('请在个人 → 虚拟持仓 → Agent模拟中运行；普通分析对话不能提交模拟委托。');const store=deps.simulation??getSimulationStore();if(!store.getSnapshot().agent.config?.enabled)throw new Error('Agent模拟未启用。');const f=await deps.fetchFund(fundCode(a,'code'));signal?.throwIfAborted();validateSimulationFund(f);const frequency=text(a,'frequency');if(!['once','daily','weekly','monthly'].includes(frequency))throw new Error('定投频率无效。');const start=iso(text(a,'start_date',context.today)),end=iso(text(a,'end_date',frequency==='once'?addDays(start,1):addDays(start,365))),order=newOrder({code:f.code,name:f.name,start,end,amount:number(a,'amount',NaN,.01,1e8),limit:number(a,'total_limit',NaN,.01,1e8),frequency:frequency as OrderFrequency},context.today);if(order.frequency==='once'&&order.limit!==order.amount)throw new Error('单次模拟的total_limit应等于amount。');signal?.throwIfAborted();store.add('agent',order);return {data:{submitted:true,virtualOnly:true,order,fund:metadata(f),meaning:'已保存Agent虚拟委托；尚未执行，等待符合日期的真实净值，不代表实盘交易。'}};}
    if(name==="get_current_context"){const saved=deps.personal();return {data:{...context,favoriteCount:saved.favorites.length,historyCount:saved.history.length,profileIsLocal:true,backgroundScope:"仅页面打开期间；切换栏目不停止，关闭页面后停止"}};}
    if(name==="get_user_funds"){
      const saved=deps.personal(),section=text(a,"section");if(section!=="favorites"&&section!=="history")throw new Error("只支持收藏或历史。");
      const list=saved[section],offset=number(a,"offset",0,0,10000,true),limit=number(a,"limit",100,1,100,true);
      return {data:{section,total:list.length,items:list.slice(offset,offset+limit),nextOffset:offset+limit<list.length?offset+limit:null,meaning:"用户关注或查看过的基金，不代表实际持仓、买卖或适当性。"}};
    }
    if(name==="read_documentation"){const topic=text(a,"topic","all");const localized=getHelpTopics(deps.language??'zh'),docs=topic==="all"?localized:localized.filter(t=>t.id===topic);if(!docs.length)throw new Error("没有该文档主题。");return {data:{topics:docs,repository:"https://github.com/PeiyangFantasist/OpenRT"}};}
    if(name==="get_data_sources")return {data:{provider:"东方财富·天天基金",officialHistory:"https://fund.eastmoney.com/pingzhongdata/{六位代码}.js",sourceRights:"公开可访问不等于开源数据或已获再分发授权；正式运营须另行确认授权。",cache:"GitHub Pages每日北京时间09:20/19:20/23:20更新；页面可按需读取官方源，失败明确保留旧缓存。",valuation:"按净值所属日，QDII披露可能滞后；不是盘中实时行情。",adjustment:"正常日按单位净值比值，分红/拆分按源事件及日增长率近似校正；无法校正时全量退回未复权并警告。",documentation:"https://github.com/PeiyangFantasist/OpenRT/blob/main/docs/data-sources.md",terms:"https://fund.eastmoney.com/notbug.html"}};
    if(name==='analyze_statistics'||name==='optimize_portfolio'){
      const codes=a.codes??context.analysis?.codes;if(!Array.isArray(codes)||codes.length<1||codes.length>12||codes.some(c=>typeof c!=='string'||!/^\d{6}$/.test(c)))throw new Error('请提供1–12个六位基金代码。');
      if(Boolean(a.start_date)!==Boolean(a.end_date))throw new Error('分析起止日期必须同时提供。');
      const settings:WindowSettings={...(context.analysis?.window??DEFAULT_WINDOW)};
      if(a.start_date){settings.preset='Custom';settings.start=iso(text(a,'start_date'));settings.end=iso(text(a,'end_date'));}
      if(settings.end>cutoff&&settings.preset==='Custom')throw new Error('窗口结束日期不能晚于截止日。');
      if(a.frequency){const v=text(a,'frequency');if(!['daily','weekly','monthly'].includes(v))throw new Error('无效频率。');settings.frequency=v as WindowSettings['frequency'];settings.annualFactor=v==='daily'?252:v==='weekly'?52:12;}
      settings.annualFactor=number(a,'annual_factor',settings.annualFactor,1,366);
      const funds=await Promise.all(codes.map(c=>deps.fetchFund(c)));signal?.throwIfAborted();const s=buildSample(funds,settings,cutoff),metadataResult={version:s.version,fingerprint:s.fingerprint,requested:s.requested,effectiveStart:s.dates[0],effectiveEnd:s.dates.at(-1),count:s.returns.length,frequency:s.settings.frequency,annualFactor:s.settings.annualFactor,quality:s.quality,warnings:s.warnings,condition:s.condition,funds:funds.map(metadata),sampleRule:'相邻共同实际估值日简单收益；未插值；均值和协方差使用同一样本；日频仍可能跨缺失交易日。'};
      if(name==='analyze_statistics')return {data:{...metadataResult,statistics:s.codes.map((_,i)=>assetStatistics(s,i)),covariance:s.covariance,correlation:s.correlation,acf:s.codes.map((code,i)=>({code,...autocorrelation(s.returns.map(r=>r[i]),number(a,'max_lag',context.analysis?.maxLag??20,1,60,true))})),inference:'95%白噪声近似界限；Ljung–Box零自相关原假设，χ²(h)，厚尾异方差影响推断。',chart:{sampled:s.dates.length>120,points:sampleSeries(s.dates.map((d,i)=>({date:d,returns:s.prices[i].map((v,j)=>v/s.prices[0][j]-1)})),120)}},chart:{kind:'rt',title:`${s.names[0]} · 分析窗口累计收益`,codes:s.codes,labels:s.names,points:sampleSeries(s.dates.map((d,i)=>({date:d,value:s.prices[i][0]/s.prices[0][0]-1})),600)}};
      const strategy=text(a,'strategy',context.analysis?.strategy??'mef');if(!['mef','erc','advanced'].includes(strategy))throw new Error('无效组合策略。');const base=context.analysis?.preferences??DEFAULT_PREFERENCES,p={return:number(a,'return_preference',base.return,0,100),variance:number(a,'variance_penalty',base.variance,0,100),cvar:number(a,'cvar_penalty',base.cvar,0,100),concentration:number(a,'concentration_penalty',base.concentration,0,100)},riskCap=a.target_annual_volatility??(a.codes||a.start_date?undefined:context.analysis?.targetRisk),result=strategy==='mef'?efficientFrontier(s,riskCap===undefined?undefined:number({target:riskCap},'target',0,0,10)):strategy==='erc'?equalRiskContribution(s):advancedPortfolio(s,p),mode=text(a,'backtest_mode',context.analysis?.backtest??'buy-hold');if(!['buy-hold','daily','monthly'].includes(mode))throw new Error('无效回测方式。');const targetIndex=number(a,'frontier_index',a.codes||a.start_date?0:context.analysis?.selectedFrontierIndex??0,0,48,true);if(result.frontier&&result.targetRisk===undefined){const point=result.frontier[Math.min(targetIndex,result.frontier.length-1)];result.weights=point.weights;Object.assign(result,portfolioMetrics(s,point.weights),{status:targetIndex===0?'全局可行解 · MVP':'全局可行解 · 有效前沿'});}const history=backtestPortfolio(s,result.weights,mode as BacktestMode),days=number(a,'alpha_days',context.analysis?.portfolioRTAlpha??context.alphaDays,1,3650,true),rt=rollingReturns(history.series,days,10,s.dates.at(-1));
      return {data:{...metadataResult,preferences:p,...result,assets:s.codes.map((code,i)=>({code,name:s.names[i],weight:result.weights[i],riskContribution:result.riskContributions[i],riskShare:result.riskShares[i]})),backtest:{mode,configuration:history.configuration,cumulative:history.cumulative,maxDrawdown:history.maxDrawdown,points:sampleSeries(history.series,120)},rt:{alphaDays:days,stats:rt.stats,incomplete:rt.incompleteCount,points:sampleSeries(rt.points,120)},interpretation:'样本内估计与回测，不是样本外验证或未来收益。MEF通常输出MVP，frontier_index可选择目标点；无显式参数时沿用页面目标点。年化期望为样本算术均值。'},chart:{kind:'rt',title:'组合样本内累计收益',codes:s.codes,labels:s.names,points:sampleSeries(history.series.map(p=>({date:p.date,value:p.nav-1})),600)}};
    }
    const load=async(key:string)=>{const f=await deps.fetchFund(fundCode(a,key));signal?.throwIfAborted();return f;};
    if(name==="compare_rt"||name==="compare_dca"){
      const [fa,fb]=await Promise.all([load("code_a"),load("code_b")]);
      const labels=[fa.name,fb.name],codes=[fa.code,fb.code];
      if(name==="compare_rt"){
        const days=number(a,"alpha_days",context.alphaDays,1,3650,true),r=compareRolling(fa.points,fb.points,days,cutoff);
        const points=r.a.points.map((p,i)=>({date:p.startDate,value:p.return,a:p.return,b:r.b.points[i].return,detail:`到期 ${p.endDate}`}));
        return {data:{asOfDate:cutoff,alphaDays:days,range:r.range,a:{fund:metadata(fa),stats:r.a.stats},b:{fund:metadata(fb),stats:r.b.stats},chart:{sampled:points.length>120,totalPoints:points.length,points:sampleSeries(points,120)},comparisonRule:"完全相同起止日期；WIN只描述单项历史指标。"},chart:{kind:"compare-rt",title:`RT-α 对比 · ${days}天`,codes,labels,points:sampleSeries(points,600)}};
      }
      const plan=options(a);if(plan.settlementDate>cutoff)throw new Error("结算日不能晚于截止日。");const r=compareDCA(fa.points,fb.points,plan,cutoff);
      const points=r.a.series.map((p,i)=>({date:p.date,value:p.value,a:p.value,b:r.b.series[i].value,cost:p.cost}));
      const {series:sa,...ra}=r.a,{series:sb,...rb}=r.b;
      return {data:{asOfDate:cutoff,plan,range:r.range,a:{fund:metadata(fa),...ra},b:{fund:metadata(fb),...rb},chart:{sampled:points.length>120,totalPoints:points.length,points:sampleSeries(points,120)}},chart:{kind:"compare-dca",title:"定投资产对比",codes,labels,points:sampleSeries(points,600)}};
    }
    const fund=await load("code"),points=fund.points.filter(p=>p.date<=cutoff),meta=metadata(fund);
    if(name==="get_fund_history"){
      const start=a.start_date?iso(text(a,"start_date")):"",end=a.end_date?iso(text(a,"end_date")):cutoff;
      if(start&&start>end)throw new Error("开始日期不能晚于结束日期。");
      const filtered=points.filter(p=>(!start||p.date>=start)&&p.date<=end),limit=number(a,"limit",120,1,1000,true),offset=number(a,"offset",start?0:Math.max(0,filtered.length-limit),0,100000,true);
      return {data:{fund:meta,asOfDate:cutoff,total:filtered.length,offset,nextOffset:offset+limit<filtered.length?offset+limit:null,points:filtered.slice(offset,offset+limit)},chart:{kind:"nav",title:fund.name,codes:[fund.code],labels:[fund.name],points:sampleSeries(filtered,600).map(p=>({date:p.date,value:p.adjustedNav,detail:`单位净值 ${p.nav}`}))}};
    }
    if(name==="simulate_dca"){
      const plan=options(a);if(plan.settlementDate>cutoff)throw new Error("结算日不能晚于截止日。");const r=simulateDCA(points,plan),{series,...summary}=r;
      return {data:{fund:meta,asOfDate:cutoff,plan,...summary,chart:{sampled:series.length>120,totalPoints:series.length,points:sampleSeries(series,120)}},chart:{kind:"dca",title:`${fund.name} · 定投`,codes:[fund.code],labels:[fund.name],points:sampleSeries(series,600).map(p=>({date:p.date,value:p.value,secondary:p.cost,detail:`收益 ${p.profit.toFixed(2)}`}))}};
    }
    const days=number(a,"alpha_days",context.alphaDays,1,3650,true),r=rollingReturns(points,days,10,cutoff);
    if(name==="analyze_distribution"){
      const density=estimateDensity(r.points.map(p=>p.return));
      return {data:{fund:meta,asOfDate:cutoff,alphaDays:days,stats:r.stats,bandwidth:density?.bandwidth??null,densityUnits:"每一个百分点的概率密度；概率应看面积，亏损率仍按原始样本计数。",curve:density?sampleSeries(density.curve,100).map(p=>({return:p.value,densityPerPercentagePoint:p.density/100})):[]},chart:{kind:"density",title:`${fund.name} · 收益密度`,codes:[fund.code],labels:[fund.name],values:r.points.map(p=>p.return)}};
    }
    const sorted=[...r.points].sort((x,y)=>x.return-y.return);
    return {data:{fund:meta,asOfDate:cutoff,alphaDays:days,stats:r.stats,incompleteCount:r.incompleteCount,skippedGaps:r.skippedGaps,latestCompleteEntry:r.points.at(-1)?.startDate??null,worstWindows:sorted.slice(0,3),bestWindows:sorted.slice(-3).reverse(),chart:{sampled:r.points.length>120,totalPoints:r.points.length,points:sampleSeries(r.points,120)}},chart:{kind:"rt",title:`${fund.name} · RT-${days}天`,codes:[fund.code],labels:[fund.name],points:sampleSeries(r.points,600).map(p=>({date:p.startDate,value:p.return,detail:`到期 ${p.endDate} · ${p.days}天`}))}};
  };
}
