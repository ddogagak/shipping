"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InventoryItem = {
  id: string | number; item_name: string | null; item_type: string | null; series_name: string | null;
  image_url: string | null; lineup_image_url: string | null; source_url: string | null; order_number: string | null;
  order_date: string | null; tracking_number: string | null; quantity: number | null; yen_price: number | null;
  shipping_fee: number | null; domestic_shipping_fee: number | null; total_price: number | null; currency: string | null;
  purchase_price: number | null; status: string | null; memo: string | null; component_count: number | null;
  unit_sale_price: number | null; option_seq?: number | null; internal_sku?: string | null; created_at?: string | null;
};

const statusList=["전체","입고전","해외배송","입고완료","판매중","판매완료","보류"];
const typeList=["전체","아크릴","지류","뱃지","피규어","키링","기타"];
const seriesList=["전체","헌터헌터","귀멸의칼날","나의히어로아카데미아","프리렌","진격의거인","치이카와","나루토","기타"];
const currencyList=["JPY","CNY"];

function normalizedLink(value?: string|null){
  const raw=String(value||"").trim(); if(!raw) return "";
  try { const u=new URL(raw); const id=u.searchParams.get("id")||u.searchParams.get("itemId")||u.searchParams.get("offerId"); return id?`${u.hostname}:${id}`:`${u.hostname}${u.pathname}`; } catch { return raw; }
}

export default function InventoryClient({initialItems}:{initialItems:InventoryItem[]}){
  const [items,setItems]=useState(initialItems??[]); const [keyword,setKeyword]=useState(""); const [status,setStatus]=useState("전체");
  const [type,setType]=useState("전체"); const [series,setSeries]=useState("전체"); const [trackingFilter,setTrackingFilter]=useState("전체");
  const [sort,setSort]=useState("최신등록순"); const [sameLinkOnly,setSameLinkOnly]=useState(false); const [message,setMessage]=useState("");
  const [savingId,setSavingId]=useState<string|number|null>(null); const [deletingId,setDeletingId]=useState<string|number|null>(null); const [lineupImage,setLineupImage]=useState<string|null>(null);

  const linkCounts=useMemo(()=>{const m=new Map<string,number>(); items.forEach(i=>{const k=normalizedLink(i.source_url); if(k)m.set(k,(m.get(k)||0)+1)}); return m;},[items]);
  const filtered=useMemo(()=>{
    const rows=items.filter(item=>{const q=keyword.trim().toLowerCase(); const k=normalizedLink(item.source_url);
      return (!q||String(item.item_name??"").toLowerCase().includes(q)||String(item.order_number??"").toLowerCase().includes(q)||String(item.tracking_number??"").toLowerCase().includes(q)||String(item.memo??"").toLowerCase().includes(q)||String(item.source_url??"").toLowerCase().includes(q))
      &&(status==="전체"||item.status===status)&&(type==="전체"||item.item_type===type)&&(series==="전체"||item.series_name===series)
      &&(trackingFilter==="전체"||(trackingFilter==="운송장없음"&&!item.tracking_number)||(trackingFilter==="운송장있음"&&!!item.tracking_number))
      &&(!sameLinkOnly||(k&&(linkCounts.get(k)||0)>1)); });
    return [...rows].sort((a,b)=>{if(sort==="링크별 묶기"){const x=normalizedLink(a.source_url).localeCompare(normalizedLink(b.source_url)); if(x)return x; return Number(a.option_seq??9999)-Number(b.option_seq??9999)}
      if(sort==="옵션번호순")return Number(a.option_seq??9999)-Number(b.option_seq??9999);
      if(sort==="작품명순")return String(a.series_name||"").localeCompare(String(b.series_name||""),"ko");
      if(sort==="상품명순")return String(a.item_name||"").localeCompare(String(b.item_name||""),"ko");
      if(sort==="오래된순")return String(a.created_at||"").localeCompare(String(b.created_at||""));
      return String(b.created_at||"").localeCompare(String(a.created_at||""));});
  },[items,keyword,status,type,series,trackingFilter,sort,sameLinkOnly,linkCounts]);

  const updateItem=(id:string|number,field:keyof InventoryItem,value:string)=>setItems(prev=>prev.map(item=>item.id!==id?item:{...item,[field]:["quantity","yen_price","shipping_fee","domestic_shipping_fee","component_count","unit_sale_price","total_price","purchase_price","option_seq"].includes(String(field))?(value===""?null:Number(value)):value}));
  const saveItem=async(item:InventoryItem)=>{setMessage("");setSavingId(item.id);try{const res=await fetch(`/api/domestic-inventory/items/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)});const result=await res.json();if(!res.ok||!result.ok)throw new Error(result.message||"저장 실패");setMessage("저장 완료");}catch(e){const m=e instanceof Error?e.message:"저장 실패";setMessage(m);alert(m)}finally{setSavingId(null)}};
  const saveStatusImmediately=async(item:InventoryItem,nextStatus:string)=>{const n={...item,status:nextStatus};setItems(p=>p.map(x=>x.id===item.id?n:x));await saveItem(n)};
  const deleteItem=async(item:InventoryItem)=>{if(!confirm(`이 재고를 삭제할까?\n\n${item.item_name||""}`))return;setDeletingId(item.id);try{const r=await fetch(`/api/domestic-inventory/items/${item.id}`,{method:"DELETE"});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.message||"삭제 실패");setItems(p=>p.filter(x=>x.id!==item.id));setMessage("삭제 완료")}catch(e){alert(e instanceof Error?e.message:"삭제 실패")}finally{setDeletingId(null)}};

  return <main style={pageStyle}>
    <div style={topStyle}><div><h1 style={{margin:0}}>인벤토리</h1><p style={{color:"#6b7280"}}>재고 DB 조회 / 수정 / 옵션 정리</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/" style={linkStyle}>메인</Link><Link href="/domestic-inventory-input" style={primaryLinkStyle}>+ 재고입력</Link><Link href="/domestic-inventory-cards" style={linkStyle}>카드관리</Link></div></div>
    <section style={filterStyle}><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="상품명 / 주문번호 / 운송장 / 메모 / 소싱URL 검색" style={searchStyle}/>
      <select value={status} onChange={e=>setStatus(e.target.value)} style={selectStyle}>{statusList.map(v=><option key={v}>{v}</option>)}</select>
      <select value={series} onChange={e=>setSeries(e.target.value)} style={selectStyle}>{seriesList.map(v=><option key={v}>{v}</option>)}</select>
      <select value={type} onChange={e=>setType(e.target.value)} style={selectStyle}>{typeList.map(v=><option key={v}>{v}</option>)}</select>
      <select value={trackingFilter} onChange={e=>setTrackingFilter(e.target.value)} style={selectStyle}><option>전체</option><option>운송장없음</option><option>운송장있음</option></select>
      <select value={sort} onChange={e=>setSort(e.target.value)} style={selectStyle}><option>최신등록순</option><option>오래된순</option><option>링크별 묶기</option><option>옵션번호순</option><option>작품명순</option><option>상품명순</option></select>
      <button type="button" onClick={()=>{setSameLinkOnly(v=>!v);setSort("링크별 묶기")}} style={sameLinkOnly?activeGroupBtn:groupBtn}>{sameLinkOnly?"중복 링크만 보는 중":"같은 링크만 보기"}</button>
    </section>
    {message?<div style={messageStyle}>{message}</div>:null}
    <section style={listStyle}>{filtered.length===0?<div style={emptyStyle}>조건에 맞는 재고가 없습니다.</div>:filtered.map(item=>{const lk=normalizedLink(item.source_url);const cnt=lk?(linkCounts.get(lk)||0):0;return <article key={item.id} style={cardStyle}>
      <div style={imageWrapStyle}>{item.image_url?<img src={item.image_url} alt="" style={{...imgStyle,cursor:item.lineup_image_url?"zoom-in":"default"}} onDoubleClick={()=>item.lineup_image_url&&setLineupImage(item.lineup_image_url)}/>:<div style={emptyImgStyle}>IMG</div>}{item.lineup_image_url?<button type="button" onClick={()=>setLineupImage(item.lineup_image_url)} style={lineupMiniButtonStyle}>라인업</button>:null}</div>
      <div style={bodyStyle}><div style={badgeRowStyle}><span style={badgeStyle}>{item.series_name||"기타"}</span><span style={typeBadgeStyle}>{item.item_type||"기타"}</span><span style={statusBadgeStyle}>{item.status||"입고전"}</span><span style={currencyBadgeStyle}>{item.currency||"JPY"}</span>{cnt>1?<span style={duplicateBadgeStyle}>같은 링크 {cnt}개</span>:null}{item.internal_sku?<span style={skuBadgeStyle}>{item.internal_sku}</span>:null}</div>
      <label style={labelStyle}>상품명<textarea value={item.item_name??""} onChange={e=>updateItem(item.id,"item_name",e.target.value)} style={titleTextareaStyle}/></label>
      <div style={grid4Style}><FieldSelect label="작품명" value={item.series_name??"기타"} options={seriesList.filter(v=>v!=="전체")} onChange={v=>updateItem(item.id,"series_name",v)}/><FieldSelect label="타입" value={item.item_type??"기타"} options={typeList.filter(v=>v!=="전체")} onChange={v=>updateItem(item.id,"item_type",v)}/><FieldSelect label="상태" value={item.status??"입고전"} options={statusList.filter(v=>v!=="전체")} onChange={v=>saveStatusImmediately(item,v)}/><FieldInput label="옵션 번호" type="number" value={String(item.option_seq??"")} onChange={v=>updateItem(item.id,"option_seq",v)}/></div>
      <div style={grid4Style}><FieldInput label="수량" type="number" value={String(item.quantity??1)} onChange={v=>updateItem(item.id,"quantity",v)}/><FieldSelect label="통화" value={item.currency||"JPY"} options={currencyList} onChange={v=>updateItem(item.id,"currency",v)}/><FieldInput label={`구매가 (${item.currency||"JPY"})`} type="number" value={String(item.purchase_price??item.total_price??item.yen_price??0)} onChange={v=>updateItem(item.id,"purchase_price",v)}/><FieldInput label="박스당 팩 수" type="number" value={String(item.component_count??"")} onChange={v=>updateItem(item.id,"component_count",v)}/></div>
      <div style={grid4Style}><FieldInput label="개당판매가" type="number" value={String(item.unit_sale_price??"")} onChange={v=>updateItem(item.id,"unit_sale_price",v)}/><FieldInput label="현지내 배송비" type="number" value={String(item.domestic_shipping_fee??0)} onChange={v=>updateItem(item.id,"domestic_shipping_fee",v)}/><FieldInput label="주문번호" value={item.order_number??""} onChange={v=>updateItem(item.id,"order_number",v)}/><FieldInput label="운송장" value={item.tracking_number??""} onChange={v=>updateItem(item.id,"tracking_number",v)}/></div>
      <div style={grid2Style}><FieldInput label="대표 이미지 URL" value={item.image_url??""} onChange={v=>updateItem(item.id,"image_url",v)}/><FieldInput label="라인업 이미지 URL" value={item.lineup_image_url??""} onChange={v=>updateItem(item.id,"lineup_image_url",v)}/></div>
      <div style={grid2Style}><FieldInput label="소싱 URL" value={item.source_url??""} onChange={v=>updateItem(item.id,"source_url",v)}/><div style={sourceLinkBoxStyle}><span style={sourceLinkLabelStyle}>바로가기</span>{item.source_url?<a href={item.source_url} target="_blank" rel="noreferrer" style={sourceLinkStyle}>소싱 페이지 열기 ↗</a>:<span style={sourceLinkEmptyStyle}>소싱 URL 없음</span>}</div></div>
      <label style={labelStyle}>기타사항 / 등급 / 비율<textarea value={item.memo??""} onChange={e=>updateItem(item.id,"memo",e.target.value)} style={memoStyle}/></label>
      <div style={buttonRowStyle}><button type="button" onClick={()=>saveItem(item)} style={saveBtnStyle} disabled={savingId===item.id}>{savingId===item.id?"저장중":"저장"}</button><button type="button" onClick={()=>deleteItem(item)} style={deleteBtnStyle} disabled={deletingId===item.id}>{deletingId===item.id?"삭제중":"삭제"}</button></div></div></article>})}</section>
    {lineupImage?<div style={lineupModalBackdropStyle} onClick={()=>setLineupImage(null)}><div style={lineupModalContentStyle} onClick={e=>e.stopPropagation()}><button type="button" onClick={()=>setLineupImage(null)} style={lineupCloseButtonStyle}>×</button><img src={lineupImage} alt="라인업" style={lineupModalImageStyle}/></div></div>:null}
  </main>;
}
function FieldInput({label,value,onChange,type="text"}:{label:string;value:string;onChange:(v:string)=>void;type?:string}){return <label style={labelStyle}>{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)} style={inputStyle}/></label>}
function FieldSelect({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(v:string)=>void}){return <label style={labelStyle}>{label}<select value={value} onChange={e=>onChange(e.target.value)} style={inputStyle}>{options.map(v=><option key={v}>{v}</option>)}</select></label>}
const pageStyle:React.CSSProperties={padding:24,background:"#f9fafb",minHeight:"100vh"}; const topStyle:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:12,marginBottom:16,flexWrap:"wrap"};
const linkStyle:React.CSSProperties={height:38,padding:"0 12px",border:"1px solid #d1d5db",borderRadius:8,background:"#fff",color:"#111827",textDecoration:"none",display:"inline-flex",alignItems:"center",fontWeight:700}; const primaryLinkStyle={...linkStyle,border:"1px solid #111827",background:"#111827",color:"#fff"};
const filterStyle:React.CSSProperties={display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}; const searchStyle:React.CSSProperties={flex:1,minWidth:260,height:40,border:"1px solid #d1d5db",borderRadius:8,padding:"0 10px"}; const selectStyle:React.CSSProperties={height:40,border:"1px solid #d1d5db",borderRadius:8,padding:"0 10px",background:"#fff"};
const groupBtn:React.CSSProperties={...selectStyle,fontWeight:800,cursor:"pointer"}; const activeGroupBtn:React.CSSProperties={...groupBtn,background:"#111827",color:"#fff"}; const messageStyle:React.CSSProperties={padding:10,background:"#eef2ff",borderRadius:10,marginBottom:12,fontWeight:800};
const listStyle:React.CSSProperties={display:"flex",flexDirection:"column",gap:14}; const cardStyle:React.CSSProperties={display:"grid",gridTemplateColumns:"120px 1fr",gap:16,padding:16,background:"#fff",border:"1px solid #e5e7eb",borderRadius:16}; const imageWrapStyle:React.CSSProperties={width:120,minHeight:120,display:"flex",flexDirection:"column",gap:8}; const imgStyle:React.CSSProperties={width:120,height:120,objectFit:"cover",borderRadius:12,border:"1px solid #e5e7eb"}; const emptyImgStyle:React.CSSProperties={...imgStyle,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",color:"#9ca3af",fontWeight:800}; const lineupMiniButtonStyle:React.CSSProperties={width:120,height:32,border:"1px solid #d1d5db",borderRadius:8,background:"#fff",fontSize:12,fontWeight:800,cursor:"pointer"};
const bodyStyle:React.CSSProperties={display:"flex",flexDirection:"column",gap:10,minWidth:0}; const badgeRowStyle:React.CSSProperties={display:"flex",gap:6,flexWrap:"wrap"}; const badgeStyle:React.CSSProperties={padding:"4px 8px",borderRadius:999,background:"#eef2ff",fontSize:12,fontWeight:800}; const typeBadgeStyle={...badgeStyle,background:"#fef3c7"}; const statusBadgeStyle={...badgeStyle,background:"#fee2e2"}; const currencyBadgeStyle={...badgeStyle,background:"#dcfce7"}; const duplicateBadgeStyle={...badgeStyle,background:"#ffedd5",color:"#9a3412"}; const skuBadgeStyle={...badgeStyle,background:"#e0f2fe",color:"#075985"};
const labelStyle:React.CSSProperties={display:"flex",flexDirection:"column",gap:4,fontSize:12,fontWeight:800,minWidth:0}; const inputStyle:React.CSSProperties={width:"100%",minWidth:0,height:36,border:"1px solid #d1d5db",borderRadius:8,padding:"0 9px",background:"#fff",boxSizing:"border-box"}; const titleTextareaStyle:React.CSSProperties={width:"100%",minHeight:54,border:"1px solid #d1d5db",borderRadius:8,padding:9,resize:"vertical",boxSizing:"border-box"}; const memoStyle:React.CSSProperties={...titleTextareaStyle,minHeight:70}; const grid4Style:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:8}; const grid2Style:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:8};
const sourceLinkBoxStyle:React.CSSProperties={minHeight:56,padding:"6px 9px",border:"1px solid #d1d5db",borderRadius:8,display:"flex",flexDirection:"column",justifyContent:"center",gap:4,boxSizing:"border-box"}; const sourceLinkLabelStyle:React.CSSProperties={fontSize:12,fontWeight:800}; const sourceLinkStyle:React.CSSProperties={fontSize:13,fontWeight:800,color:"#2563eb",textDecoration:"none",wordBreak:"break-all"}; const sourceLinkEmptyStyle:React.CSSProperties={fontSize:13,color:"#9ca3af"};
const buttonRowStyle:React.CSSProperties={display:"flex",justifyContent:"flex-end",gap:8}; const saveBtnStyle:React.CSSProperties={height:38,padding:"0 18px",border:"none",borderRadius:8,background:"#111827",color:"#fff",fontWeight:900,cursor:"pointer"}; const deleteBtnStyle:React.CSSProperties={...saveBtnStyle,background:"#dc2626"}; const emptyStyle:React.CSSProperties={background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:32,textAlign:"center",color:"#6b7280"};
const lineupModalBackdropStyle:React.CSSProperties={position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.72)",overflowY:"auto",padding:"20px 12px 40px",cursor:"zoom-out"}; const lineupModalContentStyle:React.CSSProperties={position:"relative",width:"min(700px, 100%)",margin:"0 auto",cursor:"default"}; const lineupModalImageStyle:React.CSSProperties={display:"block",width:"100%",height:"auto",objectFit:"contain",borderRadius:12,background:"#fff"}; const lineupCloseButtonStyle:React.CSSProperties={position:"absolute",top:8,right:8,width:36,height:36,border:"none",borderRadius:999,background:"rgba(0,0,0,0.7)",color:"#fff",fontSize:24,lineHeight:"36px",cursor:"pointer"};
