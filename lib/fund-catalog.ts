export type CatalogFund={code:string;name:string;type:string;search:string};
export type FundCatalog={version:1;fetchedAt:string;sourceUrl:string;funds:CatalogFund[]};
export const CATALOG_SOURCE='https://fund.eastmoney.com/js/fundcode_search.js';
function rows(input:unknown):CatalogFund[]{
  if(!Array.isArray(input)||input.length>100000)throw new Error('基金目录格式无效。');
  const seen=new Set<string>();
  return input.map(v=>{if(!v||typeof v!=='object')throw new Error('基金目录条目无效。');const r=v as CatalogFund;if(!/^\d{6}$/.test(r.code)||typeof r.name!=='string'||!r.name||r.name.length>240||typeof r.type!=='string'||r.type.length>100||typeof r.search!=='string'||r.search.length>500||seen.has(r.code))throw new Error('基金目录条目无效。');seen.add(r.code);return {code:r.code,name:r.name,type:r.type,search:r.search};});
}
/** Parse a data literal, never evaluate the provider's JavaScript. */
export function parseCatalogSource(source:string,fetchedAt=new Date().toISOString()):FundCatalog{
  if(source.length>10000000)throw new Error('基金目录过大。');
  const match=/^\s*var\s+r\s*=\s*(\[[\s\S]*\])\s*;?\s*$/.exec(source.replace(/^\uFEFF/,''));
  if(!match)throw new Error('基金目录源格式已变化。');
  const input:unknown=JSON.parse(match[1]);if(!Array.isArray(input))throw new Error('基金目录格式无效。');
  const funds=rows(input.map(r=>{if(!Array.isArray(r)||r.length<4)throw new Error('基金目录条目无效。');return {code:r[0],name:r[2],type:r[3],search:[r[1],r[4]].filter(v=>typeof v==='string').join(' ').toLowerCase()};}));
  if(funds.length<100)throw new Error('基金目录不完整。');return {version:1,fetchedAt,sourceUrl:CATALOG_SOURCE,funds};
}
export function validateCatalog(v:unknown):FundCatalog{if(!v||typeof v!=='object')throw new Error('目录缓存无效。');const x=v as FundCatalog;if(x.version!==1||x.sourceUrl!==CATALOG_SOURCE||!Number.isFinite(Date.parse(x.fetchedAt)))throw new Error('目录缓存无效。');return {...x,funds:rows(x.funds)};}
export function searchCatalog(c:FundCatalog,query:string,type='',offset=0,limit=30){const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);const matches=c.funds.filter(f=>(!type||f.type.toLowerCase().includes(type.toLowerCase()))&&terms.every(q=>(f.code+' '+f.name+' '+f.type+' '+f.search).toLowerCase().includes(q)));return {total:matches.length,items:matches.slice(offset,offset+limit).map(({search,...f})=>f),nextOffset:offset+limit<matches.length?offset+limit:null,fetchedAt:c.fetchedAt,sourceUrl:c.sourceUrl,meaning:'目录用于发现基金，不是推荐排序；基金状态、申购资格和净值支持需逐只核实。'};}
let pending:Promise<FundCatalog>|undefined;
export function loadFundCatalog():Promise<FundCatalog>{if(pending)return pending;pending=(async()=>{const env=(import.meta as ImportMeta&{env?:{BASE_URL?:string}}).env;const response=await fetch(`${env?.BASE_URL??'/OpenRT/'}data/fund-catalog.json`,{cache:'no-cache',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('基金目录暂不可用，请输入六位代码查询。');const raw=await response.text();if(raw.length>10000000)throw new Error('目录缓存过大。');return validateCatalog(JSON.parse(raw));})().catch(e=>{pending=undefined;throw e;});return pending;}
