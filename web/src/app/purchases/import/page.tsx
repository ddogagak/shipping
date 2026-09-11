"use client";
import Link from "next/link";
import {useState} from "react";

const GPT_PROMPT=`아래 국내 거래처 명세서/영수증/주문내역을 확인해서 매입관리 등록용 텍스트로 정리해줘.

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

type Mode="excel"|"text";
const seriesOptions=["헌터헌터","귀멸의칼날","나의히어로아카데미아","프리렌","진격의거인","치이카와","나루토","기타"];
const typeOptions=["아크릴","지류","뱃지","피규어","키링","기타"];
export default function PurchaseImport(){
 const[mode,setMode]=useState<Mode>("excel"),[file,setFile]=useState<File|null>(null),[text,setText]=useState(""),[preview,setPreview]=useState<any>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
 const runExcel=async(action:string)=>{if(!file)return setMsg("订单数据.xlsx 파일을 선택해줘.");setBusy(true);setMsg(action==="preview"?"분석 중...":"저장 중...");try{const fd=new FormData();fd.append("file",file);fd.append("mode",action);const res=await fetch("/api/purchases/import",{method:"POST",body:fd}),j=await res.json();if(!res.ok)throw new Error(j.message||"실패");if(action==="preview"){setPreview({excelOrders:j.orders||[]});setMsg(`${j.orders?.length||0}개 주문을 찾았어.`)}else setMsg(`${j.saved}개 주문 저장 완료`);}catch(e){setMsg(e instanceof Error?e.message:"실패")}finally{setBusy(false)}};
 const runText=async(action:string)=>{if(action==="preview"&&!text.trim())return setMsg("GPT가 정리한 텍스트를 붙여넣어줘.");if(action==="save"&&!preview?.purchase)return setMsg("먼저 미리보기를 눌러 내용을 확인해줘.");if(action==="save"&&!(preview.purchase.items||[]).some((item:any)=>item._selected!==false))return setMsg("저장할 상품을 하나 이상 체크해줘.");setBusy(true);setMsg(action==="preview"?"분석 중...":"매입관리에 등록 중...");try{const selectedPurchase=action==="save"?{...preview.purchase,items:(preview.purchase.items||[]).filter((item:any)=>item._selected!==false).map(({_selected,...item}:any)=>item)}:null;const payload=action==="save"?{mode:action,purchase:selectedPurchase}:{mode:action,text};const res=await fetch("/api/purchases/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),j=await res.json();if(!res.ok)throw new Error(j.message||"실패");if(action==="preview"){const purchase={...j.purchase,items:(j.purchase.items||[]).map((item:any)=>({...item,_selected:true}))};setPreview({purchase});setMsg(`${purchase.items.length}개 상품을 확인했어. 저장할 상품만 체크해서 등록하면 돼.`)}else{setMsg(`${j.itemCount}개 상품 매입관리 등록 완료`);setPreview(null)}}catch(e){setMsg(e instanceof Error?e.message:"실패")}finally{setBusy(false)}};
 const copyPrompt=async()=>{await navigator.clipboard.writeText(GPT_PROMPT);setCopied(true);setTimeout(()=>setCopied(false),1500)};
 return <main style={page}><header style={header}><div><h1 style={{margin:0}}>매입 등록</h1><p style={sub}>해외 주문 엑셀 또는 국내 거래처 명세서를 매입관리에 등록합니다.</p></div><div style={topLinks}><Link href="/purchases" style={link}>매입관리</Link><Link href="/sale-inventory" style={link}>방송판매재고</Link></div></header>
 <div style={tabs}><button style={mode==="excel"?activeTab:tab} onClick={()=>{setMode("excel");setPreview(null);setMsg("")}}>해외 매입 엑셀</button><button style={mode==="text"?activeTab:tab} onClick={()=>{setMode("text");setPreview(null);setMsg("")}}>국내 명세서 텍스트</button></div>
 {mode==="excel"?<section style={box}><h2 style={h2}>Taobao 엑셀 등록</h2><input type="file" accept=".xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)}/><div style={actions}><button style={button} disabled={busy} onClick={()=>runExcel("preview")}>미리보기</button><button style={primary} disabled={busy} onClick={()=>runExcel("save")}>매입관리에 등록</button></div></section>:<><section style={guide}><div style={guideHead}><div><h2 style={h2}>ChatGPT 변환 명령어</h2><p style={sub}>합배송할 명세서 이미지를 한꺼번에 올리고 이 명령어를 같이 넣으면 돼.</p></div><button style={copy} onClick={copyPrompt}>{copied?"복사됨":"명령어 복사"}</button></div><pre style={pre}>{GPT_PROMPT}</pre></section><section style={box}><h2 style={h2}>변환된 텍스트 붙여넣기</h2><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="=== PURCHASE ===부터 붙여넣어줘" style={textarea}/><div style={actions}><button style={button} disabled={busy} onClick={()=>runText("preview")}>미리보기</button><button style={primary} disabled={busy} onClick={()=>runText("save")}>매입관리에 등록</button></div></section></>}
 {msg&&<div style={notice}>{msg}</div>}{preview?.purchase&&<PurchasePreview purchase={preview.purchase} onChange={(purchase:any)=>setPreview({purchase})}/>} {preview?.excelOrders?.map((o:any)=><section key={o.order_number} style={card}><b>{o.order_number}</b> · {o.shop_name} · {o.ordered_at}{o.items.map((i:any,n:number)=><div key={n} style={itemRow}>{i.product_name}<b>{Number(i.unit_price).toLocaleString()} CNY × {i.quantity}</b></div>)}</section>)}</main>;
}
function PurchasePreview({purchase,onChange}:{purchase:any;onChange:(purchase:any)=>void}){
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
 return <section style={previewBox}><div style={previewTitleRow}><h2 style={h2}>미리보기 수정</h2><label style={selectAll}><input type="checkbox" checked={selectedCount===purchase.items.length&&purchase.items.length>0} onChange={e=>setAllSelected(e.target.checked)}/> 전체 선택 <b>{selectedCount}/{purchase.items.length}</b></label></div><p style={pasteGuide}>저장할 상품만 체크해. BAND/웹 이미지는 원하는 상품의 이미지 칸을 클릭하고 <b>Ctrl+V</b> 하면 대표 이미지로 들어가.</p>{pasteMsg&&<div style={pasteNotice}>{pasteMsg}</div>}<div style={editGrid}><Edit label="거래처명" value={purchase.supplier} onChange={v=>editHeader("supplier",v)}/><Edit label="매입일" type="date" value={purchase.purchased_at} onChange={v=>editHeader("purchased_at",v)}/><Edit label="명세서/주문번호" value={purchase.invoice_number} onChange={v=>editHeader("invoice_number",v)}/><Edit label="국내 배송비" type="number" value={String(purchase.local_shipping||0)} onChange={v=>editHeader("local_shipping",v)}/><Edit label="전체 메모" value={purchase.memo||""} onChange={v=>editHeader("memo",v)}/></div>{purchase.items.map((item:any,index:number)=><article key={index} style={{...editCard,...(item._selected===false?unselectedCard:{})}}><div style={thumbColumn}><label style={itemCheck}><input type="checkbox" checked={item._selected!==false} onChange={e=>editItem(index,"_selected",e.target.checked)}/><span>저장</span></label><div role="button" tabIndex={0} title="클릭 후 Ctrl+V로 이미지 붙여넣기" onPaste={e=>void pasteImage(index,e)} style={{...pasteTarget,...(pastingIndex===index?pasteTargetBusy:{})}}>{pastingIndex===index?<div style={noImage}>업로드중</div>:item.image_url?<img src={item.image_url} alt="대표 이미지" style={thumb}/>:<div style={noImage}>클릭<br/>Ctrl+V</div>}<span style={pasteHint}>{item.image_url?"다시 붙여넣기":"이미지 붙여넣기"}</span></div></div><div style={itemEditor}><div style={itemTitle}>상품 #{index+1} {item._selected===false&&<span style={skipBadge}>저장 제외</span>}</div><div style={editGrid}><Edit label="상품명" value={item.product_name} onChange={v=>editItem(index,"product_name",v)}/><SelectEdit label="작품명" value={item.series_name} options={seriesOptions} onChange={v=>editItem(index,"series_name",v)}/><SelectEdit label="타입" value={item.item_type} options={typeOptions} onChange={v=>editItem(index,"item_type",v)}/><Edit label="옵션/종류" value={item.option_text||""} onChange={v=>editItem(index,"option_text",v)}/><Edit label="매입 단가(원)" type="number" value={String(item.unit_price??"")} onChange={v=>editItem(index,"unit_price",v)}/><Edit label="매입 수량" type="number" value={String(item.quantity??"")} onChange={v=>editItem(index,"quantity",v)}/><Edit label="박스당 구성품" type="number" value={String(item.component_count??"")} onChange={v=>editItem(index,"component_count",v)}/><Edit label="대표 이미지 URL" value={item.image_url||""} onChange={v=>editItem(index,"image_url",v)}/><Edit label="라인업 이미지 URL" value={item.lineup_image_url||""} onChange={v=>editItem(index,"lineup_image_url",v)}/><Edit label="상품 URL" value={item.product_url||""} onChange={v=>editItem(index,"product_url",v)}/><Edit label="메모" value={item.memo||""} onChange={v=>editItem(index,"memo",v)}/></div></div></article>)}</section>
}
function Edit({label,value,onChange,type="text"}:{label:string;value:string;onChange:(value:string)=>void;type?:string}){return <label style={editLabel}><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} style={editInput}/></label>}
function SelectEdit({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(value:string)=>void}){return <label style={editLabel}><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)} style={editInput}>{options.map(option=><option key={option}>{option}</option>)}</select></label>}
const page={maxWidth:1120,margin:"0 auto",padding:24,fontFamily:"Arial, sans-serif"},header={display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap" as const},sub={margin:"7px 0 0",color:"#6b7280",fontSize:14},topLinks={display:"flex",gap:8},link={padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:9,textDecoration:"none",color:"#111",fontWeight:700},tabs={display:"flex",gap:8,margin:"24px 0 12px"},tab={padding:"11px 18px",border:"1px solid #94a3b8",borderRadius:10,background:"white",fontWeight:800,cursor:"pointer"},activeTab={...tab,background:"#111827",color:"white",borderColor:"#111827"},box={border:"1px solid #d1d5db",borderRadius:14,padding:20,background:"#fff"},guide={border:"1px solid #d1d5db",borderRadius:14,padding:20,background:"#f8fafc",marginBottom:14},guideHead={display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"},h2={margin:"0 0 14px",fontSize:20},copy={padding:"9px 13px",border:0,borderRadius:9,background:"#111827",color:"white",fontWeight:800,cursor:"pointer"},pre={whiteSpace:"pre-wrap" as const,maxHeight:310,overflow:"auto",background:"#111827",color:"#e5e7eb",padding:16,borderRadius:10,fontSize:12,lineHeight:1.55},textarea={width:"100%",minHeight:340,boxSizing:"border-box" as const,border:"1px solid #cbd5e1",borderRadius:10,padding:14,fontFamily:"monospace",fontSize:13,background:"#fff"},actions={display:"flex",gap:8,marginTop:14},button={padding:"10px 16px",borderRadius:10,border:"1px solid #111827",background:"white",fontWeight:800,cursor:"pointer"},primary={...button,background:"#111827",color:"white"},notice={marginTop:14,padding:13,borderRadius:10,background:"#eef2ff",fontWeight:700},previewBox={marginTop:16},previewTitleRow={display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap" as const},selectAll={display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:800,color:"#374151"},card={border:"1px solid #ddd",borderRadius:14,padding:16,marginTop:12,background:"white"},itemRow={display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderTop:"1px solid #ddd",marginTop:8},editGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10},editCard={display:"grid",gridTemplateColumns:"96px 1fr",gap:14,border:"1px solid #d1d5db",borderRadius:14,padding:14,marginTop:12,background:"white"},unselectedCard={opacity:.58,background:"#f8fafc"},thumbColumn={paddingTop:4},itemCheck={display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontSize:12,fontWeight:900,color:"#111827",marginBottom:8},thumb={width:72,height:72,objectFit:"cover" as const,borderRadius:9,border:"1px solid #e5e7eb",display:"block"},noImage={width:72,height:72,display:"grid",placeItems:"center",textAlign:"center" as const,background:"#f3f4f6",border:"1px dashed #cbd5e1",borderRadius:9,fontSize:10,color:"#64748b",lineHeight:1.3},pasteTarget={width:80,minHeight:98,padding:4,border:"2px dashed #cbd5e1",borderRadius:12,background:"#f8fafc",cursor:"pointer",outline:"none"},pasteTargetBusy={opacity:.65,cursor:"wait"},pasteHint={display:"block",fontSize:10,fontWeight:800,color:"#64748b",textAlign:"center" as const,marginTop:5,lineHeight:1.2},pasteGuide={margin:"-4px 0 12px",padding:"10px 12px",borderRadius:10,background:"#f0fdf4",color:"#166534",fontSize:13},pasteNotice={margin:"0 0 12px",padding:"9px 11px",borderRadius:9,background:"#eef2ff",fontSize:12,fontWeight:800,color:"#3730a3"},itemEditor={minWidth:0},itemTitle={fontWeight:900,fontSize:15,marginBottom:12,color:"#111827"},skipBadge={display:"inline-block",marginLeft:8,padding:"2px 7px",borderRadius:999,background:"#e5e7eb",color:"#6b7280",fontSize:10},editLabel={display:"flex",flexDirection:"column" as const,gap:5,fontSize:12,fontWeight:800,color:"#374151"},editInput={width:"100%",height:38,boxSizing:"border-box" as const,border:"1px solid #cbd5e1",borderRadius:8,padding:"0 9px",background:"white",fontSize:13};