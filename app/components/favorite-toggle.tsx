"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { getPersonalStore, type FundReference } from "../../lib/personal-store";
import { usePersonalData } from "./use-personal";
import { AnimatedDialog } from "./animated-dialog";
export function FavoriteToggle({fund}:{fund:FundReference}){
  const saved=usePersonalData(),selected=saved.favorites.some(row=>row.code===fund.code),[error,setError]=useState("");
  return <><button type="button" className={`icon-button favorite-toggle${selected?" is-favorite":""}`} aria-label={`${selected?"取消收藏":"收藏"}${fund.name}`} aria-pressed={selected} title={selected?"取消收藏":"收藏"} onClick={()=>{try{const store=getPersonalStore();if(selected)store.removeFavorite(fund.code);else store.addFavorite(fund);}catch(e){setError(e instanceof Error?e.message:"无法更新收藏。");}}}><Star size={18} fill={selected?"currentColor":"none"}/></button><AnimatedDialog open={Boolean(error)} onClose={()=>setError("")} title="收藏" className="personal-dialog"><p>{error}</p></AnimatedDialog></>;
}
