"use client";
import Link from "next/link";
import {useState} from "react";

const GPT_PROMPT=`아래 국내 거래처 명세서/영수증/주문내역을 확인해서 방송판매재고 등록용 텍스트로 정리해줘.

[규칙]
- 반드시 아래 양식만 출력하고 설명은 쓰지 않는다.
- UNIT_PRICE는 해당 상품 1박스(또는 1개)당 실제 매입 단가이며 원화 숫자만 쓴다.
- QTY는 매입한 박스/상품 수량이다.
- BOX_COUNT는 한 박스 안에 들어 있는 판매 단위 개수다. 단품이면 1, 알 수 없으면 빈칸으로 둔다.
- 작품명은 헌터헌터/귀멸의칼날/나의히어로아카데미아/프리렌/진격의거인/치이카와/나루토/기타 중 하나로 쓴다.
- TYPE은 아크릴/지류/뱃지/피규어/키링/기타 중 하나로 쓴다.
- 이미지와 상품 URL은 자료에서 확인되는 경우 반드시 넣고, 확인되지 않으면 빈칸으로 둔다.
- 상품이 여러 개면 === ITEM === 블록을 반복한다.
- 이미지 1개는 명세서 1건으로 독립 처리한다.
- 각 ITEM의 MEMO에 거래처명을 적는다.
- 수량은 명세서의 합계와 품목별 표기를 대조하여 꼼꼼히 확인한다.

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
  const runText=async(action:string)=>{if(action==="preview"&&!text.trim())return setMsg("GPT가 정리한 텍스트를 붙여넣어줘.");if(action==="save"&&!preview?.purchase)return setMsg("먼저 미리보기를 눌러 내용을 확인해줘.");setBusy(true);setMsg(action==="preview"?"분석 중...":"방송판매재고에 등록 중...");try{const payload=action==="save"?{mode:action,purchase:preview.purchase}:{mode:action,text};const res=await fetch("/api/purchases/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),j=await res.json();if(!res.ok)throw new Error(j.message||"실패");if(action==="preview"){setPreview({purchase:j.purchase});setMsg(`${j.purchase.items.length}개 상품을 확인했어. 아래 항목을 수정한 뒤 등록하면 돼.`)}else{setMsg(`${j.itemCount}개 상품 등록 완료 · 방송판매재고에서 바로 확인할 수 있어.`);setPreview(null)}}catch(e){setMsg(e instanceof Error?e.message:"실패")}finally{setBusy(false)}};
  const copyPrompt=async()=>{await navigator.clipboard.writeText(GPT_PROMPT);setCopied(true);setTimeout(()=>setCopied(false),1500)};
  return <main style={page}><header style={header}><div><h1 style={{margin:0}}>매입 등록</h1><p style={sub}>해외 주문 엑셀 또는 국내 거래처 명세서 텍스트를 등록합니다.</p></div><div style={row}><Link href="/purchases" style={link}>매입관리</Link><Link href="/sale-inventory" style={link}>방송판매재고</Link></div></header>
    <div style={tabs}><button style={mode==="excel"?activeTab:tab} onClick={()=>{setMode("excel");setPreview(null);setMsg("")}}>해외 매입 엑셀</button><button style={mode==="text"?activeTab:tab} onClick={()=>{setMode("text");setPreview(null);setMsg("")}}>국내 명세서 텍스트</button></div>
    {mode==="excel"?<section style={box}><h2 style={h2}>Taobao 엑셀 등록</h2><input type="file" accept=".xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)}/><div style={actions}><button style={button} disabled={busy} onClick={()=>runExcel("preview")}>미리보기</button><button style={primary} disabled={busy} onClick={()=>runExcel("save")}>DB에 저장</button></div></section>:
    <><section style={guide}><div style={guideHead}><div><h2 style={h2}>ChatGPT 변환 명령어</h2><p style={sub}>거래처 명세서와 아래 명령어를 ChatGPT에 함께 넣으면 돼.</p></div><button style={copy} onClick={copyPrompt}>{copied?"복사됨":"명령어 복사"}</button></div><pre style={pre}>{GPT_PROMPT}</pre></section>
    <section style={box}><h2 style={h2}>변환된 텍스트 붙여넣기</h2><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="=== PURCHASE ===부터 붙여넣어줘" style={textarea}/><div style={actions}><button style={button} disabled={busy} onClick={()=>runText("preview")}>미리보기</button><button style={primary} disabled={busy} onClick={()=>runText("save")}>방송판매재고에 등록</button></div></section></>}
    {msg&&<div style={notice}>{msg}</div>}
    {preview?.purchase&&<PurchasePreview purchase={preview.purchase} onChange={(purchase:any)=>setPreview({purchase})}/>} {preview?.excelOrders?.map((o:any)=><section key={o.order_number} style={card}><b>{o.order_number}</b> · {o.shop_name} · {o.ordered_at}{o.items.map((i:any,n:number)=><div key={n} style={itemRow}>{i.product_name}<b>{Number(i.unit_price).toLocaleString()} CNY × {i.quantity}</b></div>)}</section>)}
  </main>;
}

function PurchasePreview({purchase,onChange}:{purchase:any;onChange:(purchase:any)=>void}){
  const editHeader=(key:string,value:string)=>onChange({...purchase,[key]:key==="local_shipping"?Number(value):value});
  const editItem=(index:number,key:string,value:string)=>onChange({...purchase,items:purchase.items.map((item:any,i:number)=>i!==index?item:{...item,[key]:["unit_price","quantity","component_count"].includes(key)?(value===""?null:Number(value)):value})});
  return <section style={previewBox}><h2 style={h2}>미리보기 수정</h2><div style={editGrid}>
    <Edit label="거래처명" value={purchase.supplier} onChange={v=>editHeader("supplier",v)}/><Edit label="매입일" type="date" value={purchase.purchased_at} onChange={v=>editHeader("purchased_at",v)}/><Edit label="명세서/주문번호" value={purchase.invoice_number} onChange={v=>editHeader("invoice_number",v)}/><Edit label="국내 배송비" type="number" value={String(purchase.local_shipping||0)} onChange={v=>editHeader("local_shipping",v)}/><Edit label="전체 메모" value={purchase.memo||""} onChange={v=>editHeader("memo",v)}/>
  </div>{purchase.items.map((item:any,index:number)=><article key={index} style={editCard}><div style={itemTitle}>상품 #{index+1}</div><div style={editGrid}>
    <Edit label="상품명" value={item.product_name} onChange={v=>editItem(index,"product_name",v)}/><SelectEdit label="작품명" value={item.series_name} options={seriesOptions} onChange={v=>editItem(index,"series_name",v)}/><SelectEdit label="타입" value={item.item_type} options={typeOptions} onChange={v=>editItem(index,"item_type",v)}/><Edit label="옵션/종류" value={item.option_text||""} onChange={v=>editItem(index,"option_text",v)}/><Edit label="매입 단가(원)" type="number" value={String(item.unit_price??"")} onChange={v=>editItem(index,"unit_price",v)}/><Edit label="매입 수량" type="number" value={String(item.quantity??"")} onChange={v=>editItem(index,"quantity",v)}/><Edit label="박스당 구성품" type="number" value={String(item.component_count??"")} onChange={v=>editItem(index,"component_count",v)}/><Edit label="대표 이미지 URL" value={item.image_url||""} onChange={v=>editItem(index,"image_url",v)}/><Edit label="라인업 이미지 URL" value={item.lineup_image_url||""} onChange={v=>editItem(index,"lineup_image_url",v)}/><Edit label="상품 URL" value={item.product_url||""} onChange={v=>editItem(index,"product_url",v)}/><Edit label="메모" value={item.memo||""} onChange={v=>editItem(index,"memo",v)}/>
  </div>{item.image_url&&<img src={item.image_url} alt="대표 이미지 미리보기" style={wideThumb}/>}</article>)}</section>
}

function Edit({label,value,onChange,type="text"}:{label:string;value:string;onChange:(value:string)=>void;type?:string}){return <label style={editLabel}><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} style={editInput}/></label>}
function SelectEdit({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(value:string)=>void}){return <label style={editLabel}><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)} style={editInput}>{options.map(option=><option key={option}>{option}</option>)}</select></label>}

const page={maxWidth:1120,margin:"0 auto",padding:24,fontFamily:"Arial, sans-serif"},header={display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap" as const},sub={margin:"7px 0 0",color:"#6b7280",fontSize:14},row={display:"flex",gap:8},link={padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:9,textDecoration:"none",color:"#111",fontWeight:700},tabs={display:"flex",gap:8,margin:"24px 0 12px"},tab={padding:"11px 18px",border:"1px solid #94a3b8",borderRadius:10,background:"white",fontWeight:800,cursor:"pointer"},activeTab={...tab,background:"#0047FF",color:"white",borderColor:"#0047FF"},box={border:"2px solid #0047FF",borderRadius:16,padding:20,background:"#FEFF5A"},guide={border:"1px solid #cbd5e1",borderRadius:16,padding:20,background:"#f8fafc",marginBottom:14},guideHead={display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"},h2={margin:"0 0 14px",fontSize:20},copy={padding:"9px 13px",border:0,borderRadius:9,background:"#111",color:"white",fontWeight:800,cursor:"pointer"},pre={whiteSpace:"pre-wrap" as const,maxHeight:310,overflow:"auto",background:"#111827",color:"#e5e7eb",padding:16,borderRadius:10,fontSize:12,lineHeight:1.55},textarea={width:"100%",minHeight:340,boxSizing:"border-box" as const,border:"1px solid #94a3b8",borderRadius:10,padding:14,fontFamily:"monospace",fontSize:13},actions={display:"flex",gap:8,marginTop:14},button={padding:"10px 16px",borderRadius:10,border:"1px solid #111",background:"white",fontWeight:800,cursor:"pointer"},primary={...button,background:"#0047FF",color:"white",borderColor:"#0047FF"},notice={marginTop:14,padding:13,borderRadius:10,background:"#eef2ff",fontWeight:700},previewBox={marginTop:16},summary={display:"flex",gap:16,flexWrap:"wrap" as const,padding:15,borderRadius:12,background:"#111",color:"white"},previewItem={display:"flex",alignItems:"center",gap:14,border:"1px solid #dbe1e8",borderRadius:12,padding:12,marginTop:9,background:"white"},thumb={width:64,height:64,objectFit:"cover" as const,borderRadius:8},noImage={width:64,height:64,display:"grid",placeItems:"center",background:"#e5e7eb",borderRadius:8,fontSize:10,color:"#64748b"},tags={display:"flex",gap:5,marginBottom:7},small={fontSize:12,color:"#64748b",marginTop:5},card={border:"1px solid #ddd",borderRadius:14,padding:16,marginTop:12,background:"white"},itemRow={display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderTop:"1px solid #ddd",marginTop:8};
const editGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10},editCard={border:"2px solid #0047FF",borderRadius:14,padding:16,marginTop:12,background:"white"},itemTitle={fontWeight:900,fontSize:15,marginBottom:12,color:"#0047FF"},editLabel={display:"flex",flexDirection:"column" as const,gap:5,fontSize:12,fontWeight:800,color:"#374151"},editInput={width:"100%",height:38,boxSizing:"border-box" as const,border:"1px solid #94a3b8",borderRadius:8,padding:"0 9px",background:"white",fontSize:13},wideThumb={display:"block",maxWidth:180,maxHeight:180,objectFit:"contain" as const,marginTop:12,border:"1px solid #e5e7eb",borderRadius:9};
