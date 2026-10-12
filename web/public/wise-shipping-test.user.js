// ==UserScript==
// @name         도파민빵팩토리 와이스 송장 1건 테스트
// @namespace    https://www.ddoga.lol/
// @version      0.1.0
// @description  와이스 배송 상세 페이지에서 ddoga 송장을 한 건씩 확인 후 등록
// @match        https://wyyyes.com/delivery-list-by-user/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      www.ddoga.lol
// ==/UserScript==
(function () {
  "use strict";
  const DDOGA = "https://www.ddoga.lol";
  let auth = "";
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      const token = headers.get("Authorization");
      if (token && token.length > 8) auth = token;
    } catch (_) {}
    return originalFetch.apply(this, arguments);
  };
  const norm = s => String(s || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const digits = s => String(s || "").replace(/\D/g, "");
  function ddoga(method, path, body) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method, url: DDOGA + path, withCredentials: true,
      headers: body ? {"Content-Type":"application/json"} : {},
      data: body ? JSON.stringify(body) : undefined,
      onload: r => {
        try { const data = JSON.parse(r.responseText); if (r.status >= 200 && r.status < 300 && data.ok) resolve(data);
          else reject(new Error(data.error || "ddoga 응답 오류 (" + r.status + ")")); }
        catch (e) { reject(e); }
      },
      onerror: () => reject(new Error("ddoga 접속 실패. ddoga 관리자 로그인 여부를 확인하세요."))
    }));
  }
  function el(tag, text, parent) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function init() {
    if (document.getElementById("ddoga-wise-ship")) return;
    const button = el("button", "🍞", document.body);
    button.id = "ddoga-wise-ship";
    button.style.cssText = "position:fixed;right:14px;bottom:16px;z-index:2147483647;background:#ffdd45;border:2px solid #333;border-radius:30px;width:48px;height:48px;font-size:25px;cursor:pointer";
    const panel = el("div", null, document.body);
    panel.style.cssText = "display:none;position:fixed;right:12px;bottom:74px;z-index:2147483647;background:white;color:#111;border:2px solid #222;border-radius:12px;padding:14px;width:min(360px,calc(100vw - 44px));max-height:75vh;overflow:auto;font:14px sans-serif;box-shadow:0 6px 25px #0004";
    el("strong", "🍞 와이스 송장 1건 테스트", panel);
    el("p", "와이스 배송 상세에서 개발자도구로 확인한 cursorOrderChainId / deliveryIds를 입력하세요. 구매자와 송장번호를 반드시 직접 대조하세요.", panel);
    const input = (placeholder) => {const x=el("input",null,panel);x.placeholder=placeholder;x.style.cssText="box-sizing:border-box;width:100%;margin:4px 0;padding:9px;border:1px solid #aaa;border-radius:6px";return x;};
    const cursor = input("cursorOrderChainId");
    const delivery = input("deliveryIds (숫자 1개)");
    const nickname = input("와이스 구매자 닉네임 (정확히 입력)");
    const select = el("select",null,panel);select.style.cssText="width:100%;padding:8px;margin:8px 0";
    const msg=el("p","아직 전송되지 않았습니다.",panel);
    const refresh=el("button","ddoga 대상 조회",panel);
    const submit=el("button","선택한 1건 송장 등록",panel);
    submit.disabled=true;
    for(const b of [refresh,submit]) b.style.cssText="padding:9px;margin:4px;border-radius:8px;border:1px solid #999;cursor:pointer";
    button.onclick=()=>{panel.style.display=panel.style.display==="none"?"block":"none";};
    let rows=[];
    refresh.onclick=async()=>{
      try {
        msg.textContent="조회 중...";
        const data=await ddoga("GET","/api/domestic/wise-shipping");
        rows=data.rows||[];select.replaceChildren();
        for(const row of rows){const option=el("option",row.nickname+" / "+row.recipient_name+" / "+row.tracking_number+" / "+row.order_id,select);option.value=row.order_id;}
        msg.textContent="대상 "+rows.length+"건. 닉네임과 수취인을 직접 확인하세요.";
        submit.disabled=!rows.length;
      } catch(e){msg.textContent="조회 실패: "+e.message;}
    };
    submit.onclick=async()=>{
      const row=rows.find(r=>String(r.order_id)===select.value);
      const chain=cursor.value.trim(), id=delivery.value.trim();
      if(!row || !/^\d+$/.test(chain) || !/^\d+$/.test(id) || !nickname.value.trim()) {alert("배송 식별자와 와이스 닉네임을 입력하세요.");return;}
      if(norm(row.nickname)!==norm(nickname.value)) {alert("닉네임이 일치하지 않아 중단했습니다.");return;}
      if(!/^\d{8,}$/.test(digits(row.tracking_number))) {alert("송장번호 형식을 확인하세요.");return;}
      if(!auth) {alert("와이스 인증 헤더를 아직 확인하지 못했습니다. 페이지를 새로고침하고 배송 목록을 다시 열어주세요.");return;}
      const promptText="와이스 구매자: "+nickname.value+"\nddoga 수취인: "+row.recipient_name+"\n운송장: "+row.tracking_number+"\n와이스 배송 ID: "+id+"\n\n수취인과 와이스 배송 ID를 확인했나요? 실제 발송완료 처리됩니다.";
      if(!confirm(promptText))return;
      submit.disabled=true;
      try {
        const url="/r0.app/sellers/myMarket/deliveries?cursorOrderChainId="+encodeURIComponent(chain)+"&deliveryIds="+encodeURIComponent(id);
        const response=await originalFetch.call(window,url,{method:"PATCH",credentials:"include",headers:{
          "Accept":"application/json","Content-Type":"application/json","Authorization":auth,
          "x-wyyyes-agent":"web/web (Original)","x-wyyyes-version":"web (Original)/no_ota"
        },body:JSON.stringify({deliveryCode:row.tracking_number,deliveryCompany:"LOGEN",status:25})});
        const result=await response.json();
        const match=Array.isArray(result.result)&&result.result.some(x=>Number(x.id)===Number(id)&&Number(x.status)===25&&x.deliveryCompany==="LOGEN"&&digits(x.deliveryCode)===digits(row.tracking_number));
        if(!response.ok || result.message!=="success" || !match)throw new Error("와이스 성공 확인 불가: "+JSON.stringify(result).slice(0,350));
        try {
          await ddoga("PATCH","/api/domestic/wise-shipping",{order_id:row.order_id,tracking_number:row.tracking_number,wise_delivery_id:Number(id),wise_success:true});
          msg.textContent="완료! 와이스 발송완료 + ddoga 등록 Y: "+row.nickname;
        } catch(e) {
          msg.textContent="주의: 와이스 등록 성공, ddoga 상태 갱신 실패. 중복 전송하지 말고 수동 확인하세요. "+e.message;
        }
      } catch(e) {msg.textContent="등록 중단: "+e.message;} finally {submit.disabled=false;}
    };
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
