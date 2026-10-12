// ==UserScript==
// @name DDOGA Wise shipping bridge
// @namespace https://www.ddoga.lol/
// @version 0.3
// @match https://wyyyes.com/*
// @grant none
// ==/UserScript==
(()=>{
 const origin="https://www.ddoga.lol";
 const norm=x=>String(x||"").normalize("NFKC").replace(/\s+/g,"").toLowerCase();
 let matches=[];
 let authHeader = "";
 const originalFetch = window.fetch;
 window.fetch = function(input,init) {
   try {
     const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
     const a = h.get("Authorization");
     if(a) authHeader = a;
   } catch (_) {}
   return originalFetch.apply(this,arguments);
 };
 const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
 XMLHttpRequest.prototype.setRequestHeader = function(name,value) {
   if(String(name).toLowerCase()==="authorization" && value) authHeader=String(value);
   return originalSetHeader.apply(this,arguments);
 };
 const send=(type,extra={})=>window.opener?.postMessage({type,...extra},origin);
 async function request(path,options={}){
  if(!authHeader) throw Error("와이스 인증 헤더를 아직 확인하지 못했어. 와이스에서 배송 목록을 다시 열어줘.");
  const r=await originalFetch.call(window,path,{credentials:"include",headers:{"Content-Type":"application/json","Authorization":authHeader},...options});
  const j=await r.json();if(!r.ok)throw Error(j.message||"HTTP "+r.status);return j;
 }
 async function preview(orders){
  matches=[];
  try{
   const list=await request("/r0.app/sellers/myMarket/undeliveredUsers");
   const users=Array.isArray(list.result)?list.result:[];
   for(const o of orders){
    const m={order_id:o.order_id,nickname:o.nickname,tracking_number:o.tracking_number,status:"skip",reason:"",delivery_id:0,cursor_order_chain_id:0};
    const people=users.filter(u=>norm(u.nickname||u.user?.nickname)===norm(o.nickname));
    if(people.length!==1){m.reason=people.length?"중복 닉네임":"닉네임 없음";matches.push(m);continue;}
    const uid=people[0]._id||people[0].userId;
    const chains=(await request("/r0.app/sellers/myMarket/orderChains?userId="+encodeURIComponent(uid))).result||[];
    const ids=[...new Set(chains.filter(c=>c.delivery_id&&!c.deliveryCode&&Number(c.status)!==25).map(c=>Number(c.delivery_id)))];
    if(ids.length!==1){m.reason="배송 ID 없음 또는 여러 개";matches.push(m);continue;}
    m.delivery_id=ids[0];m.cursor_order_chain_id=Number(chains[0].firstOrderGroupId);
    if(!m.cursor_order_chain_id){m.reason="주문 묶음 ID 없음";matches.push(m);continue;}
    m.status="ready";m.reason="등록 가능";matches.push(m);
   }
   const seen=new Set();
   for(const m of matches.filter(x=>x.status==="ready")){if(seen.has(m.delivery_id)){m.status="skip";m.reason="동일 배송 중복";}seen.add(m.delivery_id);}
   send("DDOGA_WISE_SHIP_PREVIEW",{matches});
  }catch(e){send("DDOGA_WISE_SHIP_PREVIEW",{matches,error:"와이스 조회 실패: "+e.message});}
 }
 async function register(ids){
  const results=[];
  for(const m of matches.filter(x=>x.status==="ready"&&ids.includes(x.order_id))){
   try{
    const url="/r0.app/sellers/myMarket/deliveries?cursorOrderChainId="+m.cursor_order_chain_id+"&deliveryIds="+m.delivery_id;
    const j=await request(url,{method:"PATCH",body:JSON.stringify({deliveryCode:m.tracking_number,deliveryCompany:"LOGEN",status:25})});
    if(j.message!=="success"||!j.result?.some(x=>Number(x.id)===m.delivery_id&&Number(x.status)===25&&x.deliveryCompany==="LOGEN"&&String(x.deliveryCode)===String(m.tracking_number)))throw Error("와이스 등록 응답 불일치");
    send("DDOGA_WISE_SHIP_SYNC",{row:{order_id:m.order_id,tracking_number:m.tracking_number,delivery_id:m.delivery_id}});
    results.push({nickname:m.nickname,ok:true});
   }catch(e){results.push({nickname:m.nickname,ok:false,error:e.message});}
  }
  send("DDOGA_WISE_SHIP_RESULT",{results});
 }
 window.addEventListener("message",e=>{
  if(e.origin!==origin||e.source!==window.opener)return;
  if(e.data?.type==="DDOGA_WISE_SHIP_PREVIEW_REQUEST")void preview(e.data.orders||[]);
  if(e.data?.type==="DDOGA_WISE_SHIP_REGISTER_REQUEST")void register(e.data.order_ids||[]);
 });
 const ready=()=>send("DDOGA_WISE_SHIP_READY");
 window.addEventListener("load",ready);setTimeout(ready,1000);
})();