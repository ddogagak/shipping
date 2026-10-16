// ==UserScript==
// @name         DDOGA Wise orders pull
// @namespace    https://www.ddoga.lol/
// @updateURL     https://www.ddoga.lol/ddoga-wise-orders-pull.user.js
// @downloadURL   https://www.ddoga.lol/ddoga-wise-orders-pull.user.js
// @version      1.1
// @description  ddoga에서 요청하면 와이스 전체 주문 이력을 전달
// @match        https://wyyyes.com/deliverylist*
// @match        https://wyyyes.com/expected-settlement-amount*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function(){
 "use strict";
 const DDOGA="https://www.ddoga.lol";
 if(location.pathname.startsWith("/expected-settlement-amount")){
  let attempts=0;
  const timer=setInterval(()=>{
   attempts++;
   const normalize=(s)=>String(s||"").replace(/\\s+/g," ").trim();
   const nodes=[...document.querySelectorAll("body *")].filter(node=>node.children.length===0&&normalize(node.textContent)==="누적 정산금액");
   let amount=null;
   for(const node of nodes){
    let parent=node.parentElement;
    for(let depth=0;parent&&depth<5;depth++,parent=parent.parentElement){
     const text=normalize(parent.innerText||parent.textContent);
     const match=text.match(/누적\\s*정산금액[\\s\\S]{0,100}?([\\d,]+)\\s*원/);
     if(match){amount=Number(match[1].replace(/,/g,""));break;}
    }
    if(amount!==null)break;
   }
   if(amount===null){
    const text=normalize(document.body?.innerText);
    const match=text.match(/누적\\s*정산금액[\\s\\S]{0,100}?([\\d,]+)\\s*원/);
    if(match)amount=Number(match[1].replace(/,/g,""));
   }
   if(Number.isFinite(amount)&&amount>=0&&window.opener){
    clearInterval(timer);
    window.opener.postMessage({type:"DDOGA_WISE_SETTLEMENT_AMOUNT",amount},DDOGA);
   }
   if(attempts>=60)clearInterval(timer);
  },1000);
  return;
 }
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
  for(let page=0;page<1000;page++){
   const url=new URL("/r0.app/sellers/myMarket/orderChains",location.origin);
   if(next)url.searchParams.set("next",next);
   const res=await originalFetch.call(window,url.toString(),{credentials:"include",headers:{Accept:"application/json",Authorization:auth,"x-wyyyes-agent":"web/web (Original)","x-wyyyes-version":"web (Original)/no_ota"}});
   if(!res.ok)throw Error("와이스 조회 HTTP "+res.status);
   const data=await res.json();
   if(!Array.isArray(data.result))throw Error("와이스 주문 응답 형식 오류");
   for(const order of data.result){
    const id=order.id??order._id;
    if(id==null)throw Error("주문 ID 누락");
    if(ids.has(String(id)))continue;
    ids.add(String(id));out.push(order);
    if(out.length>20000)throw Error("주문이 2만건을 넘어 한 번에 동기화할 수 없어.");
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