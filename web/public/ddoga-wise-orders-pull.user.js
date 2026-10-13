// ==UserScript==
// @name         DDOGA Wise orders pull
// @namespace    https://www.ddoga.lol/
// @version      1.0
// @description  ddoga에서 요청하면 와이스 최근 주문 40건을 전달
// @match        https://wyyyes.com/deliverylist*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function(){
 "use strict";
 const DDOGA="https://www.ddoga.lol";
 const allowed=new Set([10,16,25]);
 let auth="";
 const originalFetch=window.fetch;
 window.fetch=function(input,init){
  try{
   const url=typeof input==="string"?input:input?.url;
   if(url?.includes("/orderChains")){
    const h=new Headers(init?.headers||(input instanceof Request?input.headers:{}));
    const a=h.get("Authorization");
    if(a)auth=a;
   }
  }catch(_){}
  return originalFetch.apply(this,arguments);
 };
 async function collect(){
  if(!auth)throw Error("와이스 인증 정보가 아직 없어. 와이스 판매목록을 새로고침해줘.");
  const out=[],ids=new Set(),cursors=new Set();
  let next=null;
  for(let page=0;page<1000&&out.length<40;page++){
   const url=new URL("/r0.app/sellers/myMarket/orderChains",location.origin);
   if(next)url.searchParams.set("next",next);
   const res=await originalFetch.call(window,url.toString(),{credentials:"include",headers:{Accept:"application/json",Authorization:auth,"x-wyyyes-agent":"web/web (Original)","x-wyyyes-version":"web (Original)/no_ota"}});
   if(!res.ok)throw Error("와이스 조회 HTTP "+res.status);
   const data=await res.json();
   if(!Array.isArray(data.result))throw Error("와이스 주문 응답 형식 오류");
   for(const order of data.result){
    if(!allowed.has(Number(order.status)))continue;
    const id=order.id??order._id;
    if(id==null)throw Error("주문 ID 누락");
    if(ids.has(String(id)))continue;
    ids.add(String(id));out.push(order);
    if(out.length===40)break;
   }
   next=data.page?.next;
   if(!next)break;
   if(cursors.has(next))throw Error("페이지 커서 중복");
   cursors.add(next);
  }
  return out;
 }
 let busy=false;
 window.addEventListener("message",async e=>{
  if(e.origin!==DDOGA||e.source!==window.opener)return;
  if(e.data?.type!=="DDOGA_WISE_PULL_REQUEST"||busy)return;
  busy=true;
  try{
   const orders=await collect();
   window.opener?.postMessage({type:"DDOGA_WISE_ORDERS",orders},DDOGA);
  }catch(err){
   window.opener?.postMessage({type:"DDOGA_WISE_PULL_ERROR",error:String(err?.message||err)},DDOGA);
  }finally{busy=false;}
 });
 function ready(){window.opener?.postMessage({type:"DDOGA_WISE_PULL_READY"},DDOGA);}
 window.addEventListener("load",ready);
 setTimeout(ready,1200);
})();