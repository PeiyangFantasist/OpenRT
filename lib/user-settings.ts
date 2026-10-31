export type UserSettings={language:'zh'|'en';dailyThreshold:number;fiveDayThreshold:number;dailySummary:boolean};
export const USER_SETTINGS_KEY='openrt-settings-v1';
const defaults:UserSettings={language:'zh',dailyThreshold:.03,fiveDayThreshold:.05,dailySummary:false};
let value:UserSettings|undefined;const listeners=new Set<()=>void>();
export function getUserSettings(){if(value)return value;value={...defaults};try{const v=JSON.parse(localStorage.getItem(USER_SETTINGS_KEY)??'null');if(v){value.language=v.language==='en'?'en':'zh';for(const k of ['dailyThreshold','fiveDayThreshold'] as const)if(typeof v[k]==='number'&&v[k]>=.001&&v[k]<=1)value[k]=v[k];value.dailySummary=v.dailySummary===true;}}catch{}return value;}
export function updateUserSettings(patch:Partial<UserSettings>){value={...getUserSettings(),...patch};try{localStorage.setItem(USER_SETTINGS_KEY,JSON.stringify(value));}catch{}listeners.forEach(f=>f());}
export const subscribeUserSettings=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function clearMarketCache(storage:Storage){const keys=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&(k.startsWith('openrt-fund-v1:')||k==='openrt-market-summary-v1'))keys.push(k);}keys.forEach(k=>storage.removeItem(k));return keys.length;}
