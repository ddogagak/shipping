import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime="nodejs";
type RawOrder={id:number;status?:number;deliveryCompany?:string|null;deliveryCode?:string|null;startAt?:string|null;updatedAt?:string|null;createdAt?:string|null;receiverName?:string|null;receiverPhoneNum?:string|null;postNum?:string|null;addr1?:string|null;addr2?:string|null;addr3?:string|null;user?:{nickname?:string|null};stocks?:Array<{id:number;name?:string;price?:number;thumbnail?:string|null}>};
function asText(v:unknown){return String(v??"").trim()}
function validDate(v:unknown){const s=asText(v);return s&&!Number.isNaN(Date.parse(s))?s:null}
function kst(v:string){return new Date(v).toLocaleString("sv-SE",{timeZone:"Asia/Seoul"}).slice(0,16)}
function key(v:string){return v.normalize("NFKC").split("(이전")[0].replace(/\s+/g,"").toLowerCase()}
function domesticDateKey(v:unknown){
 const s=asText(v);
 if(!s)return "";
 // UTC/offset ISO strings use timezone conversion; historic DDOGA display dates are KST local.
 if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)&&validDate(s))return kst(s);
 const m=s.match(/^(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*(?:\/|T|\s)+\s*(\d{1,2}):(\d{1,2})/);
 return m?[m[1],m[2].padStart(2,"0"),m[3].padStart(2,"0")].join("-")+" "+m[4].padStart(2,"0")+":"+m[5]:"";
}
function phoneDigits(v:unknown){return asText(v).replace(/\D/g,"")}
function orderNumberKey(v:unknown){return key(asText(v).replace(/-C\d+$/i,""))}
// Diagnostic metadata only: never return raw phone values from unfamiliar source keys.
function phoneKeyStats(orders:RawOrder[]){
 const stats=new Map<string,{present:number;withDigits:number}>();
 function walk(o:unknown,prefix:string,depth:number,seen:Set<string>){
  if(!o||typeof o!=="object"||Array.isArray(o)||depth>2)return;
  for(const [k,v] of Object.entries(o)){
   const path=prefix?prefix+"."+k:k;
   if(/phone|mobile|telephone|contact|telnum/i.test(k)&&!seen.has(path)){
    seen.add(path);
    const current=stats.get(path)??{present:0,withDigits:0};
    current.present++;
    if(typeof v==="string"||typeof v==="number"){
     if(phoneDigits(v).length>=8)current.withDigits++;
    }
    stats.set(path,current);
   }
   if(depth<2&&v&&typeof v==="object"&&!Array.isArray(v))walk(v,path,depth+1,seen);
  }
 }
 for(const o of orders)walk(o,"",0,new Set());
 return [...stats].map(([field,value])=>({field,...value})).sort((a,b)=>b.withDigits-a.withDigits||b.present-a.present).slice(0,12);
}
function batches<T>(a:T[],n=200){const out:T[][]=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out}
export async function POST(req:Request){
 try{
  const form=await req.formData();
  const file=form.get("file");
  const mode=asText(form.get("mode"));
  if(!(file instanceof File)||file.size>15_000_000) return NextResponse.json({error:"15MB 이하 JSON 파일 필요"},{status:400});
  const parsed=JSON.parse(await file.text());
  if(!Array.isArray(parsed)||!parsed.every(x=>x&&Number.isSafeInteger(x.id)&&Array.isArray(x.stocks)))return NextResponse.json({error:"와이스 주문 배열 형식이 아닙니다."},{status:400});
  const orders=(parsed as RawOrder[]).filter(o=>[10,16,25].includes(Number(o.status)));
  const db=createServiceRoleClient();
  if(mode==="sales_sync"){
   const importedAt=new Date().toISOString();
   const salesOrders=(parsed as RawOrder[]).filter(o=>validDate(o.createdAt));
   const salesRows=salesOrders.flatMap(o=>(o.stocks??[]).filter(s=>Number.isSafeInteger(s.id)).map(s=>({
    wise_stock_id:s.id,
    wise_order_id:o.id,
    buyer_nickname:asText(o.user?.nickname),
    ordered_at:validDate(o.createdAt)!,
    item_name:asText(s.name),
    item_price:Number.isFinite(Number(s.price??0))?Number(s.price??0):0,
    image_url:s.thumbnail??null,
    imported_at:importedAt
   })));
   for(const chunk of batches(salesRows)){
    const {error}=await db.from("domestic_wise_item_photo").upsert(chunk,{onConflict:"wise_stock_id"});
    if(error)throw new Error("와이스 매출 자료 저장 실패: "+error.message);
   }
   return NextResponse.json({ok:true,sales_saved_orders:salesOrders.length,sales_saved_items:salesRows.length,imported_at:importedAt});
  }
  // Page through all orders; otherwise Supabase's default row cap hides older phone-only changes.
  const domestic:Array<{order_id:string;customer_order_no:string|null;nickname:string|null;platform:string|null;order_status:string|null;phone:string|null;first_order_date:string|null;source_order_dates:string[]|null}>=[];
  for(let offset=0;;offset+=500){
   const {data,error}=await db.from("domestic_order").select("order_id,customer_order_no,nickname,platform,order_status,phone,first_order_date,source_order_dates").order("order_id").range(offset,offset+499);
   if(error)return NextResponse.json({error:"기존 주문 조회 실패",detail:error.message},{status:500});
   domestic.push(...(data??[]));
   if((data??[]).length<500)break;
  }
  const queuedIds=new Set<number>();
  for(let offset=0;;offset+=500){
   const {data,error}=await db.from("domestic_wise_import_queue").select("wise_order_id").order("wise_order_id").range(offset,offset+499);
   if(error)return NextResponse.json({error:"와이스 신규 주문 대기열 테이블 조회 실패",detail:error.message,hint:"Supabase에서 20261012_wise_json_import_queue.sql 마이그레이션을 먼저 실행해야 합니다."},{status:500});
   for(const row of data??[])queuedIds.add(Number(row.wise_order_id));
   if((data??[]).length<500)break;
  }
  const domesticKeys=new Map<string,string[]>();
  const wiseDomestic=domestic.filter(d=>d.platform==="wise");
  const domesticById=new Map(wiseDomestic.map(d=>[String(d.order_id),d]));
  const domesticByOrderNo=new Map<string,string[]>();
  for(const d of wiseDomestic){
   for(const date of [...(Array.isArray(d.source_order_dates)?d.source_order_dates:[]),d.first_order_date]){
    const dateKey=domesticDateKey(date);
    if(!dateKey)continue;
    const k=key(asText(d.nickname))+"|"+dateKey;
    const ids=domesticKeys.get(k)??[];
    if(!ids.includes(String(d.order_id)))ids.push(String(d.order_id));
    domesticKeys.set(k,ids);
   }
   // Match the DDOGA customer order number, not only nickname + minute.
   const orderNo=orderNumberKey(d.customer_order_no);
   if(orderNo){
    const ids=domesticByOrderNo.get(orderNo)??[];
    if(!ids.includes(String(d.order_id)))ids.push(String(d.order_id));
    domesticByOrderNo.set(orderNo,ids);
   }
  }
  // Phone-only changes are checked for every Wise status, independently of shipping state.
  const allRows=(parsed as RawOrder[]).filter(x=>validDate(x.createdAt)).map(o=>{
   const date=validDate(o.createdAt)!;
   const nickname=asText(o.user?.nickname);
   const formatted=kst(date);
   const mmdd=formatted.slice(5,7)+formatted.slice(8,10);
   const ddogaOrderNo="W"+key(nickname)+"_"+mmdd;
   const dateDigits=formatted.replace(/\D/g,"");
   const exactIds=wiseDomestic.filter(d=>String(d.order_id)==="WJSON_"+o.id || orderNumberKey(d.order_id)===orderNumberKey(ddogaOrderNo+"__"+dateDigits) || asText(d.customer_order_no)===String(o.id)).map(d=>String(d.order_id));
   const byDate=domesticKeys.get(key(nickname)+"|"+formatted)??[];
   const byOrderNo=(domesticByOrderNo.get(orderNumberKey(ddogaOrderNo))??[]).filter(id=>{
    const d=domesticById.get(id);
    if(!d)return false;
    const dates=[...(Array.isArray(d.source_order_dates)?d.source_order_dates:[]),d.first_order_date].map(domesticDateKey).filter(Boolean);
    return !dates.length || dates.some(value=>value.slice(0,4)===formatted.slice(0,4));
   });
   const matched_order_ids=[...new Set(exactIds.length?exactIds:[...byDate,...byOrderNo])];
   const existingDomestic=matched_order_ids.length>0;
   return {order:o,wise_order_id:o.id,nickname,ordered_at:date,existingDomestic,matched_order_ids,alreadyQueued:queuedIds.has(o.id),items:o.stocks?.length??0};
  });
  const rows=allRows.filter(x=>[10,16,25].includes(Number(x.order.status)));
  // Only DDOGA orders still open (neither order completed nor delivered).
  const completedShipping=new Set<string>();
  for(const chunk of batches(wiseDomestic.map(d=>String(d.order_id)),100)){
    const {data,error}=await db.from("domestic_shipping").select("order_id,shipping_status").in("order_id",chunk);
    if(error)throw new Error("배송상태 조회 실패: "+error.message);
    for(const row of data??[]){
      if(asText(row.shipping_status)==="done")completedShipping.add(String(row.order_id));
    }
  }
  const byNicknameAll=new Map<string,typeof wiseDomestic>();
  for(const d of wiseDomestic){
    const k=key(asText(d.nickname));if(!k)continue;
    byNicknameAll.set(k,[...(byNicknameAll.get(k)??[]),d]);
  }
  const byNickname=new Map<string,typeof wiseDomestic>();
  for(const d of wiseDomestic){
    if(asText(d.order_status)==="done"||completedShipping.has(String(d.order_id)))continue;
    const k=key(asText(d.nickname));if(!k)continue;
    byNickname.set(k,[...(byNickname.get(k)??[]),d]);
  }
  // Nickname alone determines eligible pairs. Only a real, nonempty phone difference is shown.
  const uniqueUpdates=(parsed as RawOrder[]).flatMap(order=>{
    const nickname=asText(order.user?.nickname);
    const sourcePhone=asText(order.receiverPhoneNum);
    if(!key(nickname)||phoneDigits(sourcePhone).length<8)return [];
    return (byNickname.get(key(nickname))??[]).flatMap(d=>{
      const existingPhone=asText(d.phone);
      if(phoneDigits(sourcePhone)===phoneDigits(existingPhone))return [];
      const changes:Record<string,string>={phone:sourcePhone};
      return [{candidate_id:String(order.id)+"::"+d.order_id,wise_order_id:order.id,order_id:String(d.order_id),nickname,ordered_at:order.createdAt??null,wise_status:Number(order.status),delivery_company:order.deliveryCompany??null,tracking_number:null,current:{tracking_registered:null,shipping_status:null,order_status:d.order_status??null,phone:d.phone??null},changes}];
    });
  });
  const rawOrders=parsed as RawOrder[];
  const sourceWithPhone=rawOrders.filter(o=>phoneDigits(o.receiverPhoneNum).length>=8);
  const nicknameMatched=rawOrders.filter(o=>key(asText(o.user?.nickname))&&byNicknameAll.has(key(asText(o.user?.nickname))));
  const openNicknameMatched=rawOrders.filter(o=>key(asText(o.user?.nickname))&&byNickname.has(key(asText(o.user?.nickname))));
  const missingPhoneInOpenMatched=openNicknameMatched.filter(o=>phoneDigits(o.receiverPhoneNum).length<8);
  const samePhonePairs=openNicknameMatched.reduce((sum,o)=>{
   const digits=phoneDigits(o.receiverPhoneNum);
   return sum+(digits.length>=8?(byNickname.get(key(asText(o.user?.nickname)))??[]).filter(d=>phoneDigits(d.phone)===digits).length:0);
  },0);
  const phoneDiagnostics={
    wise_orders:rawOrders.length,
    wise_with_nickname:rawOrders.filter(o=>Boolean(key(asText(o.user?.nickname)))).length,
    wise_source_phone_available:sourceWithPhone.length,
    wise_receiver_phone_field_present:rawOrders.filter(o=>Object.prototype.hasOwnProperty.call(o,"receiverPhoneNum")).length,
    ddoga_wise_orders:wiseDomestic.length,
    ddoga_open_orders:wiseDomestic.filter(d=>asText(d.order_status)!=="done"&&!completedShipping.has(String(d.order_id))).length,
    nickname_matched_source_orders:nicknameMatched.length,
    open_nickname_matched_source_orders:openNicknameMatched.length,
    open_matched_source_missing_phone:missingPhoneInOpenMatched.length,
    same_phone_pairs:samePhonePairs,
    phone_changed_candidates:uniqueUpdates.length,
    possible_phone_fields:phoneKeyStats(rawOrders),
    missing_phone_examples:[...new Set(missingPhoneInOpenMatched.map(o=>asText(o.user?.nickname)).filter(Boolean))].slice(0,8)
  };
  if(mode==="apply_updates"){
    const chosen:unknown=JSON.parse(asText(form.get("selected_ids"))||"[]");
    if(!Array.isArray(chosen)||chosen.length>200||!chosen.every(x=>typeof x==="string"))
      return NextResponse.json({error:"최대 200개 항목 선택 가능"},{status:400});
    const candidates=uniqueUpdates.filter(c=>chosen.includes(c.candidate_id));
    if(candidates.length!==chosen.length)return NextResponse.json({error:"선택된 항목 불일치: 미리보기 재실행 필요"},{status:409});
    if(new Set(candidates.map(c=>c.order_id)).size!==candidates.length)
      return NextResponse.json({error:"같은 DDOGA 주문이 여러 번 선택됐어. 주문당 한 건만 선택해 줘."},{status:400});
    const results=[];
    for(const c of candidates){
      let error="",changed=false;
      if(c.changes.phone){
        const {data,error:e}=await db.from("domestic_order").update({phone:c.changes.phone}).eq("order_id",c.order_id).eq("platform","wise").select("order_id");
        if(e)error=e.message;
        else if(!data?.length)error="대상 주문 없음";
        else changed=true;
      }
      results.push({candidate_id:c.candidate_id,wise_order_id:c.wise_order_id,order_id:c.order_id,ok:!error,changed,error:error||null});
    }
    return NextResponse.json({ok:true,results,updated:results.filter(x=>x.changed).length,unchanged:results.filter(x=>x.ok&&!x.changed).length,failed:results.filter(x=>!x.ok).length});
  }
  if(mode==="preview")return NextResponse.json({ok:true,total:rows.length,phone_sync_stats:{source_with_phone:allRows.filter(x=>/\d/.test(asText(x.order.receiverPhoneNum))).length,matched_with_phone:allRows.filter(x=>x.existingDomestic&&/\d/.test(asText(x.order.receiverPhoneNum))).length,phone_change_candidates:uniqueUpdates.filter(x=>"phone" in x.changes).length,nickname_matched_candidates:uniqueUpdates.length,unmatched_with_phone:allRows.filter(x=>!x.existingDomestic&&/\d/.test(asText(x.order.receiverPhoneNum))).length},excluded_count:parsed.length-orders.length,new_orders:rows.filter(x=>!x.existingDomestic&&!x.alreadyQueued).map(({order,...x})=>x),possible_existing:rows.filter(x=>x.existingDomestic).map(({order,...x})=>x),already_queued:rows.filter(x=>x.alreadyQueued).length,update_candidates:uniqueUpdates,phone_diagnostics:phoneDiagnostics,queued_orders:rows.filter(x=>x.alreadyQueued).map(({order,...x})=>x),notice:"닉네임이 같고, DDOGA 주문·배송이 미완료이고, 와이스 전화번호가 실제로 달라진 주문만 표시합니다. 선택한 항목의 전화번호만 변경합니다."});
  if(mode!=="save")return NextResponse.json({error:"Invalid mode"},{status:400});
  // Keep a financial snapshot for every order in the Wise export, including completed statuses.
  const importedAt=new Date().toISOString();
  const salesRows=(parsed as RawOrder[]).filter(o=>validDate(o.createdAt)).map(o=>({
   wise_order_id:o.id,
   buyer_nickname:asText(o.user?.nickname),
   ordered_at:validDate(o.createdAt)!,
   wise_status:Number.isSafeInteger(o.status)?o.status:null,
   item_names:(o.stocks??[]).map(s=>asText(s.name)).filter(Boolean),
   total_amount:(o.stocks??[]).reduce((sum,s)=>{const n=Number(s.price??0);return sum+(Number.isFinite(n)?n:0)},0),
   item_count:o.stocks?.length??0,
   raw_data:{stocks:(o.stocks??[]).map(s=>({id:s.id,name:asText(s.name),price:Number(s.price??0)}))},
   imported_at:importedAt
  }));
  for(const chunk of batches(salesRows)){
   const {error}=await db.from("domestic_wise_sales_order").upsert(chunk,{onConflict:"wise_order_id"});
   if(error)throw new Error("와이스 매출 스냅샷 저장 실패: "+error.message);
  }
  // Never alter existing domestic orders or shipping. Refresh WYYYES-only snapshots and item metadata.
  for(const chunk of batches(orders)){
   const snapshots=chunk.map(o=>({wise_order_id:o.id,wise_status:o.status??null,wise_delivery_company:o.deliveryCompany??null,wise_delivery_code:o.deliveryCode??null,wise_start_at:validDate(o.startAt),wise_updated_at:validDate(o.updatedAt),snapshot_imported_at:new Date().toISOString()}));
   const {error}=await db.from("domestic_wise_order_snapshot").upsert(snapshots,{onConflict:"wise_order_id"});
   if(error)throw new Error("와이스 배송 스냅샷 저장 실패: "+error.message);
  }
  const photoRows=orders.flatMap(o=>(o.stocks??[]).filter(s=>Number.isSafeInteger(s.id)).map(s=>({wise_stock_id:s.id,wise_order_id:o.id,buyer_nickname:asText(o.user?.nickname),ordered_at:validDate(o.createdAt)??new Date().toISOString(),item_name:asText(s.name),item_price:Number(s.price??0),image_url:s.thumbnail??null})));
  for(const chunk of batches(photoRows)){const {error}=await db.from("domestic_wise_item_photo").upsert(chunk,{onConflict:"wise_stock_id"});if(error)throw new Error("와이스 상품정보 저장 실패: "+error.message)}
  const selectedRaw=asText(form.get("selected_ids"));
  const selectedIds=selectedRaw?JSON.parse(selectedRaw):null;
  if(selectedIds!==null&&(!Array.isArray(selectedIds)||selectedIds.length>40||!selectedIds.every(Number.isSafeInteger)||new Set(selectedIds).size!==selectedIds.length))
   return NextResponse.json({error:"선택 주문 ID 형식 오류"},{status:400});
  const allowedIds=selectedIds===null?null:new Set<number>(selectedIds);
  const fresh=rows.filter(x=>!x.existingDomestic&&!x.alreadyQueued&&(allowedIds===null||allowedIds.has(x.wise_order_id)));
  for(const chunk of batches(fresh)){
   const payload=chunk.map(({order:o,ordered_at,nickname})=>({wise_order_id:o.id,buyer_nickname:nickname,ordered_at,receiver_name:o.receiverName??null,receiver_phone:o.receiverPhoneNum??null,postal_code:o.postNum??null,address:[o.addr1,o.addr2,o.addr3].filter(Boolean).join(" "),item_summary:(o.stocks??[]).map(s=>asText(s.name)).join(" / "),item_total_price:(o.stocks??[]).reduce((sum,s)=>sum+Number(s.price??0),0),item_count:o.stocks?.length??0}));
   const {error}=await db.from("domestic_wise_import_queue").upsert(payload,{onConflict:"wise_order_id",ignoreDuplicates:true});if(error)throw error;
  }
  return NextResponse.json({ok:true,queued_new:fresh.length,sales_saved:salesRows.length,updated_snapshots:orders.length,updated_items:photoRows.length,excluded_count:parsed.length-orders.length,skipped_existing:rows.filter(x=>x.existingDomestic).length,skipped_queued:rows.filter(x=>x.alreadyQueued).length});
 }catch(e){
  console.error("Wise JSON import failed:",e);
  const err=e as {message?:string;details?:string;hint?:string;code?:string}|null;
  return NextResponse.json({error:err?.message||String(e)||"Import failed",detail:err?.details,code:err?.code,hint:err?.hint},{status:500});
 }
}
