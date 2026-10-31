import { dot, matVec, maxDrawdown, type AnalysisSample } from './analysis-statistics.ts';
import type { NavPoint } from './analytics.ts';
export type Preferences={return:number;variance:number;cvar:number;concentration:number};
export const DEFAULT_PREFERENCES:Preferences={return:40,variance:60,cvar:60,concentration:20};
export type BacktestMode='buy-hold'|'daily'|'monthly';
export type PortfolioPoint={weights:number[];mean:number;volatility:number};
export type OptimizationResult={strategy:'mef'|'erc'|'advanced';weights:number[];annualReturn:number;annualVolatility:number;riskContributions:number[];riskShares:(number|null)[];iterations:number;residual:number;status:string;ridge:number;constraints:{sum:number;minimum:number;valid:boolean};frontier?:PortfolioPoint[];scales?:Record<string,number>;objective?:number;dualityGap?:number;equivalent?:boolean;targetRisk?:number};

export function solveLinear(matrix:number[][],rhs:number[]){const n=rhs.length,a=matrix.map((r,i)=>[...r,rhs[i]]);for(let k=0;k<n;k++){let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;if(Math.abs(a[pivot][k])<1e-15)return null;[a[k],a[pivot]]=[a[pivot],a[k]];const d=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=d;for(let i=0;i<n;i++)if(i!==k){const f=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=f*a[k][j];}}return a.map(r=>r[n]);}
function inverse(matrix:number[][]){const n=matrix.length,cols=Array.from({length:n},(_,i)=>solveLinear(matrix,Array.from({length:n},(_,j)=>i===j?1:0)));if(cols.some(c=>!c))return null;return matrix.map((_,i)=>cols.map(c=>c![i]));}
function normalize(w:number[]){const sum=w.reduce((s,x)=>s+Math.max(0,x),0);if(!(sum>0))throw new Error('权重无法归一化。');return w.map(x=>Math.max(0,x)/sum);}
type Face={indices:number[];inverse:number[][];ones:number[];a:number};
function faces(h:number[][]){const n=h.length,result:Face[]=[];for(let mask=1;mask<2**n;mask++){const indices=Array.from({length:n},(_,i)=>i).filter(i=>mask&(1<<i)),inv=inverse(indices.map(i=>indices.map(j=>h[i][j])));if(!inv)continue;const ones=matVec(inv,indices.map(()=>1)),a=ones.reduce((s,x)=>s+x,0);result.push({indices,inverse:inv,ones,a});}return result;}
// Enumerate all simplex faces. Each feasible stationary point is compared globally.
function minQP(h:number[][],linear:number[],prepared?:Face[]){const n=linear.length;if(h.every(r=>r.every(x=>Math.abs(x)<1e-16))){const best=Math.min(...linear),ties=linear.map((v,i)=>Math.abs(v-best)<1e-12?i:-1).filter(i=>i>=0);return Array.from({length:n},(_,i)=>ties.includes(i)?1/ties.length:0);}
  let best=Infinity,answer:number[]|null=null;for(const f of prepared??faces(h)){const c=f.indices.map(i=>linear[i]),ic=matVec(f.inverse,c),lambda=(1+ic.reduce((s,x)=>s+x,0))/f.a,local=f.ones.map((x,i)=>lambda*x-ic[i]);if(local.some(x=>x< -1e-9||!Number.isFinite(x)))continue;const w=Array(n).fill(0);f.indices.forEach((j,i)=>w[j]=Math.max(0,local[i]));const normalized=normalize(w),value=.5*dot(normalized,matVec(h,normalized))+dot(linear,normalized);if(value<best-1e-13){best=value;answer=normalized;}}if(!answer)throw new Error('二次规划未找到满足约束的解。');return answer;
}
function solverCovariance(sample:AnalysisSample){const max=Math.max(...sample.covariance.map((r,i)=>r[i]));if(!(max>1e-20))throw new Error('收益方差为零，无法进行风险优化。');const ridge=sample.condition===null||sample.condition>1e8?max*1e-8:0;return {ridge,matrix:sample.covariance.map((r,i)=>r.map((v,j)=>v+(i===j?ridge:0)))};}
function checkSample(s:AnalysisSample){if(s.codes.length<2)throw new Error('组合需要至少两只基金。');if(s.returns.length<Math.max(30,3*s.codes.length))throw new Error(`组合估计至少需要 ${Math.max(30,3*s.codes.length)} 个共同收益样本；请扩大窗口。`);}
export function portfolioMetrics(s:AnalysisSample,w:number[]){const product=matVec(s.covariance,w),variance=Math.max(0,dot(w,product)),sd=Math.sqrt(variance),riskContributions=w.map((v,i)=>sd>1e-14?v*product[i]/sd*Math.sqrt(s.settings.annualFactor):0),riskShares=riskContributions.map(x=>sd>1e-14?x/(sd*Math.sqrt(s.settings.annualFactor)):null);return {annualReturn:dot(w,s.mean)*s.settings.annualFactor,annualVolatility:sd*Math.sqrt(s.settings.annualFactor),riskContributions,riskShares};}
function finish(s:AnalysisSample,strategy:OptimizationResult['strategy'],weights:number[],ridge:number,iterations:number,residual:number,status:string,extra:Partial<OptimizationResult>={}):OptimizationResult{if(weights.some(w=>!Number.isFinite(w)||w< -1e-8)||Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-8)throw new Error('求解结果未满足非负、权重和为1的约束。');return {strategy,weights,...portfolioMetrics(s,weights),ridge,iterations,residual,status,constraints:{sum:weights.reduce((a,b)=>a+b,0),minimum:Math.min(...weights),valid:true},...extra};}
export function efficientFrontier(s:AnalysisSample,targetRisk?:number):OptimizationResult{
  checkSample(s);const {matrix,ridge}=solverCovariance(s),scale=Math.max(...matrix.map((r,i)=>r[i])),h=matrix.map(r=>r.map(x=>x/scale)),f=faces(h),n=s.codes.length,mvp=minQP(h,Array(n).fill(0),f),low=dot(mvp,s.mean),high=Math.max(...s.mean),span=high-low,muScale=Math.max(...s.mean.map(Math.abs),1e-8),mu=s.mean.map(x=>x/muScale);
  const pre=f.map(face=>{const im=matVec(face.inverse,face.indices.map(i=>mu[i])),b=im.reduce((a,b)=>a+b,0),c=dot(face.indices.map(i=>mu[i]),im);return {...face,im,b,c};});
  const points:PortfolioPoint[]=[{weights:mvp,mean:low,volatility:Math.sqrt(Math.max(0,dot(mvp,matVec(s.covariance,mvp))))}];
  const solveTarget=(target:number):PortfolioPoint=>{const t=target/muScale;let answer:number[]|null=null,best=Infinity;for(const face of pre){const determinant=face.a*face.c-face.b**2;let local:number[];
    if(Math.abs(determinant)<Math.max(1,Math.abs(face.a*face.c))*1e-12){if(Math.abs(face.b/face.a-t)>1e-8)continue;local=face.ones.map(x=>x/face.a);}else {const lambda=(face.c-face.b*t)/determinant,gamma=(face.a*t-face.b)/determinant;local=face.ones.map((v,i)=>lambda*v+gamma*face.im[i]);}
    if(local.some(x=>x< -1e-8||!Number.isFinite(x)))continue;const w=Array(n).fill(0);face.indices.forEach((j,i)=>w[j]=Math.max(0,local[i]));const weight=normalize(w);if(Math.abs(dot(weight,s.mean)-target)>Math.max(1e-10,span*1e-5))continue;const variance=dot(weight,matVec(h,weight));if(variance<best){best=variance;answer=weight;}}
    if(!answer)throw new Error('有效前沿的目标收益不可行或数值求解失败。');return {weights:answer,mean:dot(answer,s.mean),volatility:Math.sqrt(Math.max(0,dot(answer,matVec(s.covariance,answer))))};};
  if(span>1e-12)for(let step=1;step<=48;step++)points.push(solveTarget(low+span*step/48));
  // Only the upper boundary starting at MVP is constructed; remove numerical domination.
  const frontier=points.filter((p,i)=>!points.some((q,j)=>i!==j&&q.mean>p.mean+1e-12&&q.volatility<p.volatility-1e-10));
  let chosen=mvp;if(targetRisk!==undefined){if(!Number.isFinite(targetRisk)||targetRisk<0)throw new Error('目标波动必须为非负有限数。');const cap=targetRisk/Math.sqrt(s.settings.annualFactor);if(cap+1e-12<points[0].volatility)throw new Error('目标波动低于MVP，不存在可行组合。');let best=points[0],lower=low,upper=high;if(points.at(-1)!.volatility<=cap)best=points.at(-1)!;else for(let iteration=0;iteration<42;iteration++){const mid=(lower+upper)/2,point=solveTarget(mid);if(point.volatility<=cap){best=point;lower=mid;}else upper=mid;}chosen=best.weights;}
  return finish(s,'mef',chosen,ridge,f.length,0,targetRisk===undefined?'全局可行解 · MVP':'全局可行解 · 波动上限', {frontier,equivalent:span<=1e-12,targetRisk});
}
export function equalRiskContribution(s:AnalysisSample):OptimizationResult{
  checkSample(s);const {matrix,ridge}=solverCovariance(s),n=s.codes.length;if(s.covariance.some((r,i)=>r[i]<=1e-20))throw new Error('存在零方差资产，等风险贡献没有可识别的正风险解。');const scale=Math.max(...matrix.map((r,i)=>r[i])),cov=matrix.map(r=>r.map(v=>v/scale)),x=Array.from({length:n},(_,i)=>1/Math.sqrt(cov[i][i]*n));let residual=Infinity,iterations=0;
  for(;iterations<20000;iterations++){for(let i=0;i<n;i++){const c=dot(cov[i],x)-cov[i][i]*x[i],root=Math.sqrt(c*c+4*cov[i][i]/n);x[i]=c>0?(2/n)/(root+c):(root-c)/(2*cov[i][i]);}const w=normalize(x),v=matVec(cov,w),variance=dot(w,v);if(!(variance>1e-20))throw new Error('组合风险接近零，无法定义风险贡献比例。');residual=Math.max(...w.map((v0,i)=>Math.abs(v0*v[i]/variance-1/n)));if(residual<1e-8)break;}
  if(residual>1e-6)throw new Error(`风险平价未收敛（风险份额误差 ${residual.toExponential(2)}），未输出最优权重。`);
  const raw=portfolioMetrics(s,normalize(x));if(raw.riskShares.some(v=>v===null))throw new Error('原始样本风险接近零，无法识别风险平价。');residual=Math.max(residual,...raw.riskShares.map(v=>Math.abs(v!-1/n)));if(residual>1e-6)throw new Error('正则后权重在原始协方差下未达到等风险贡献精度，未输出最优权重。');
  return finish(s,'erc',normalize(x),ridge,iterations+1,residual,'已收敛 · 风险贡献均等');
}
/** Empirical expected shortfall, including a fractional observation at the 95% cut. */
export function empiricalCVaR(losses:number[],level=.95){if(!losses.length)throw new Error('CVaR缺少样本。');const sorted=[...losses].sort((a,b)=>b-a),mass=(1-level)*losses.length;let sum=0,left=mass;for(const loss of sorted){const take=Math.min(1,left);sum+=take*loss;left-=take;if(left<=1e-12)break;}return sum/mass;}
const logistic=(x:number)=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const softplus=(x:number)=>Math.max(x,0)+Math.log1p(Math.exp(-Math.abs(x)));
export function advancedPortfolio(s:AnalysisSample,p:Preferences):OptimizationResult{
  checkSample(s);for(const v of Object.values(p))if(!Number.isFinite(v)||v<0||v>100)throw new Error('偏好系数必须在0–100之间。');
  const n=s.codes.length,N=s.returns.length,{matrix,ridge}=solverCovariance(s),a=p.return/100,b=p.variance/100,g=p.cvar/100,d=p.concentration/100;
  const scales={return:Math.max(1e-8,...s.mean.map(Math.abs)),variance:Math.max(1e-12,...matrix.map((r,i)=>r[i])),cvar:Math.max(1e-6,...s.codes.map((_,i)=>Math.abs(empiricalCVaR(s.returns.map(r=>-r[i]))))),concentration:1};
  const h=matrix.map((row,i)=>row.map((v,j)=>2*b*v/scales.variance+(i===j?2*d:0))),linear=s.mean.map(v=>-a*v/scales.return),losses=s.returns.map(r=>r.map(v=>-v/scales.cvar));
  const exact=(w:number[])=>.5*dot(w,matVec(h,w))+dot(linear,w)+g*empiricalCVaR(losses.map(r=>dot(r,w)));
  if(!g){const w=minQP(h,linear);return finish(s,'advanced',w,ridge,1,0,a+b+d?'已收敛 · 凸二次规划':'多重等价解 · 固定采用等权', {scales,objective:exact(w),dualityGap:0,equivalent:a+b+d===0});}
  let w=Array(n).fill(1/n),z=0,iterations=0;
  // Smooth the Rockafellar-Uryasev hinge, then reduce epsilon deterministically.
  // A feasible CVaR dual produces an independent global optimality certificate below.
  for(const eps of [.01,.001,.0001,.00001,.000001]){
    const zFor=(weights:number[])=>{const l=losses.map(r=>dot(r,weights));let lo=Math.min(...l)-40*eps,hi=Math.max(...l)+40*eps;for(let k=0;k<65;k++){const mid=(lo+hi)/2,mass=l.reduce((s,v)=>s+logistic((v-mid)/eps),0);if(mass>.05*N)lo=mid;else hi=mid;}return (lo+hi)/2;};z=zFor(w);
    const evaluate=(v:number[],threshold:number,derivatives:boolean)=>{const grad=[...matVec(h,v).map((x,i)=>x+linear[i]),g],H=Array.from({length:n+1},(_,i)=>Array.from({length:n+1},(_,j)=>i<n&&j<n?h[i][j]:0));let value=.5*dot(v,matVec(h,v))+dot(linear,v)+g*threshold;for(const row of losses){const t=(dot(row,v)-threshold)/eps;value+=g*eps*softplus(t)/(.05*N);if(derivatives){const prob=logistic(t),weight=g*prob/(.05*N),curvature=g*prob*(1-prob)/(eps*.05*N),r=[...row,-1];for(let i=0;i<=n;i++){grad[i]+=weight*r[i];for(let j=0;j<=n;j++)H[i][j]+=curvature*r[i]*r[j];}}}return {value,grad,H};};
    for(let step=0;step<100;step++,iterations++){
      const {value,grad,H}=evaluate(w,z,true);let free=w.map((v,i)=>v>1e-10?i:-1).filter(i=>i>=0);const lambda=free.reduce((s,i)=>s+grad[i],0)/free.length;for(let i=0;i<n;i++)if(!free.includes(i)&&grad[i]<lambda-1e-8)free.push(i);free.push(n);
      let direction:number[]|null=null;
      for(let attempt=0;attempt<=n;attempt++){const m=free.length,kkt=Array.from({length:m+1},(_,i)=>Array.from({length:m+1},(_,j)=>i<m&&j<m?H[free[i]][free[j]]+(i===j?1e-10:0):i===m&&j===m?0:(i===m?free[j]:free[i])<n?1:0)),solution=solveLinear(kkt,[...free.map(i=>-grad[i]),0]);if(!solution)break;direction=Array(n+1).fill(0);free.forEach((i,j)=>direction![i]=solution[j]);const blocked=free.filter(i=>i<n&&w[i]<=1e-12&&direction![i]<-1e-12);if(!blocked.length)break;free=free.filter(i=>!blocked.includes(i));direction=null;}
      if(!direction)break;const slope=dot(grad,direction);if(slope>=-1e-13)break;let rate=1;for(let i=0;i<n;i++)if(direction[i]<0)rate=Math.min(rate,-w[i]/direction[i]);let accepted=false;for(let line=0;line<45;line++){const next=w.map((v,i)=>Math.max(0,v+rate*direction![i])),nz=z+rate*direction[n];if(evaluate(next,nz,false).value<=value+1e-4*rate*slope){w=normalize(next);z=nz;accepted=true;break;}rate*=.5;}if(!accepted)break;
    }
    z=zFor(w);
  }
  // Normalize the smooth dual onto {sum q=1, 0<=q<=1/(.05N)} by bisection.
  const eps=.000001,raw=losses.map(r=>logistic((dot(r,w)-z)/eps)/(.05*N)),cap=1/(.05*N);let lo=-cap,hi=cap;for(let k=0;k<80;k++){const m=(lo+hi)/2,sum=raw.reduce((s,x)=>s+Math.max(0,Math.min(cap,x-m)),0);if(sum>1)lo=m;else hi=m;}const q=raw.map(x=>Math.max(0,Math.min(cap,x-(lo+hi)/2))),dualLinear=linear.map((v,j)=>v+g*losses.reduce((sum,r,i)=>sum+q[i]*r[j],0)),dualWeight=minQP(h,dualLinear),lower=.5*dot(dualWeight,matVec(h,dualWeight))+dot(dualLinear,dualWeight),objective=exact(w),gap=Math.max(0,objective-lower);
  if(!Number.isFinite(gap)||gap>5e-4)throw new Error(`高级优化未达到精度要求（归一化目标间隙 ${gap.toExponential(2)}），未输出最优权重。`);
  return finish(s,'advanced',w,ridge,iterations,gap,'已收敛 · 全局目标间隙已检验',{scales,objective,dualityGap:gap});
}
export function backtestPortfolio(s:AnalysisSample,weights:number[],mode:BacktestMode){if(weights.length!==s.codes.length||weights.some(x=>x<0)||Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-8)throw new Error('回测权重无效。');let holdings=[...weights],value=1;const series:NavPoint[]=[{date:s.dates[0],nav:1,adjustedNav:1}];for(let t=1;t<s.dates.length;t++){if(mode==='buy-hold')value=dot(weights,s.prices[t].map((p,j)=>p/s.prices[0][j]));else{holdings=holdings.map((v,j)=>v*s.prices[t][j]/s.prices[t-1][j]);value=holdings.reduce((a,b)=>a+b,0);const monthEnd=t===s.dates.length-1||s.dates[t].slice(0,7)!==s.dates[t+1].slice(0,7);if(mode==='daily'||monthEnd)holdings=weights.map(w=>w*value);}series.push({date:s.dates[t],nav:value,adjustedNav:value});}return {mode,series,cumulative:value-1,maxDrawdown:maxDrawdown(series.map(p=>p.nav)),configuration:'样本内；初始资金1；无交易成本；按实际共同估值日；月度在每月最后可用估值日收盘再平衡。'};}
