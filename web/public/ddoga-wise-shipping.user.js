// ==UserScript==
// @name DDOGA Wise shipping bridge
// @namespace https://www.ddoga.lol/
// @version 0.6
// @match https://wyyyes.com/*
// @grant none
// ==/UserScript==
(()=>{
 const origin="https://www.ddoga.lol";
 const norm=x=>String(x||"").normalize("NFKC").replace(/\s+/g,"").toLowerCase();
 const digits=x=>String(x||"").replace(/\D/g,"");
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
  const raw=await r.text();
  let j;
  try { j=JSON.parse(raw); }
  catch (_) {
    const kind=raw.trimStart().startsWith("<")?"HTML 페이지":raw.trimStart().slice(0,60);
    throw Error("와이스 응답이 JSON이 아님 (HTTP "+r.status+", "+r.url+", "+kind+"). 로그인 화면/요청 경로를 확인해야 해.");
  }
  if(!r.ok)throw Error("HTTP "+r.status+": "+(j.message||j.error||"API 오류"));
  return j;
 }
 async function preview(orders){
  matches=[];
  try{
   const list=await request("/r0.app/sellers/myMarket/buyers/undeliveredUsers");
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
  const targets=matches.filter(x=>x.status==="ready"&&ids.includes(x.order_id));
  if(!targets.length){send("DDOGA_WISE_SHIP_RESULT",{results:[{nickname:"선택 주문",ok:false,error:"등록 대상이 없어. 미리보기를 다시 실행해줘."}]});return;}
  for(const m of targets){
   try{
    const url="/r0.app/sellers/myMarket/deliveries?cursorOrderChainId="+m.cursor_order_chain_id+"&deliveryIds="+m.delivery_id;
    const cleanCode=digits(m.tracking_number);
    if(!/^\d{8,}$/.test(cleanCode))throw Error("송장번호 형식 오류");
    const j=await request(url,{method:"PATCH",body:JSON.stringify({deliveryCode:cleanCode,deliveryCompany:"LOGEN",status:25})});
    if(j.message!=="success"||!j.result?.some(x=>Number(x.id)===m.delivery_id&&Number(x.status)===25&&x.deliveryCompany==="LOGEN"&&digits(x.deliveryCode)===cleanCode))throw Error("와이스 등록 응답 불일치");
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