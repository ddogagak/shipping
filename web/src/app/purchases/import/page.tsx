"use client";
import Link from "next/link";
import {useState} from "react";

const KOREA_PROMPT=`아래 국내 거래처 명세서/영수증/주문내역을 확인해서 매입관리 등록용 텍스트로 정리해줘.

[규칙]
- 반드시 아래 양식만 출력하고 설명은 쓰지 않는다.
- 이번 요청에 함께 첨부된 모든 이미지/명세서는 거래처별 하나의 PURCHASE로 통합한다.
- 같은 거래처의 동일 상품이 여러 명세서에 반복되면 상품명+옵션+UNIT_PRICE가 같은 경우 하나의 ITEM으로 합치고 QTY를 모두 합산한다.
- 옵션 또는 UNIT_PRICE가 다르면 별도 ITEM으로 둔다. 동일 상품인지 애매하면 임의로 합치지 않는다.
- UNIT_PRICE는 해당 상품 1박스(또는 1개)당 실제 매입 단가이며 원화 숫자만 쓴다.
- QTY는 모든 첨부 명세서에서 해당 상품의 매입 수량을 합친 값이다.
- BOX_COUNT는 한 박스 안에 들어 있는 판매 단위 개수다. 단품이면 1, 알 수 없으면 빈칸으로 둔다.
- 작품명은 헌터헌터/귀멸의칼날/나의히어로아카데미아/프리렌/진격의거인/치이카와/나루토/기타 중 하나로 쓴다.
- TYPE은 아크릴/지류/뱃지/피규어/키링/기타 중 하나로 쓴다.
- 이미지와 상품 URL은 자료에서 확인되는 경우 반드시 넣고, 확인되지 않으면 빈칸으로 둔다.
- 각 ITEM의 MEMO에 거래처명을 적는다. 바로배송/합배송/출고예정 등 배송 관련 표기가 있으면 함께 적는다.
- 배송비가 실제 금액으로 청구된 경우만 LOCAL_SHIPPING에 합산한다. 추후 청구처럼 금액 미확정이면 MEMO에 적는다.
- 최종 UNIT_PRICE×QTY 합계와 명세서 합계를 다시 검산한다.
- PURCHASE MEMO에는 거래처명, 통합한 명세서 수, 최종 총 상품수량, 최종 상품금액을 적는다.

[출력 양식]
=== PURCHASE ===
SUPPLIER: 거래처명
PURCHASE_DATE: YYYY-MM-DD
INVOICE_NO: 거래명세서번호 또는 주문번호
LOCAL_SHIPPING: 국내 배송비
MEMO:

=== ITEM ===
NAME: 한국어 상품명
SERIES: 작품명
TYPE: 상품 유형
OPTION: 옵션/종류
UNIT_PRICE: 원화 매입 단가
QTY: 매입 수량
BOX_COUNT: 박스당 판매 단위 수
IMAGE: 대표 이미지 URL
LINEUP_IMAGE: 라인업 이미지 URL
PRODUCT_URL: 상품 URL
MEMO: 등급, 비율 등 기타사항`;

const JAPAN_PROMPT=`아래 일본 구매대행 신청내역 페이지의 HTML/마크다운/텍스트 소스를 확인해서 매입관리 등록용 텍스트로 정리해줘.

[중요: 페이지 구조 확인]
- 페이지 전체를 확인하고 상품 목록의 각 행을 기준으로 추출한다. 일부 보이는 부분만 보고 누락하지 않는다.
- 상태가 "구매완료"인 상품 행만 정리한다. 구매취소/다른 상태 건은 제외한다.
- 각 상품 행에서 아이템번호(itemId), 신청서번호(orderId), 상품명, 상품 링크 href, 이미지 src, 엔화 가격(price), 수량(quantity), 날짜(date), 배송센터, 운송장번호를 각각 확인한다.
- 신청서번호가 같은 상품들은 하나의 PURCHASE로 통합한다. 신청서번호가 다르면 반드시 별도 PURCHASE로 나눈다.

[판매처 / 구매처]
- SUPPLIER는 구매대행업체명이 아니라 실제 원본 상품 판매처를 적는다.
- 실제 판매처는 각 상품의 PRODUCT_URL 도메인으로 판별한다. 예: jumpcs.shueisha.co.jp → JUMP SHOP, amnibus.com → AMNIBUS.
- 한 신청서 안에 판매처가 하나뿐이면 그 판매처명을 SUPPLIER에 적는다.
- 한 신청서 안에 서로 다른 판매처가 섞여 있으면 SUPPLIER는 "일본 구매대행"으로 적고 각 ITEM의 MEMO에 해당 판매처명을 적는다.
- 판매처를 확실히 특정할 수 없으면 임의로 추측하지 말고 PRODUCT_URL의 도메인을 판매처로 적는다.

[가격 / 수량 / 날짜]
- PURCHASE_DATE는 해당 상품 행의 date에 표시된 날짜를 사용한다. 같은 신청서 안의 날짜가 다르면 가장 이른 구매일을 PURCHASE_DATE로 쓰고 MEMO에 날짜가 혼재한다고 적는다.
- INVOICE_NO는 신청서번호(orderId)를 그대로 쓴다.
- UNIT_PRICE는 해당 상품 행의 price에 표시된 ¥ 금액을 그대로 숫자로 적는다. 쉼표와 ¥ 기호만 제거하고 원화 환산이나 임의 계산을 하지 않는다.
- QTY는 해당 상품 행의 quantity에 표시된 수량을 그대로 적는다.
- 화면의 price와 quantity를 보고 UNIT_PRICE를 나누거나 곱해서 재계산하지 않는다. 페이지에 표시된 값을 그대로 사용한다.
- LOCAL_SHIPPING은 일본 내 배송비가 이 자료에서 명확하게 별도 금액으로 확인되는 경우에만 엔화 숫자로 적고, 확인되지 않으면 0으로 둔다. 국제배송비나 한국 내 비용을 넣지 않는다.

[상품 정보]
- NAME은 상품 행의 상품 링크 텍스트를 우선 사용한다. 페이지에 더 구체적인 원본 상품명이 함께 확인되는 경우에만 그 이름을 사용한다.
- 페이지에 can badge / acrylic / magnet처럼 단순한 이름만 있으면 임의로 캐릭터명이나 세부 상품명을 만들어내지 말고 보이는 이름을 그대로 쓴다.
- 작품명은 헌터헌터/귀멸의칼날/나의히어로아카데미아/프리렌/진격의거인/치이카와/나루토/기타 중 하나로 쓴다. 자료에서 작품이 명확하지 않으면 기타로 둔다.
- TYPE은 아크릴/지류/뱃지/피규어/키링/기타 중 하나로 쓴다. can badge/badge는 뱃지, acrylic은 아크릴, card/paper goods는 지류, keychain/keyring은 키링으로 분류한다. magnet/plastic bag처럼 해당 분류가 없으면 기타로 둔다.
- OPTION은 자료에서 옵션/종류가 별도로 확인될 때만 적고, 없으면 빈칸으로 둔다.
- BOX_COUNT는 한 박스 안 판매 단위 수가 명확하게 확인될 때만 적는다. 단품 판매임이 명확하면 1, 알 수 없으면 빈칸으로 둔다. QTY를 BOX_COUNT로 넣지 않는다.

[URL / 이미지]
- PRODUCT_URL은 해당 상품명 <a> 태그의 원본 href를 반드시 넣는다. 구매대행 사이트의 정보/문의/통관 링크를 넣지 않는다.
- IMAGE는 같은 상품 행의 썸네일 <img> src 원본 URL을 반드시 넣는다. 로고, UI 아이콘, 구매대행 사이트 이미지를 넣지 않는다.
- HTML이 view-source 마크다운 형태로 [URL](view-source:URL)처럼 보이면 실제 원본 URL 부분만 사용한다.
- LINEUP_IMAGE는 별도의 라인업 이미지가 실제 자료에서 확인될 때만 넣고, 없으면 빈칸으로 둔다.

[MEMO / 검산]
- ITEM MEMO에는 최소한 "판매처: ○○ / 아이템번호: ○○"를 적는다.
- LX 판토스 등 운송장번호가 확인되면 ITEM MEMO에 "운송장: ○○"도 적는다.
- 배송센터가 확인되면 ITEM MEMO에 함께 적는다. 예: "배송센터: 일본(항공)".
- 같은 상품명이라도 PRODUCT_URL, UNIT_PRICE, OPTION 중 하나라도 다르면 서로 다른 ITEM으로 유지한다. 임의로 합치지 않는다.
- 마지막에 페이지의 구매완료 상품 수와 추출한 ITEM 수를 비교해 누락 여부를 검산한다. 단, 출력에는 설명이나 검산 문장을 추가하지 않는다.

[출력 양식]
=== PURCHASE ===
SUPPLIER: 실제 판매처 또는 일본 구매대행
PURCHASE_DATE: YYYY-MM-DD
INVOICE_NO: 신청서번호
LOCAL_SHIPPING: 일본 내 배송비(엔화 숫자, 미확인이면 0)
MEMO: 일본 구매대행

=== ITEM ===
NAME: 페이지에 표시된 상품명
SERIES: 작품명
TYPE: 상품 유형
OPTION: 옵션/종류
UNIT_PRICE: 페이지에 표시된 엔화 가격 숫자
QTY: 페이지에 표시된 수량
BOX_COUNT: 박스당 판매 단위 수
IMAGE: 해당 상품 행의 대표 이미지 URL
LINEUP_IMAGE: 라인업 이미지 URL
PRODUCT_URL: 해당 상품의 원본 판매처 URL
MEMO: 판매처 / 아이템번호 / 운송장 / 배송센터`;

type Mode="china"|"korea"|"japan";
const seriesOptions=["헌터헌터","귀멸의칼날","나의히어로아카데미아","프리렌","진격의거인","치이카와","나루토","기타"];
const typeOptions=["아크릴","지류","뱃지","피규어","키링","기타"];
export default function PurchaseImport(){
 const[mode,setMode]=useState<Mode>("china"),[file,setFile]=useState<File|null>(null),[text,setText]=useState(""),[preview,setPreview]=useState<any>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
 const prompt=mode==="japan"?JAPAN_PROMPT:KOREA_PROMPT;
 const changeMode=(next:Mode)=>{setMode(next);setPreview(null);setMsg("");setText("");setCopied(false)};
 const runExcel=async(action:string)=>{if(!file)return setMsg("订单数据.xlsx 파일을 선택해줘.");setBusy(true);setMsg(action==="preview"?"분석 중...":"저장 중...");try{const fd=new FormData();fd.append("file",file);fd.append("mode",action);const res=await fetch("/api/purchases/import",{method:"POST",body:fd}),j=await res.json();if(!res.ok)throw new Error(j.message||"실패");if(action==="preview"){setPreview({excelOrders:j.orders||[]});setMsg(`${j.orders?.length||0}개 주문을 찾았어.`)}else setMsg(`${j.saved}개 주문 저장 완료`);}catch(e){setMsg(e instanceof Error?e.message:"실패")}finally{setBusy(false)}};
 const runText=async(action:string)=>{if(action==="preview"&&!text.trim())return setMsg("GPT가 정리한 텍스트를 붙여넣어줘.");if(action==="save"&&!preview?.purchase)return setMsg("먼저 미리보기를 눌러 내용을 확인해줘.");if(action==="save"&&!(preview.purchase.items||[]).some((item:any)=>item._selected!==false))return setMsg("저장할 상품을 하나 이상 체크해줘.");setBusy(true);setMsg(action==="preview"?"분석 중...":"매입관리에 등록 중...");try{const selectedPurchase=action==="save"?{...preview.purchase,items:(preview.purchase.items||[]).filter((item:any)=>item._selected!==false).map(({_selected,...item}:any)=>item)}:null;const payload=action==="save"?{mode:action,purchase:selectedPurchase,source_type:mode}:{mode:action,text,source_type:mode};const res=await fetch("/api/purchases/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),j=await res.json();if(!res.ok)throw new Error(j.message||"실패");if(action==="preview"){const purchase={...j.purchase,items:(j.purchase.items||[]).map((item:any)=>({...item,_selected:true}))};setPreview({purchase});setMsg(`${purchase.items.length}개 상품을 확인했어. 저장할 상품만 체크해서 등록하면 돼.`)}else{setMsg(`${j.itemCount}개 상품 ${mode==="japan"?"일본":"한국"} 매입 등록 완료`);setPreview(null)}}catch(e){setMsg(e instanceof Error?e.message:"실패")}finally{setBusy(false)}};
 const copyPrompt=async()=>{await navigator.clipboard.writeText(prompt);setCopied(true);setTimeout(()=>setCopied(false),1500)};
 return <main style={page}><header style={header}><div><h1 style={{margin:0}}>매입 등록</h1><p style={sub}>중국 · 한국 · 일본 매입 자료를 매입관리에 등록합니다.</p></div><div style={topLinks}><Link href="/purchases" style={link}>매입관리</Link><Link href="/sale-inventory" style={link}>방송판매재고</Link></div></header>
 <div style={tabs}><button style={mode==="china"?activeTab:tab} onClick={()=>changeMode("china")}>🇨🇳 중국 · 타오바오</button><button style={mode==="korea"?activeTab:tab} onClick={()=>changeMode("korea")}>🇰🇷 한국 · 명세서 텍스트</button><button style={mode==="japan"?activeTab:tab} onClick={()=>changeMode("japan")}>🇯🇵 일본 · 구매대행 텍스트</button></div>
 {mode==="china"?<section style={box}><h2 style={h2}>🇨🇳 Taobao 엑셀 등록</h2><input type="file" accept=".xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)}/><div style={actions}><button style={button} disabled={busy} onClick={()=>runExcel("preview")}>미리보기</button><button style={primary} disabled={busy} onClick={()=>runExcel("save")}>매입관리에 등록</button></div></section>:<><section style={guide}><div style={guideHead}><div><h2 style={h2}>{mode==="japan"?"🇯🇵 일본 구매대행 변환 명령어":"🇰🇷 국내 명세서 변환 명령어"}</h2><p style={sub}>{mode==="japan"?"엘덱스 같은 구매대행 신청내역 페이지 소스를 올리고 이 명령어를 같이 넣으면 돼.":"합배송할 명세서 이미지를 한꺼번에 올리고 이 명령어를 같이 넣으면 돼."}</p></div><button style={copy} onClick={copyPrompt}>{copied?"복사됨":"명령어 복사"}</button></div><pre style={pre}>{prompt}</pre></section><section style={box}><h2 style={h2}>{mode==="japan"?"일본 구매대행 텍스트 붙여넣기":"국내 명세서 텍스트 붙여넣기"}</h2><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="=== PURCHASE ===부터 붙여넣어줘" style={textarea}/><div style={actions}><button style={button} disabled={busy} onClick={()=>runText("preview")}>미리보기</button><button style={primary} disabled={busy} onClick={()=>runText("save")}>매입관리에 등록</button></div></section></>}
 {msg&&<div style={notice}>{msg}</div>}{preview?.purchase&&<PurchasePreview purchase={preview.purchase} onChange={(purchase:any)=>setPreview({purchase})} currency={mode==="japan"?"엔":"원"}/>} {preview?.excelOrders?.map((o:any)=><section key={o.order_number} style={card}><b>{o.order_number}</b> · {o.shop_name} · {o.ordered_at}{o.items.map((i:any,n:number)=><div key={n} style={itemRow}>{i.product_name}<b>{Number(i.unit_price).toLocaleString()} CNY × {i.quantity}</b></div>)}</section>)}</main>;
}
function PurchasePreview({purchase,onChange,currency}:{purchase:any;onChange:(purchase:any)=>void;currency:string}){
 const[pastingIndex,setPastingIndex]=useState<number|null>(null),[pasteMsg,setPasteMsg]=useState("");
 const editHeader=(key:string,value:string)=>onChange({...purchase,[key]:key==="local_shipping"?Number(value):value});
 const editItem=(index:number,key:string,value:any)=>onChange({...purchase,items:purchase.items.map((item:any,i:number)=>i!==index?item:{...item,[key]:["unit_price","quantity","component_count"].includes(key)?(value===""?null:Number(value)):value})});
 const setAllSelected=(checked:boolean)=>onChange({...purchase,items:purchase.items.map((item:any)=>({...item,_selected:checked}))});
 const selectedCount=(purchase.items||[]).filter((item:any)=>item._selected!==false).length;
 const pasteImage=async(index:number,e:React.ClipboardEvent<HTMLDivElement>)=>{
  const imageItem=Array.from(e.clipboardData.items).find(item=>item.kind==="file"&&item.type.startsWith("image/"));
  if(!imageItem)return;
  e.preventDefault();
  const file=imageItem.getAsFile();
  if(!file)return;
  setPastingIndex(index);setPasteMsg("이미지 업로드 중...");
  try{
   const fd=new FormData();
   const workId=`purchase-${String(purchase.invoice_number||purchase.supplier||purchase.purchased_at||"preview").replace(/[^a-zA-Z0-9가-힣_-]+/g,"-")}`;
   fd.append("file",file,file.name||`clipboard-${Date.now()}.png`);
   fd.append("work_id",workId);
   fd.append("image_id",`item-${index+1}-${Date.now()}`);
   const res=await fetch("/api/stock/import/image",{method:"POST",body:fd}),j=await res.json();
   if(!res.ok)throw new Error(j.detail||j.error||"이미지 업로드 실패");
   editItem(index,"image_url",j.image?.image_url||"");
   setPasteMsg(`상품 #${index+1} 대표 이미지 붙여넣기 완료`);
  }catch(error){setPasteMsg(error instanceof Error?error.message:"이미지 업로드 실패");}
  finally{setPastingIndex(null);setTimeout(()=>setPasteMsg(""),2200);}
 };
 return <section style={previewBox}><div style={previewTitleRow}><h2 style={h2}>미리보기 수정</h2><label style={selectAll}><input type="checkbox" checked={selectedCount===purchase.items.length&&purchase.items.length>0} onChange={e=>setAllSelected(e.target.checked)}/> 전체 선택 <b>{selectedCount}/{purchase.items.length}</b></label></div><p style={pasteGuide}>저장할 상품만 체크해. BAND/웹 이미지는 원하는 상품의 이미지 칸을 클릭하고 <b>Ctrl+V</b> 하면 대표 이미지로 들어가.</p>{pasteMsg&&<div style={pasteNotice}>{pasteMsg}</div>}<div style={editGrid}><Edit label="거래처명" value={purchase.supplier} onChange={v=>editHeader("supplier",v)}/><Edit label="매입일" type="date" value={purchase.purchased_at} onChange={v=>editHeader("purchased_at",v)}/><Edit label="명세서/주문번호" value={purchase.invoice_number} onChange={v=>editHeader("invoice_number",v)}/><Edit label={currency==="엔"?"일본 내 배송비(엔)":"국내 배송비"} type="number" value={String(purchase.local_shipping||0)} onChange={v=>editHeader("local_shipping",v)}/><Edit label="전체 메모" value={purchase.memo||""} onChange={v=>editHeader("memo",v)}/></div>{purchase.items.map((item:any,index:number)=><article key={index} style={{...editCard,...(item._selected===false?unselectedCard:{})}}><div style={thumbColumn}><label style={itemCheck}><input type="checkbox" checked={item._selected!==false} onChange={e=>editItem(index,"_selected",e.target.checked)}/><span>저장</span></label><div role="button" tabIndex={0} title="클릭 후 Ctrl+V로 이미지 붙여넣기" onPaste={e=>void pasteImage(index,e)} style={{...pasteTarget,...(pastingIndex===index?pasteTargetBusy:{})}}>{pastingIndex===index?<div style={noImage}>업로드중</div>:item.image_url?<img src={item.image_url} alt="대표 이미지" style={thumb}/>:<div style={noImage}>클릭<br/>Ctrl+V</div>}<span style={pasteHint}>{item.image_url?"다시 붙여넣기":"이미지 붙여넣기"}</span></div></div><div style={itemEditor}><div style={itemTitle}>상품 #{index+1} {item._selected===false&&<span style={skipBadge}>저장 제외</span>}</div><div style={editGrid}><Edit label="상품명" value={item.product_name} onChange={v=>editItem(index,"product_name",v)}/><SelectEdit label="작품명" value={item.series_name} options={seriesOptions} onChange={v=>editItem(index,"series_name",v)}/><SelectEdit label="타입" value={item.item_type} options={typeOptions} onChange={v=>editItem(index,"item_type",v)}/><Edit label="옵션/종류" value={item.option_text||""} onChange={v=>editItem(index,"option_text",v)}/><Edit label={`매입 단가(${currency})`} type="number" value={String(item.unit_price??"")} onChange={v=>editItem(index,"unit_price",v)}/><Edit label="매입 수량" type="number" value={String(item.quantity??"")} onChange={v=>editItem(index,"quantity",v)}/><Edit label="박스당 구성품" type="number" value={String(item.component_count??"")} onChange={v=>editItem(index,"component_count",v)}/><Edit label="대표 이미지 URL" value={item.image_url||""} onChange={v=>editItem(index,"image_url",v)}/><Edit label="라인업 이미지 URL" value={item.lineup_image_url||""} onChange={v=>editItem(index,"lineup_image_url",v)}/><Edit label="상품 URL" value={item.product_url||""} onChange={v=>editItem(index,"product_url",v)}/><Edit label="메모" value={item.memo||""} onChange={v=>editItem(index,"memo",v)}/></div></div></article>)}</section>
}
function Edit({label,value,onChange,type="text"}:{label:string;value:string;onChange:(value:string)=>void;type?:string}){return <label style={editLabel}><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} style={editInput}/></label>}
function SelectEdit({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(value:string)=>void}){return <label style={editLabel}><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)} style={editInput}>{options.map(option=><option key={option}>{option}</option>)}</select></label>}
const page={maxWidth:1120,margin:"0 auto",padding:24,fontFamily:"Arial, sans-serif"},header={display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap" as const},sub={margin:"7px 0 0",color:"#6b7280",fontSize:14},topLinks={display:"flex",gap:8},link={padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:9,textDecoration:"none",color:"#111",fontWeight:700},tabs={display:"flex",gap:8,margin:"24px 0 12px",flexWrap:"wrap" as const},tab={padding:"11px 18px",border:"1px solid #94a3b8",borderRadius:10,background:"white",fontWeight:800,cursor:"pointer"},activeTab={...tab,background:"#111827",color:"white",borderColor:"#111827"},box={border:"1px solid #d1d5db",borderRadius:14,padding:20,background:"#fff"},guide={border:"1px solid #d1d5db",borderRadius:14,padding:20,background:"#f8fafc",marginBottom:14},guideHead={display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"},h2={margin:"0 0 14px",fontSize:20},copy={padding:"9px 13px",border:0,borderRadius:9,background:"#111827",color:"white",fontWeight:800,cursor:"pointer"},pre={whiteSpace:"pre-wrap" as const,maxHeight:310,overflow:"auto",background:"#111827",color:"#e5e7eb",padding:16,borderRadius:10,fontSize:12,lineHeight:1.55},textarea={width:"100%",minHeight:340,boxSizing:"border-box" as const,border:"1px solid #cbd5e1",borderRadius:10,padding:14,fontFamily:"monospace",fontSize:13,background:"#fff"},actions={display:"flex",gap:8,marginTop:14},button={padding:"10px 16px",borderRadius:10,border:"1px solid #111827",background:"white",fontWeight:800,cursor:"pointer"},primary={...button,background:"#111827",color:"white"},notice={marginTop:14,padding:13,borderRadius:10,background:"#eef2ff",fontWeight:700},previewBox={marginTop:16},previewTitleRow={display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap" as const},selectAll={display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:800,color:"#374151"},card={border:"1px solid #ddd",borderRadius:14,padding:16,marginTop:12,background:"white"},itemRow={display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderTop:"1px solid #ddd",marginTop:8},editGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10},editCard={display:"grid",gridTemplateColumns:"96px 1fr",gap:14,border:"1px solid #d1d5db",borderRadius:14,padding:14,marginTop:12,background:"white"},unselectedCard={opacity:.58,background:"#f8fafc"},thumbColumn={paddingTop:4},itemCheck={display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontSize:12,fontWeight:900,color:"#111827",marginBottom:8},thumb={width:72,height:72,objectFit:"cover" as const,borderRadius:9,border:"1px solid #e5e7eb",display:"block"},noImage={width:72,height:72,display:"grid",placeItems:"center",textAlign:"center" as const,background:"#f3f4f6",border:"1px dashed #cbd5e1",borderRadius:9,fontSize:10,color:"#64748b",lineHeight:1.3},pasteTarget={width:80,minHeight:98,padding:4,border:"2px dashed #cbd5e1",borderRadius:12,background:"#f8fafc",cursor:"pointer",outline:"none"},pasteTargetBusy={opacity:.65,cursor:"wait"},pasteHint={display:"block",fontSize:10,fontWeight:800,color:"#64748b",textAlign:"center" as const,marginTop:5,lineHeight:1.2},pasteGuide={margin:"-4px 0 12px",padding:"10px 12px",borderRadius:10,background:"#f0fdf4",color:"#166534",fontSize:13},pasteNotice={margin:"0 0 12px",padding:"9px 11px",borderRadius:9,background:"#eef2ff",fontSize:12,fontWeight:800,color:"#3730a3"},itemEditor={minWidth:0},itemTitle={fontWeight:900,fontSize:15,marginBottom:12,color:"#111827"},skipBadge={display:"inline-block",marginLeft:8,padding:"2px 7px",borderRadius:999,background:"#e5e7eb",color:"#6b7280",fontSize:10},editLabel={display:"flex",flexDirection:"column" as const,gap:5,fontSize:12,fontWeight:800,color:"#374151"},editInput={width:"100%",height:38,boxSizing:"border-box" as const,border:"1px solid #cbd5e1",borderRadius:8,padding:"0 9px",background:"white",fontSize:13};