"use client";
import {useEffect,useState} from "react";
import type {TypeKeywordRule} from "./item-analysis-type";
export function useTypeKeywords(){
 const [rules,setRules]=useState<TypeKeywordRule[]>([]),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;const controller=new AbortController();
 fetch("/api/sales-management/type-keywords",{cache:"no-store",signal:controller.signal}).then(async response=>{
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||"유형 키워드 조회 실패");
 if(active)setRules(data.rules||[]);
 }).catch(error=>{if(active)console.error("type keyword load",error)}).finally(()=>{if(active)setReady(true)});
 return()=>{active=false;controller.abort()};
 },[]);
 return {rules,ready};
}
