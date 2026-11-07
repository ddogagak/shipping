// ==UserScript==
// @name         DDOGA Wise orders pull
// @namespace    https://www.ddoga.lol/
// @updateURL     https://www.ddoga.lol/ddoga-wise-orders-pull.user.js
// @downloadURL   https://www.ddoga.lol/ddoga-wise-orders-pull.user.js
// @version      2.0
// @description  와이스 주문 전체 이력과 누적 정산금액을 ddoga에 전달
// @match        https://wyyyes.com/deliverylist*
// @match        https://wyyyes.com/expected-settlement-amount*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function(){
 "use strict";
 const DDOGA="https://www.ddoga.lol";
 if(location.pathname.startsWith("/expected-settlement-amount")){
  let attempts=0, lastAmount=null, stableCount=0;
  const normalize=(s)=>String(s||"").replace(/\s+/g," ").trim();
  const timer=setInterval(()=>{
   attempts++;
   const nodes=[...document.querySelectorAll("body *")].filter(node=>node.children.length===0&&normalize(node.textContent)==="누적 정산금액");
   let amount=null;
   for(const node of nodes){
    let parent=node.parentElement;
    for(let depth=0;parent&&depth<5;depth++,parent=parent.parentElement){
     const match=normalize(parent.innerText||parent.textContent).match(/누적\s*정산금액[\s\S]{0,100}?([\d,]+)\s*원/);
     if(match){amount=Number(match[1].replace(/,/g,""));break;}
    }
    if(amount!==null)break;
   }
   if(amount===null){
    const match=normalize(document.body?.innerText).match(/누적\s*정산금액[\s\S]{0,100}?([\d,]+)\s*원/);
    if(match)amount=Number(match[1].replace(/,/g,""));
   }
   // 0 may be a placeholder while the remote page is loading.
   if(Number.isFinite(amount)&&amount>0&&document.readyState==="complete"){
    stableCount=amount===lastAmount?stableCount+1:1;
    lastAmount=amount;
    if(stableCount>=3&&window.opener){
     clearInterval(timer);
     window.opener.postMessage({type:"DDOGA_WISE_SETTLEMENT_AMOUNT",amount},DDOGA);
     return;
    }
   }else{lastAmount=null;stableCount=0;}
   if(attempts>=90)clearInterval(timer);
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
  // Detailed order responses contain soldAt/videoId; a missing videoId alone does not block a valid sale.
  const missing=out.filter(o=>Array.isArray(o.stocks)&&o.stocks.some(s=>!s.soldAt||!s.videoId));
  if(missing.length){
   const headers={Accept:"application/json",Authorization:auth,"x-wyyyes-agent":"web/web (Original)","x-wyyyes-version":"web (Original)/no_ota"};
   let detailedOrders=0, detailFailures=0;
   async function enrich(order){
    const url=new URL("/r0.app/sellers/myMarket/orderChains/"+encodeURIComponent(order.id),location.origin);
    try{
     let detail=null;
     for(let attempt=1;attempt<=3;attempt++){
      try{
       const res=await originalFetch.call(window,url.toString(),{credentials:"include",headers});
       if(!res.ok)throw Error("HTTP "+res.status);
       const payload=await res.json();
       detail=payload?.result;
       if(!detail||String(detail.id)!==String(order.id)||!Array.isArray(detail.stocks))
        throw Error("상세 응답의 주문 ID 또는 stocks 구조 불일치");
       break;
      }catch(error){
       if(attempt===3)throw error;
       await new Promise(resolve=>setTimeout(resolve,attempt*900));
      }
     }
     const byId=new Map(detail.stocks.map(stock=>[String(stock.id),stock]));
     order.stocks=order.stocks.map(stock=>{
      const source=byId.get(String(stock.id));
      return {...stock,soldAt:source?.soldAt??stock.soldAt??null,videoId:source?.videoId??stock.videoId??null};
     });
     detailedOrders++;
    }catch(e){
     detailFailures++;
     console.warn("DDOGA 주문 상세 조회 실패",order.id,String(e?.message||e));
    }
   }
   // A small concurrent batch avoids overwhelming the seller endpoint.
   for(let i=0;i<missing.length;i+=5){
    await Promise.all(missing.slice(i,i+5).map(enrich));
   }
   const soldCount=out.reduce((n,o)=>n+(o.stocks||[]).filter(s=>s.soldAt).length,0);
   const videoCount=out.reduce((n,o)=>n+(o.stocks||[]).filter(s=>s.videoId).length,0);
   const itemCount=out.reduce((n,o)=>n+(o.stocks||[]).length,0);
   console.info("DDOGA Wise collection",{version:"2.0",orders:out.length,detailedOrders,detailFailures,soldCount,videoCount,itemCount});
   if(itemCount===0)throw Error("와이스 상품 목록이 비어 있어 전송할 수 없어.");
   if(soldCount!==itemCount){
    console.warn("DDOGA 판매시각 일부 누락: 주문 미리보기만 전송하며 매출자료 저장은 DDOGA에서 차단됨",{soldCount,itemCount,videoCount,detailedOrders,detailFailures});
   }
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
   window.opener?.postMessage({type:"DDOGA_WISE_ORDERS",scriptVersion:"2.0",orders},DDOGA);
  }catch(err){
   window.opener?.postMessage({type:"DDOGA_WISE_PULL_ERROR",error:String(err?.message||err)},DDOGA);
  }finally{busy=false;}
 });
 function ready(){window.opener?.postMessage({type:"DDOGA_WISE_PULL_READY",scriptVersion:"2.0"},DDOGA);}
 window.addEventListener("load",ready);
 setTimeout(ready,1200);
})();