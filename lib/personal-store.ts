export type FundReference = { code: string; name: string };
export type FavoriteFund = FundReference & { addedAt: string };
export type FundVisit = FundReference & { viewedAt: string; view: "rt" | "dca" | "compare" | "analysis" };
export type PersonalData = {
  version: 1;
  joinedAt:string;
  profile: { username: string; avatar: string };
  favorites: FavoriteFund[];
  history: FundVisit[];
};
export type PersonalSnapshot = PersonalData & { storageAvailable: boolean };
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export const PERSONAL_KEY = "openrt-personal-v1";
export const LEGACY_QUICK_KEY = "openrt-quick-funds-v1";
const DEFAULT_QUICK: FundReference[] = [{code:"000001",name:"华夏成长"},{code:"161725",name:"白酒"},{code:"019454",name:"QDII"}];
const MAX_FAVORITES = 1000;
const isRecord = (v: unknown): v is Record<string,unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const validCode = (v: unknown): v is string => typeof v === "string" && /^\d{6}$/.test(v);
const validDate = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const cleanName = (v: unknown, fallback: string) => typeof v === "string" ? [...v.trim()].slice(0,160).join("") || fallback : fallback;
const validAvatar = (v: unknown): v is string => typeof v === "string" && (v === "" || v.length <= 500_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v));
export function emptyPersonalData(joinedAt=new Date().toISOString()): PersonalData { return {version:1,joinedAt,profile:{username:"OpenRT 用户",avatar:""},favorites:[],history:[]}; }

export function parsePersonalData(raw: string): PersonalData {
  if (raw.length > 2_000_000) throw new Error("本机个人数据过大。");
  const value: unknown=JSON.parse(raw);
  if (!isRecord(value) || value.version!==1 || !Array.isArray(value.favorites) || !Array.isArray(value.history)) throw new Error("个人数据格式无效。");
  const result=emptyPersonalData(), codes=new Set<string>();
  if (isRecord(value.profile)) result.profile={username:cleanName(value.profile.username,"OpenRT 用户").slice(0,32),avatar:validAvatar(value.profile.avatar)?value.profile.avatar:""};
  for (const row of value.favorites.slice(0,MAX_FAVORITES)) {
    if (!isRecord(row)||!validCode(row.code)||codes.has(row.code)) continue;
    codes.add(row.code);result.favorites.push({code:row.code,name:cleanName(row.name,row.code),addedAt:validDate(row.addedAt)?row.addedAt:new Date(0).toISOString()});
  }
  codes.clear();
  const rows=value.history.filter(isRecord).filter(row=>validCode(row.code)&&validDate(row.viewedAt)).sort((a,b)=>Date.parse(String(b.viewedAt))-Date.parse(String(a.viewedAt)));
  for (const row of rows) {
    if (!validCode(row.code)||codes.has(row.code)||result.history.length>=100) continue;
    codes.add(row.code);result.history.push({code:row.code,name:cleanName(row.name,row.code),viewedAt:String(row.viewedAt),view:row.view==="dca"||row.view==="compare"||row.view==="analysis"?row.view:"rt"});
  }
  result.joinedAt=validDate(value.joinedAt)?value.joinedAt:result.history.at(-1)?.viewedAt??result.joinedAt;
  return result;
}

export function migrateQuickFunds(raw: string | null, now: string): FavoriteFund[] {
  let rows: unknown=DEFAULT_QUICK;
  if (raw!==null) { try { rows=JSON.parse(raw); } catch { rows=DEFAULT_QUICK; } }
  if (!Array.isArray(rows)) rows=DEFAULT_QUICK;
  const codes=new Set<string>();
  return (rows as unknown[]).slice(0,MAX_FAVORITES).flatMap(row=>{
    if (!isRecord(row)||!validCode(row.code)||codes.has(row.code))return [];
    codes.add(row.code);return [{code:row.code,name:cleanName(row.name,row.code),addedAt:now}];
  });
}

export function createPersonalStore(storage: StorageLike | null, now: () => string = () => new Date().toISOString()) {
  let snapshot: PersonalSnapshot={...emptyPersonalData(now()),storageAvailable:Boolean(storage)};
  const listeners=new Set<()=>void>();
  const notify=()=>listeners.forEach(fn=>fn());
  const persist=(data:PersonalData)=>{
    let available=Boolean(storage);
    try { storage?.setItem(PERSONAL_KEY,JSON.stringify(data)); } catch { available=false; }
    snapshot={...data,storageAvailable:available};notify();
  };
  const reload=()=>{
    try {
      const raw=storage?.getItem(PERSONAL_KEY)??null;
      const data=raw!==null?parsePersonalData(raw):{...emptyPersonalData(now()),favorites:migrateQuickFunds(storage?.getItem(LEGACY_QUICK_KEY)??null,now())};
      snapshot={...data,storageAvailable:Boolean(storage)};
      if(storage&&(raw===null||!Object.hasOwn(JSON.parse(raw),'joinedAt')))storage.setItem(PERSONAL_KEY,JSON.stringify(data));
    }catch{snapshot={...snapshot,storageAvailable:false};}
    notify();
  };
  reload();
  const check=(fund:FundReference)=>{if(!validCode(fund.code))throw new Error("请输入六位基金代码。");return {code:fund.code,name:cleanName(fund.name,fund.code)};};
  return {
    getSnapshot:()=>snapshot,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    reload,
    saveProfile:(username:string,avatar:string)=>{
      const clean=[...username.trim()].slice(0,32).join("");
      if(!clean)throw new Error("请输入用户名。");
      if(!validAvatar(avatar))throw new Error("请选择 PNG、JPEG 或 WebP 头像。");
      persist({...snapshot,profile:{username:clean,avatar}});
    },
    recordView:(fund:FundReference,view:FundVisit["view"]="rt")=>{
      const entry={...check(fund),view,viewedAt:now()};
      persist({...snapshot,history:[entry,...snapshot.history.filter(row=>row.code!==entry.code)].slice(0,100)});
    },
    addFavorite:(fund:FundReference)=>{
      const entry=check(fund);
      if(snapshot.favorites.some(row=>row.code===entry.code))return;
      if(snapshot.favorites.length>=MAX_FAVORITES)throw new Error("收藏已达到本机保存上限。");
      persist({...snapshot,favorites:[{...entry,addedAt:now()},...snapshot.favorites]});
    },
    removeFavorite:(code:string)=>persist({...snapshot,favorites:snapshot.favorites.filter(row=>row.code!==code)}),
    renameFavorite:(code:string,name:string)=>persist({...snapshot,favorites:snapshot.favorites.map(row=>row.code===code?{...row,name:cleanName(name,code)}:row)}),
    clearHistory:()=>persist({...snapshot,history:[]}),
  };
}
export type PersonalStore = ReturnType<typeof createPersonalStore>;
let singleton: PersonalStore | undefined;
export function getPersonalStore(): PersonalStore {
  if(singleton)return singleton;
  let storage:StorageLike|null=null;
  try{if(typeof window!=="undefined")storage=window.localStorage;}catch{}
  singleton=createPersonalStore(storage);
  if(typeof window!=="undefined")window.addEventListener("storage",event=>{if(event.key===PERSONAL_KEY)singleton?.reload();});
  return singleton;
}
