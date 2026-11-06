"use client";

import Link from "next/link";
import { DEFAULT_PRICING_SETTINGS } from "@/lib/pricing";
import { useEffect,useMemo,useState,type CSSProperties } from "react";
const seriesList=["전체","헌터헌터","귀멸의칼날","나의히어로아카데미아","프리렌","진격의거인","치이카와","약사의혼잣말","나루토","기타"];
const typeList=["전체","아크릴","지류","뱃지","피규어","키링","기타"];
const input:CSSProperties={height:36,border:"1px solid #d1d5db",borderRadius:7,padding:"0 9px",boxSizing:"border-box",background:"#fff"};
function won(v:any){const n=Number(v||0);return Number.isFinite(n)&&n!==0?Math.round(n).toLocaleString("ko-KR")+"원":"-";}
function pricing(item:any){
 const count=Math.max(0,Math.trunc(Number(item.component_count||0)));
 const boxCost=Number(item.box_cost_price||0);
 const targetProfit=boxCost>0?Math.max(DEFAULT_PRICING_SETTINGS.minimumProfit,boxCost*DEFAULT_PRICING_SETTINGS.targetProfitRate):0;
 // Domestic (KRW) retains its existing recommendation formula.
 const minimumMarginPrice=boxCost>0?(item.actual_purchase_currency==="KRW"?Math.ceil(boxCost/.69):Math.ceil((boxCost+targetProfit)/DEFAULT_PRICING_SETTINGS.salesRetentionRate)):0;
 return{count,unitCost:count>0?Math.ceil(boxCost/count):0,unitSale:count>0?Math.ceil(minimumMarginPrice/count):0,minimumMarginPrice,targetProfit};
}
function OverseasPricingGuide({boxCost,count,basicBoxPrice}:{boxCost:number;count:number;basicBoxPrice:number}){
 const retention=DEFAULT_PRICING_SETTINGS.salesRetentionRate;
 if(!Number.isFinite(boxCost)||boxCost<=0||count<=0||retention<=0)return null;
 const guides=[
  {label:"0%마진",unit:Math.ceil(boxCost/retention/count),featured:false},
  {label:"기본권장판매가",unit:Math.ceil(basicBoxPrice/count),featured:true},
  {label:"순수익률 15%",unit:retention>0.15?Math.ceil(boxCost/(retention-0.15)/count):null,featured:false},
  {label:"순수익률 20%",unit:retention>0.2?Math.ceil(boxCost/(retention-0.2)/count):null,featured:false},
 ];
 return <div style={{...priceGuide,marginTop:8}}>
  {guides.map(({label,unit,featured})=><div key={label} style={{minWidth:0,padding:"7px 2px",borderRadius:7,background:featured?"#eff6ff":"#f8fafc",border:featured?"1px solid #2563eb":"1px solid #e5e7eb",textAlign:"center",display:"flex",flexDirection:"column",justifyContent:"space-between",gap:5}}>
   <span style={{fontSize:9,color:"#64748b",fontWeight:700,lineHeight:1.2,minHeight:22,display:"flex",alignItems:"center",justifyContent:"center",wordBreak:"keep-all"}}>{label}</span>
   <b style={{fontSize:14,fontWeight:900,letterSpacing:"-0.5px",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",color:featured?"#1d4ed8":"#111827"}}>{unit===null?"-":unit.toLocaleString("ko-KR")+"원"}</b>
  </div>)}
 </div>;
}
function CompactPurchaseValue({label,value,onDoubleClick}:{label:string;value:string;onDoubleClick?:()=>void}){
 return <span style={{display:"flex",alignItems:"baseline",gap:3,minWidth:0,whiteSpace:"nowrap"}}>
  <small style={{fontSize:8,color:"#047857",fontWeight:700,flexShrink:0}}>{label}</small>
  <b onDoubleClick={onDoubleClick} title={onDoubleClick?"더블클릭해서 수정":undefined} style={{fontSize:13,fontWeight:800,letterSpacing:"-0.35px",fontVariantNumeric:"tabular-nums",cursor:onDoubleClick?"pointer":"default",textDecoration:onDoubleClick?"underline":"none",textDecorationStyle:"dotted"}}>{value}</b>
 </span>;
}

export default function SaleInventoryPage(){
 const[items,setItems]=useState<any[]>([]),[q,setQ]=useState(""),[series,setSeries]=useState("전체"),[type,setType]=useState("전체"),[stock,setStock]=useState("전체"),[lineup,setLineup]=useState<string|null>(null),[memoPopup,setMemoPopup]=useState<{title:string;content:string}|null>(null),[msg,setMsg]=useState(""),[saving,setSaving]=useState<string|null>(null);
 async function load(){const r=await fetch("/api/sale-inventory",{cache:"no-store"});const j=await r.json();if(r.ok)setItems((j.items||[]).map((item:any)=>({...item,original_image_url:item.image_url})));else setMsg(j.message||"조회 실패");}useEffect(()=>{void load();},[]);useEffect(()=>{if(!msg)return;const timer=window.setTimeout(()=>setMsg(""),3000);return()=>window.clearTimeout(timer);},[msg]);
 const filtered=useMemo(()=>items.filter(i=>{const text=[i.display_name,i.product_name,i.option_text,i.order_number,i.memo,i.public_comment,i.internal_sku].filter(Boolean).join(" ").toLowerCase();return(!q||text.includes(q.toLowerCase()))&&(series==="전체"||i.series_name===series)&&(type==="전체"||i.item_type===type)&&(stock==="전체"||i.view_status===(stock==="표시"?"display":stock==="숨김"?"hidden":"completed"));}),[items,q,series,type,stock]);
 function edit(id:string,key:string,value:any){setItems(p=>p.map(i=>{if(i.id!==id)return i;const next={...i,[key]:value};if(key==="purchase_quantity"||key==="sold_quantity")next.remaining_quantity=Math.max(0,Number(next.purchase_quantity||0)-Number(next.sold_quantity||0));return next;}));}
 const[priceDrafts,setPriceDrafts]=useState<Record<string,string>>({}),[priceSaving,setPriceSaving]=useState<string|null>(null);
 const[priceMessages,setPriceMessages]=useState<Record<string,string>>({});

 const[editingPriceId,setEditingPriceId]=useState<string|null>(null);
 const[editMode,setEditMode]=useState<"price"|"box">("price");
 const[boxDraft,setBoxDraft]=useState({quantity:"1",component:"1"});
 function beginPriceEdit(item:any){
  if(priceSaving!==null||saving!==null)return;
  setEditingPriceId(item.id);setEditMode("price");
  setPriceDrafts(prev=>({...prev,[item.id]:String(item.actual_purchase_unit_price??"")}));
  setBoxDraft({quantity:String(item.purchase_quantity??1),component:String(item.component_count||1)});
  setPriceMessages(prev=>({...prev,[item.id]:""}));
 }
 function cancelPriceEdit(id:string){
  if(priceSaving!==null)return;
  setEditingPriceId(null);
  setPriceDrafts(prev=>{const next={...prev};delete next[id];return next});
 }
 async function correctPrice(item:any){
  const raw=(priceDrafts[item.id]??"").trim().replace(/,/g,"");
  const value=Number(raw);
  const newQuantity=Number(boxDraft.quantity),newComponent=Number(boxDraft.component);
  const expectedQuantity=Number(item.purchase_record_quantity??0),expectedReceived=Number(item.purchase_record_received_quantity??0),expectedComponent=Number(item.purchase_record_component_count??0);
  const oldPrice=Number(item.actual_purchase_unit_price??0);
  if(!raw||!Number.isFinite(value)||value<=0){setPriceMessages(prev=>({...prev,[item.id]:"0보다 큰 매입가를 입력해줘."}));return;}
  const oldTotal=oldPrice*Number(item.purchase_quantity??0);
  const nextTotal=value*newQuantity;
  if(editMode==="box"){
   if(!Number.isSafeInteger(newQuantity)||newQuantity<1||!Number.isSafeInteger(newComponent)||newComponent<1){
    setPriceMessages(prev=>({...prev,[item.id]:"박스 수량과 박스당 구성은 1 이상의 정수로 입력해줘."}));return;
   }

  }
  if(!window.confirm(editMode==="box"?
   "방송판매재고 박스 단위 수정\\n"+Number(item.purchase_quantity||0)+"박스 × "+Number(item.component_count||0)+"개 → "+newQuantity+"박스 × "+newComponent+"개\\n박스 매입가 "+oldPrice.toLocaleString("ko-KR")+" → "+value.toLocaleString("ko-KR")+" "+item.actual_purchase_currency+"\\n총매입 "+oldTotal.toLocaleString("ko-KR")+" → "+nextTotal.toLocaleString("ko-KR")+"\\n매입관리 원본은 유지하고 방송판매재고만 수정해. 저장할까?":
   "박스 매입가만 "+oldPrice.toLocaleString("ko-KR")+" → "+value.toLocaleString("ko-KR")+" "+item.actual_purchase_currency+"로 변경할까?\\n수량과 구성은 그대로이고 방송판매재고의 원가만 수정돼. 매입관리 원본은 유지해."))return;
  setPriceSaving(item.id);
  setPriceMessages(prev=>({...prev,[item.id]:"방송판매재고 수정 중…"}));
  try{
   const response=await fetch("/api/sale-inventory",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    action:"reconcile_purchase_box_units",purchase_item_id:item.id,mode:editMode,
    expected:{unit_price:oldPrice,quantity:expectedQuantity,received_quantity:expectedReceived,component_count:expectedComponent},
    next:{unit_price:value,quantity:newQuantity,component_count:newComponent},
    confirmed_old_component:expectedComponent
   })});
   const result=await response.json();
   if(!response.ok)throw new Error(result.message||"수정 실패");
   setEditingPriceId(null);
   setPriceDrafts(prev=>{const next={...prev};delete next[item.id];return next});
   setPriceMessages(prev=>({...prev,[item.id]:editMode==="box"?"방송판매재고 박스 수정 완료":"방송판매재고 원가 수정 완료"}));
   await load();
  }catch(e){setPriceMessages(prev=>({...prev,[item.id]:e instanceof Error?e.message:"수정 실패"}));}
  finally{setPriceSaving(null)}
 }
 async function fillPrice(item:any):Promise<number|null>{
  const raw=(priceDrafts[item.id]??"").trim().replace(/,/g,"");
  const value=/^\d+(\.\d+)?$/.test(raw)?Number(raw):NaN;
  if(!Number.isFinite(value)||value<=0){setPriceMessages(p=>({...p,[item.id]:"0보다 큰 실제 매입가를 입력해 주세요."}));return null;}
  if(!confirm(`박스 1개 실제 매입가를 ${value.toLocaleString("ko-KR")} ${item.actual_purchase_currency}로 저장할까요? 매입관리 원본은 변경되지 않아.`))return null;
  setPriceSaving(item.id);setMsg("");setPriceMessages(p=>({...p,[item.id]:"매입가 저장 중…"}));
  try{
   const r=await fetch("/api/sale-inventory",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"fill_missing_purchase_price",purchase_item_id:item.id,unit_price:value})});
   const j=await r.json();if(!r.ok)throw new Error(j.message||"매입가 저장 실패");
   const saved=Number(j.unit_price),currency=item.actual_purchase_currency;
   const cost=currency==="KRW"?Math.round(saved):Math.round(saved*({JPY:10,CNY:230,KRW:1}[currency as "JPY"|"CNY"|"KRW"]??230)*1.2+5000);
   setItems(prev=>prev.map(i=>i.id===item.id?{...i,actual_purchase_unit_price:saved,can_fill_purchase_price:false,box_cost_price:cost}:i));
   setPriceDrafts(prev=>{const next={...prev};delete next[item.id];return next});setMsg("방송판매재고 원가 저장 완료. 매입관리 원본은 그대로야.");setPriceMessages(p=>({...p,[item.id]:`매입가 ${saved.toLocaleString("ko-KR")} ${currency} 저장 완료`}));return saved;
  }catch(e){const message="매입가 저장 실패: "+(e instanceof Error?e.message:"알 수 없는 오류");setMsg(message);setPriceMessages(p=>({...p,[item.id]:message}));return null;}finally{setPriceSaving(null)}
 }
 async function save(item:any){setSaving(item.id);setMsg("");try{if(item.can_fill_purchase_price&&(priceDrafts[item.id]??"").trim()){const saved=await fillPrice(item);if(saved===null)return;item={...item,actual_purchase_unit_price:saved,can_fill_purchase_price:false};}const r=await fetch("/api/sale-inventory",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({purchase_item_id:item.id,sourcing_inventory_id:item.sourcing_inventory_id,product_name:item.product_name,option_text:item.option_text,display_name:item.display_name,component_count:item.component_count,...(item.image_url!==item.original_image_url?{image_url:item.image_url}:{}),actual_purchase_unit_price:item.actual_purchase_unit_price,actual_purchase_currency:item.actual_purchase_currency,sale_price:item.sale_price,purchase_quantity:item.purchase_quantity,sold_quantity:item.sold_quantity,view_status:item.pending_view_status??item.view_status,sale_memo:item.sale_memo,public_comment:item.public_comment,sold_out_at:item.sold_out_at})});const j=await r.json();if(!r.ok)throw new Error(j.message||"저장 실패");setItems(p=>p.map(i=>i.id===item.id?{...i,...j.item,image_url:item.image_url,original_image_url:item.image_url,pending_view_status:undefined}:i));setMsg("저장했어.");}catch(e){setMsg(e instanceof Error?e.message:"저장 실패");}finally{setSaving(null);}}
 return <main style={page}><header style={top}><div><h1 style={{margin:0}}>방송 판매재고</h1><p style={sub}>입고완료 상품 · 실제 매입가 기준 원가/판매가 · 라인업 · 판매수익 확인</p></div><div style={{display:"flex",gap:8}}><Link href="/" style={button}>메인</Link><button type="button" style={button} disabled={saving!==null} onClick={async()=>{try{const r=await fetch("/api/sale-inventory/restore-images",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.message||"복구 미리보기 실패");const n=j.counts;if(!window.confirm(`SKU 원본 이미지 복구\n변경 대상: ${n.will_restore}건\nSKU 없음 (유지): ${n.unnumbered_untouched}건\n원본 미확인 (유지): ${n.unmatched_untouched}건\n\n복구 전 이미지와 연결은 DB에 기록돼. 진행할까?`))return;setSaving("restore-all");const post=await fetch("/api/sale-inventory/restore-images",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:"RESTORE_SKU_IMAGES"})});const result=await post.json();if(!post.ok)throw new Error(result.message||"복구 실패");await load();setMsg(`관리번호 원본 이미지 ${result.restored}건 복구됨. 번호 없는 재고는 유지했어.`);}catch(e){setMsg(e instanceof Error?e.message:"복구 오류");}finally{setSaving(null);}}}>SKU 이미지 복구</button><Link href="/purchases" style={button}>매입관리</Link></div></header><nav style={statusTabs}>{["전체","표시","숨김","완료"].map(tabName=><button key={tabName} onClick={()=>setStock(tabName)} style={{...statusTab,...(stock===tabName?activeStatusTab:{})}}>{tabName}<b>{tabName==="전체"?items.length:items.filter(i=>i.view_status===(tabName==="표시"?"display":tabName==="숨김"?"hidden":"completed")).length}</b></button>)}</nav><section style={filters}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="상품명 / 옵션 / 주문번호 / 관리코드 / 기타사항 검색" style={{...input,flex:"1 1 300px"}}/><select value={series} onChange={e=>setSeries(e.target.value)} style={input}>{seriesList.map(x=><option key={x}>{x}</option>)}</select><select value={type} onChange={e=>setType(e.target.value)} style={input}>{typeList.map(x=><option key={x}>{x}</option>)}</select><b>{filtered.length}개</b></section>{msg&&<div style={notice}>{msg}</div>}<section style={grid}>{filtered.map(i=>{const p=pricing(i),actual=Number(i.sale_price||0),boxProfit=actual>0&&p.count>0?actual*p.count*DEFAULT_PRICING_SETTINGS.salesRetentionRate-Number(i.box_cost_price||0):0,unitProfit=actual>0?actual*DEFAULT_PRICING_SETTINGS.salesRetentionRate-p.unitCost:0;return <article key={i.id} style={{...card,opacity:i.view_status==="completed"?.58:1,borderColor:i.view_status==="hidden"?"#f59e0b":"#e5e7eb"}}><div style={imageWrap}>{i.image_url?<img src={i.image_url} alt="" style={image}/>:<div style={noImage}>NO IMAGE</div>}<span style={badge}>재고 {Number(i.remaining_quantity||0)}박스</span></div><div style={body}><div style={imageEdit}><label>대표 이미지 URL</label><input value={i.image_url||""} onChange={e=>edit(i.id,"image_url",e.target.value)} placeholder="https://..." style={{...input,width:"100%",fontSize:10}}/></div><div style={tags}>{i.series_name&&<span style={tag}>{i.series_name}</span>}{i.item_type&&<span style={tag}>{i.item_type}</span>}<span style={i.internal_sku?codeTag:emptyCodeTag}>{i.internal_sku||"[-]"}</span></div><label style={fieldLabel}>제목<input value={i.display_name||""} onChange={e=>edit(i.id,"display_name",e.target.value)} style={{...input,width:"100%",fontSize:14,fontWeight:800}}/></label><div style={option}>{i.option_text||""}</div><div style={{...profitBox,marginTop:10}}><label style={editableMetric}><small style={metricLabel}>박스당 구성품 수</small><input type="number" min={0} value={i.component_count||""} onChange={e=>edit(i.id,"component_count",Number(e.target.value))} placeholder="개" style={miniInput}/></label><label style={editableMetric}><small style={metricLabel}>판매가격</small><input type="number" min={0} value={i.sale_price??""} onChange={e=>edit(i.id,"sale_price",e.target.value)} placeholder="원" style={miniInput}/></label></div>{i.actual_purchase_currency==="KRW"&&<div style={{...formula,color:"#047857"}}>국내 추천가: 매입가 ÷ 0.69 · 수수료 6% + 부가세 10% 차감 후 판매가 대비 수익률 15% · 원 단위 올림</div>}{["JPY","CNY"].includes(String(i.actual_purchase_currency||"").toUpperCase())?<OverseasPricingGuide boxCost={Number(i.box_cost_price||0)} count={p.count} basicBoxPrice={p.minimumMarginPrice}/>:<div style={priceGuide}><Metric label="비용포함원가" value={won(i.box_cost_price)}/><Metric label="비용포함개당원가" value={won(p.unitCost)}/><Metric label="기본권장 박스가격" value={won(p.minimumMarginPrice)}/><Metric label="기본권장 판매가" value={won(p.unitSale)} strong/></div>}<div style={actualCost}>{["JPY","CNY"].includes(String(i.actual_purchase_currency||"").toUpperCase())?
 <div style={{display:"grid",gap:6}}>
  <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",columnGap:5}}>
   <CompactPurchaseValue label="박스매입가" value={Number(i.actual_purchase_unit_price||0).toLocaleString("ko-KR")+" "+i.actual_purchase_currency} onDoubleClick={()=>beginPriceEdit(i)}/>
   <CompactPurchaseValue label="개당매입가" value={Number(i.actual_purchase_unit_price)>0&&p.count>0?(Number(i.actual_purchase_unit_price)/p.count).toLocaleString("ko-KR",{maximumFractionDigits:2})+(i.actual_purchase_currency==="JPY"?"엔":"위안"):"-"}/>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",columnGap:5}}>
   <CompactPurchaseValue label="비용포함원가" value={won(i.box_cost_price)}/>
   <CompactPurchaseValue label="비용포함개당원가" value={won(p.unitCost)}/>
  </div>
 </div>:
 <>박스 매입가 <b onDoubleClick={()=>beginPriceEdit(i)} title="더블클릭해서 박스 1개 매입가 수정" style={{cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{Number(i.actual_purchase_unit_price||0).toLocaleString("ko-KR")} {i.actual_purchase_currency}</b> / 박스 1개 기준 <small style={{color:"#64748b"}}>(금액 더블클릭 수정)</small></>}{editingPriceId===i.id&&<div style={{marginTop:9,padding:11,border:"1px solid #cbd5e1",borderRadius:8,background:"#f8fafc"}}>
 <div style={{display:"flex",gap:7,marginBottom:10}}>
  <button type="button" style={{...button,background:editMode==="price"?"#dbeafe":"#fff"}} onClick={()=>setEditMode("price")}>판매재고 원가만 수정</button>
  <button type="button" style={{...button,background:editMode==="box"?"#dbeafe":"#fff"}} onClick={()=>{setEditMode("box");setBoxDraft({quantity:String(i.purchase_quantity??1),component:String(i.component_count||1)})}}>박스 단위 수정</button>
 </div>
 {editMode==="box"&&<div style={{fontSize:12,lineHeight:1.7,marginBottom:8}}>
  <div>방송판매재고 현재 값: <b>{i.purchase_quantity??0}박스</b> × <b>{i.component_count||0}개입</b></div>
  <div>현재 방송판매재고 원가 합계 <b>{(Number(i.actual_purchase_unit_price||0)*Number(i.purchase_quantity||0)).toLocaleString("ko-KR")} {i.actual_purchase_currency}</b></div>
  <div style={{display:"flex",gap:8,marginTop:7,flexWrap:"wrap"}}>
   <label>변경 박스 수<input aria-label="변경할 박스 수량" type="number" min="1" step="1" style={{...input,width:115,display:"block"}} value={boxDraft.quantity} onChange={e=>{const n=Number(e.target.value);setBoxDraft(prev=>({...prev,quantity:e.target.value}));if(Number.isSafeInteger(n)&&n>0)setPriceDrafts(prev=>({...prev,[i.id]:String(Number(i.actual_purchase_unit_price||0)*Number(i.purchase_quantity||0)/n)}));}}/></label>
   <label>박스당 구성 수<input aria-label="변경할 박스당 낱개 수" type="number" min="1" step="1" style={{...input,width:115,display:"block"}} value={boxDraft.component} onChange={e=>setBoxDraft(prev=>({...prev,component:e.target.value}))}/></label>
  </div>
  <div style={{fontSize:11,color:"#64748b",marginTop:6}}>박스 구성과 수량은 방송판매재고에서만 변경해. 매입관리의 수량·원가는 유지돼.</div>
 </div>}
 <label style={{display:"block",fontSize:12,fontWeight:700}}>박스 매입가 ({i.actual_purchase_currency})
  <input autoFocus aria-label="수정할 박스 매입가" type="number" min="0.01" step="any" value={priceDrafts[i.id]??""} onChange={e=>setPriceDrafts(prev=>({...prev,[i.id]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")void correctPrice(i);if(e.key==="Escape")cancelPriceEdit(i.id)}} disabled={priceSaving!==null} style={{...input,width:"100%",marginTop:5}}/>
 </label>
 {editMode==="box"&&<div style={{fontSize:12,marginTop:7}}>수정 후 총매입: <b>{(Number(priceDrafts[i.id]||0)*Number(boxDraft.quantity||0)).toLocaleString("ko-KR")} {i.actual_purchase_currency}</b> · 매입관리 원본은 그대로 유지돼</div>}
 {priceMessages[i.id]&&<div style={{fontSize:12,color:"#b91c1c",marginTop:7}}>{priceMessages[i.id]}</div>}
 <div style={{display:"flex",gap:6,marginTop:9}}><button type="button" style={button} disabled={priceSaving!==null} onClick={()=>void correctPrice(i)}>{priceSaving===i.id?"저장 중…":"수정 저장"}</button><button type="button" style={button} disabled={priceSaving!==null} onClick={()=>cancelPriceEdit(i.id)}>취소</button></div>
 </div>}{i.can_fill_purchase_price&&editingPriceId!==i.id&&<div style={{marginTop:8}}><label>박스 매입가 입력 ({i.actual_purchase_currency} / 박스 1개)<input aria-label="누락 실제 매입가" type="text" inputMode="decimal" value={priceDrafts[i.id]??""} disabled={priceSaving!==null||saving!==null} onChange={e=>setPriceDrafts(v=>({...v,[i.id]:e.target.value}))} placeholder="매입가 입력" style={{...input,width:"100%",marginTop:4}}/></label><button type="button" style={{...button,marginTop:6}} disabled={priceSaving!==null||saving!==null||!priceDrafts[i.id]} onClick={()=>void fillPrice(i)}>{priceSaving===i.id?"매입가 저장 중…":"누락 매입가 저장"}</button><div style={{marginTop:4}}>방송판매재고에만 저장 · 저장 후에도 금액 더블클릭으로 수정 가능</div></div>}{priceMessages[i.id]&&<div role="status" style={{marginTop:6,fontWeight:700}}>{priceMessages[i.id]}</div>}</div><div style={profitBox}><Metric label={<>박스<br/>판매수익</>} value={actual&&p.count?won(boxProfit):'-'} strong/><Metric label={<>개당<br/>판매수익</>} value={actual?won(unitProfit):'-'} strong/></div><div style={numbers}><label>입고 박스<input type="number" min={0} value={i.purchase_quantity} onChange={e=>edit(i.id,"purchase_quantity",Number(e.target.value))} style={{...input,width:"100%"}}/></label><label>판매 박스<input type="number" min={0} value={i.sold_quantity} onChange={e=>edit(i.id,"sold_quantity",Number(e.target.value))} style={{...input,width:"100%"}}/></label></div><textarea value={i.sale_memo||""} onChange={e=>edit(i.id,"sale_memo",e.target.value)} placeholder="판매 메모" style={memo}/><label style={{display:"block",marginTop:8,fontSize:11,fontWeight:700}}>빵.store 공개 댓글<input type="text" value={i.public_comment||""} maxLength={100} onChange={e=>edit(i.id,"public_comment",e.target.value)} placeholder="빵.store에서 보일 한 줄 댓글" style={{...input,width:"100%",marginTop:4}}/></label><div style={actionRow}><div style={{display:"flex",alignItems:"center",gap:5}}>{i.product_url&&<a href={i.product_url} target="_blank" rel="noreferrer" style={urlButton}>URL</a>}{i.memo&&<button type="button" style={button} title="기타사항 보기" onClick={()=>setMemoPopup({title:String(i.display_name||i.product_name||"상품"),content:String(i.memo)})}>📝 기타사항</button>}</div><div style={visibilityButtons}>{[["hidden","숨김"],["display","표시"],["completed","완료"]].map(([value,label])=><button key={value} onClick={()=>edit(i.id,"pending_view_status",value)} disabled={saving===i.id} style={{...visibilityButton,...((i.pending_view_status??i.view_status)===value?activeVisibilityButton:{})}}>{label}</button>)}</div><div style={rightActions}>{i.lineup_image_url&&<button style={button} onClick={()=>setLineup(i.lineup_image_url)}>라인업 보기</button>}<button style={button} onClick={()=>void save(i)} disabled={saving!==null||priceSaving!==null}>{saving===i.id?"저장 중…":"저장"}</button></div></div></div></article>})}</section>{lineup&&<div style={backdrop} onClick={()=>setLineup(null)}><div style={modal} onClick={e=>e.stopPropagation()}><button style={button} onClick={()=>setLineup(null)}>닫기</button><div style={{overflow:"auto",textAlign:"center"}}><img src={lineup} alt="라인업" style={{maxWidth:"100%",height:"auto"}}/></div></div></div>}{memoPopup&&<div style={backdrop} onClick={()=>setMemoPopup(null)} role="presentation"><div role="dialog" aria-modal="true" aria-label="기타사항" style={{...modal,width:"min(520px,92vw)",maxHeight:"80vh",overflow:"hidden",gap:12}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><strong style={{fontSize:16}}>📝 기타사항</strong><button type="button" style={button} onClick={()=>setMemoPopup(null)}>닫기</button></div><div style={{color:"#64748b",fontSize:12,fontWeight:700}}>{memoPopup.title}</div><div style={{overflowY:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:1.7,fontSize:13,background:"#f8fafc",borderRadius:8,padding:12}}>{memoPopup.content}</div></div></div>}</main>;
}
function Metric({label,value,strong=false}:{label:React.ReactNode,value:string,strong?:boolean}){return <div style={metric}><small style={metricLabel}>{label}</small><b style={{fontSize:strong?15:13}}>{value}</b></div>}
const page:CSSProperties={maxWidth:1500,margin:"0 auto",padding:"28px 22px 50px",background:"#f7f8fa",minHeight:"100vh",color:"#171717"},top:CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap",marginBottom:16},sub:CSSProperties={margin:"6px 0 0",color:"#6b7280",fontSize:14},button:CSSProperties={display:"inline-flex",alignItems:"center",justifyContent:"center",height:34,padding:"0 10px",border:"1px solid #d1d5db",borderRadius:7,background:"#fff",color:"#27272a",fontSize:12,fontWeight:700,textDecoration:"none",cursor:"pointer"},urlButton:CSSProperties={...button,borderColor:"#93c5fd",color:"#1d4ed8"},statusTabs:CSSProperties={display:"flex",gap:7,marginBottom:12,padding:8,background:"#fff",border:"1px solid #e5e7eb",borderRadius:10},statusTab:CSSProperties={...button,gap:7,minWidth:74},activeStatusTab:CSSProperties={background:"#111827",borderColor:"#111827",color:"#fff"},visibilityButtons:CSSProperties={display:"flex",gap:3},visibilityButton:CSSProperties={...button,height:30,padding:"0 7px",fontSize:10},activeVisibilityButton:CSSProperties={background:"#0047ff",borderColor:"#0047ff",color:"#fff"},danger:CSSProperties={...button,borderColor:"#ef4444",color:"#b91c1c"},filters:CSSProperties={display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",padding:12,background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,marginBottom:14},notice:CSSProperties={position:"fixed",left:"50%",bottom:20,transform:"translateX(-50%)",zIndex:2000,width:"min(420px,calc(100vw - 28px))",boxSizing:"border-box",padding:"11px 14px",background:"#111827",color:"#fff",border:"1px solid #374151",borderRadius:9,boxShadow:"0 8px 24px rgba(0,0,0,.24)",fontSize:13,fontWeight:700,textAlign:"center"},grid:CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14},card:CSSProperties={background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,overflow:"hidden"},imageWrap:CSSProperties={position:"relative",aspectRatio:"1 / 1",background:"#f4f4f5"},image:CSSProperties={width:"100%",height:"100%",objectFit:"contain"},noImage:CSSProperties={height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#aaa"},badge:CSSProperties={position:"absolute",top:9,left:9,background:"rgba(17,24,39,.9)",color:"#fff",borderRadius:6,padding:"5px 8px",fontSize:11,fontWeight:800},body:CSSProperties={padding:13},imageEdit:CSSProperties={display:"grid",gap:4,marginBottom:8,fontSize:10,fontWeight:700,color:"#6b7280"},tags:CSSProperties={display:"flex",gap:5,flexWrap:"wrap"},tag:CSSProperties={padding:"3px 6px",borderRadius:5,background:"#f4f4f5",fontSize:10,fontWeight:700},codeTag:CSSProperties={...tag,background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace"},emptyCodeTag:CSSProperties={...tag,background:"#fff7ed",color:"#9a3412",border:"1px dashed #fdba74",fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace"},fieldLabel:CSSProperties={display:"grid",gap:4,fontSize:10,fontWeight:700,color:"#6b7280",marginTop:8},option:CSSProperties={fontSize:11,color:"#71717a",minHeight:24,marginTop:5},inventoryMemo:CSSProperties={marginTop:8,padding:8,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,fontSize:11,lineHeight:1.45,whiteSpace:"pre-wrap"},boxInfo:CSSProperties={display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginTop:10},priceGuide:CSSProperties={display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginTop:7},metric:CSSProperties={minWidth:0,padding:"8px 5px",background:"#f8fafc",border:"1px solid #edf0f2",borderRadius:8,textAlign:"center",display:"flex",flexDirection:"column",justifyContent:"space-between",gap:5},editableMetric:CSSProperties={...metric,fontWeight:700},metricLabel:CSSProperties={fontSize:10,lineHeight:1.15,color:"#6b7280",fontWeight:700},miniInput:CSSProperties={width:"100%",height:26,border:"1px solid #d1d5db",borderRadius:5,textAlign:"center",boxSizing:"border-box",fontWeight:800},actualCost:CSSProperties={fontSize:11,color:"#111827",marginTop:8,padding:"7px 8px",background:"#ecfdf5",borderRadius:7},sourceCost:CSSProperties={fontSize:9,color:"#9ca3af",marginTop:5},saleInput:CSSProperties={marginTop:10,padding:10,background:"#f8fafc",borderRadius:8,fontSize:11,fontWeight:800},profitBox:CSSProperties={display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginTop:7},formula:CSSProperties={fontSize:9,lineHeight:1.45,color:"#9ca3af",marginTop:5},numbers:CSSProperties={display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginTop:9,fontSize:10,fontWeight:700},memo:CSSProperties={width:"100%",minHeight:55,boxSizing:"border-box",marginTop:8,padding:8,border:"1px solid #d1d5db",borderRadius:7,resize:"vertical"},actionRow:CSSProperties={display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:8},rightActions:CSSProperties={display:"flex",gap:6,justifyContent:"flex-end",flexWrap:"wrap"},backdrop:CSSProperties={position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:20},modal:CSSProperties={width:"min(950px,95vw)",maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",gap:8,background:"#fff",padding:12,borderRadius:12};