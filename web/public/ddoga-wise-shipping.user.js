// ==UserScript==
// @name DDOGA Wise shipping bridge
// @namespace https://www.ddoga.lol/
// @version 0.14
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
  if(!r.ok){const err=new Error("HTTP "+r.status+": "+(j.message||j.error||"API 오류"));err.status=r.status;throw err;}
  return j;
 }
 // 화면에 합배송 확인 팝업이 나타날 경우에만 추가 확인
 const clicked=new WeakSet();
 async function confirmIfAppears(timeout=5000){
  const until=Date.now()+timeout;
  while(Date.now()<until){
   const button=[...document.querySelectorAll('div[tabindex="0"]')].find(el=>
    !clicked.has(el)&&/^일괄 발송 완료 처리\s*\(총\s*\d+건\)$/.test((el.innerText||"").trim())&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0);
   if(button){clicked.add(button);button.click();console.log("[DDOGA WISE] 일괄 발송 확인 클릭");return true;}
   await new Promise(r=>setTimeout(r,150));
  }
  return false;
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
    // 와이스가 반환한 배송 목록 순서를 유지하고, 미발송 입력칸 중 첫 번째를 선택한다.
    // Wise에 이미 등록된 동일 송장은 재등록하지 않는다.
    const code=digits(o.tracking_number);
    const registered=chains.filter(c=>Number(c.delivery_id)>0&&(Number(c.status)===25||!!c.deliveryCode));
    if(registered.some(c=>digits(c.deliveryCode)===code&&code)){
      m.reason="Wise에 동일 운송장 이미 등록됨";matches.push(m);continue;
    }
    const active=chains.filter(c=>Number(c.delivery_id)>0&&!c.deliveryCode&&Number(c.status)!==25);
    if(active.length<1){m.reason=registered.length?"Wise에 이미 송장 등록됨":"등록 가능한 미발송 배송 ID 없음";matches.push(m);continue;}
    const first=active[0];
    m.delivery_id=Number(first.delivery_id);
    m.cursor_order_chain_id=Number(first.firstOrderGroupId);
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
    send("DDOGA_WISE_SHIP_PROGRESS",{message:m.nickname+": Wise 기존 등록 여부 재확인 중..."});
    const list=await request("/r0.app/sellers/myMarket/buyers/undeliveredUsers");
    const users=Array.isArray(list.result)?list.result:[];
    const people=users.filter(u=>norm(u.nickname||u.user?.nickname)===norm(m.nickname));
    if(people.length!==1)throw Error("미발송자 목록에서 닉네임 확인 불가 (재등록 방지)");
    const uid=people[0]._id||people[0].userId;
    const chains=(await request("/r0.app/sellers/myMarket/orderChains?userId="+encodeURIComponent(uid))).result||[];
    const registered=chains.filter(c=>Number(c.delivery_id)>0&&(Number(c.status)===25||!!c.deliveryCode));
    if(registered.length){
      const same=registered.some(c=>digits(c.deliveryCode)===digits(m.tracking_number));
      throw Error(same?"Wise에 동일 운송장 이미 등록됨 (건너뜀)":"Wise에 기존 송장 등록됨 (자동 덮어쓰기 방지)");
    }
    const active=chains.filter(c=>Number(c.delivery_id)>0&&!c.deliveryCode&&Number(c.status)!==25);
    if(!active.length)throw Error("등록 가능한 미발송 배송 ID 없음");
    m.delivery_id=Number(active[0].delivery_id);
    m.cursor_order_chain_id=Number(active[0].firstOrderGroupId);
    if(!m.cursor_order_chain_id)throw Error("주문 묶음 ID 없음");
    send("DDOGA_WISE_SHIP_PROGRESS",{message:m.nickname+": 와이스 송장 등록 요청 중..."});
    const url="/r0.app/sellers/myMarket/deliveries?cursorOrderChainId="+m.cursor_order_chain_id+"&deliveryIds="+m.delivery_id;
    const cleanCode=digits(m.tracking_number);
    if(!/^\d{8,}$/.test(cleanCode))throw Error("송장번호 형식 오류");
    let needsConfirmation=false;
    try{
     const j=await request(url,{method:"PATCH",body:JSON.stringify({deliveryCode:cleanCode,deliveryCompany:"LOGEN",status:25})});
     if(j.message!=="success")throw Error("와이스 등록 요청 실패: "+(j.message||j.error||"알 수 없는 응답"));
    }catch(e){
     if(e.status!==412)throw e;
     needsConfirmation=true;
     send("DDOGA_WISE_SHIP_PROGRESS",{message:m.nickname+": 추가 주문(412) 감지. 와이스 합배송 확인 버튼 확인 중..."});
    }
    const clickedConfirmation=await confirmIfAppears();
    if(needsConfirmation&&!clickedConfirmation)throw Error("와이스가 추가 주문(HTTP 412)을 요구했지만 확인 버튼을 찾지 못했어. 와이스에서 직접 송장 등록 후 일괄 발송 완료 처리를 해줘.");
    send("DDOGA_WISE_SHIP_PROGRESS",{message:m.nickname+": 최종 발송 상태 확인 중..."});
    // 확인 버튼을 누른 뒤 와이스의 최종 배송 상태를 다시 조회한다.
    let verified=false;
    for(let i=0;i<8;i++){
     await new Promise(r=>setTimeout(r,600));
     const check=await request("/r0.app/sellers/myMarket/deliveries?cursorOrderChainId="+m.cursor_order_chain_id+"&deliveryIds="+m.delivery_id);
     const records=Array.isArray(check.result)?check.result:[];
     if(records.some(x=>Number(x.id||x.delivery_id)===m.delivery_id&&Number(x.status)===25&&x.deliveryCompany==="LOGEN"&&digits(x.deliveryCode)===cleanCode)){verified=true;break;}
    }
    if(!verified)throw Error("송장 등록 요청 후 발송 완료를 확인하지 못했어. 와이스에서 직접 확인하고 재등록은 하지 마.");
    send("DDOGA_WISE_SHIP_SYNC",{row:{order_id:m.order_id,tracking_number:m.tracking_number,delivery_id:m.delivery_id}});
    results.push({order_id:m.order_id,nickname:m.nickname,ok:true});
   }catch(e){results.push({order_id:m.order_id,nickname:m.nickname,ok:false,error:e.message});}
  }
  send("DDOGA_WISE_SHIP_RESULT",{results});
 }
 window.addEventListener("message",e=>{
  if(e.origin!==origin||e.source!==window.opener)return;
  if(e.data?.type==="DDOGA_WISE_SHIP_PING")ready();
  if(e.data?.type==="DDOGA_WISE_SHIP_PREVIEW_REQUEST")void preview(e.data.orders||[]);
  if(e.data?.type==="DDOGA_WISE_SHIP_REGISTER_REQUEST")void register(e.data.order_ids||[]);
 });
 const ready=()=>send("DDOGA_WISE_SHIP_READY");
 window.addEventListener("load",ready);setTimeout(ready,1000);
})();