import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime="nodejs";
type RawOrder={id:number;status?:number;deliveryCompany?:string|null;deliveryCode?:string|null;startAt?:string|null;updatedAt?:string|null;createdAt?:string|null;receiverName?:string|null;receiverPhoneNum?:string|null;postNum?:string|null;addr1?:string|null;addr2?:string|null;addr3?:string|null;user?:{nickname?:string|null};stocks?:Array<{id:number;name?:string;price?:number;thumbnail?:string|null}>};
function asText(v:unknown){return String(v??"").trim()}
function validDate(v:unknown){const s=asText(v);return s&&!Number.isNaN(Date.parse(s))?s:null}
function kst(v:string){return new Date(v).toLocaleString("sv-SE",{timeZone:"Asia/Seoul"}).slice(0,16)}
function key(v:string){return v.normalize("NFKC").split("(이전")[0].replace(/\s+/g,"").toLowerCase()}
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
  const {data:domestic,error:domesticError}=await db.from("domestic_order").select("order_id,customer_order_no,nickname,platform,order_status,phone,first_order_date,source_order_dates");
  if(domesticError) return NextResponse.json({error:"기존 주문 조회 실패",detail:domesticError.message},{status:500});
  const {data:queued,error:queueError}=await db.from("domestic_wise_import_queue").select("wise_order_id");
  if(queueError) return NextResponse.json({error:"와이스 신규 주문 대기열 테이블 조회 실패",detail:queueError.message,hint:"Supabase에서 20261012_wise_json_import_queue.sql 마이그레이션을 먼저 실행해야 합니다."},{status:500});
  const queuedIds=new Set((queued??[]).map(x=>Number(x.wise_order_id)));
  const domesticKeys=new Map<string,string[]>();
  const domesticOrderNos=new Map<string,string[]>();
  for(const d of domestic??[]){
   if(d.platform!=="wise")continue;
   for(const date of [...(Array.isArray(d.source_order_dates)?d.source_order_dates:[]),d.first_order_date]){
    const m=asText(date).match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
    if(m){const k=key(asText(d.nickname))+"|"+[m[1],m[2].padStart(2,"0"),m[3].padStart(2,"0")].join("-")+" "+m[4].padStart(2,"0")+":"+m[5];domesticKeys.set(k,[...(domesticKeys.get(k)??[]),String(d.order_id)]);}
   }
   const no=asText(d.customer_order_no);if(no)domesticOrderNos.set(no,[...(domesticOrderNos.get(no)??[]),String(d.order_id)]);
   for(const date of [] as string[]){
   }
  }
  const rows=orders.filter(x=>validDate(x.createdAt)).map(o=>{
   const date=validDate(o.createdAt)!;
   const nickname=asText(o.user?.nickname);
   const formatted=kst(date);
   const mmdd=formatted.slice(5,7)+formatted.slice(8,10);
   const customerNo="W"+key(nickname)+"_"+mmdd;
   const byDate=domesticKeys.get(key(nickname)+"|"+formatted)??[];
   const byNo=[...(domestic??[])].filter(d=>d.platform==="wise"&&key(asText(d.nickname))===key(nickname)&&asText(d.customer_order_no).replace(/-C\d+$/i,"").startsWith("W")&&asText(d.customer_order_no).includes("_"+mmdd)).map(d=>String(d.order_id));
   const exactId=(domestic??[]).filter(d=>String(d.order_id)==="WJSON_"+o.id).map(d=>String(d.order_id));
   const matched_order_ids=[...new Set([...exactId,...byDate])];
   const existingDomestic=matched_order_ids.length>0;
   return {order:o,wise_order_id:o.id,nickname,ordered_at:date,existingDomestic,matched_order_ids,alreadyQueued:queuedIds.has(o.id),items:o.stocks?.length??0};
  });
  // Existing ddoga orders: offer explicit, checked status updates only.
  const existingIds=(domestic??[]).filter(d=>d.platform==="wise").map(d=>String(d.order_id));
  const shippingRows:Array<{order_id:string;tracking_number:string|null;tracking_registered:boolean|null;shipping_status:string|null}>=[];
  for(const chunk of batches(existingIds,100)){
    const {data,error}=await db.from("domestic_shipping").select("order_id,tracking_number,tracking_registered,shipping_status").in("order_id",chunk);
    if(error)throw new Error("기존 배송정보 조회 실패: "+error.message);
    shippingRows.push(...(data??[]));
  }
  const shippingMap=new Map((shippingRows??[]).map(x=>[String(x.order_id),x]));
  const updateCandidates=rows.filter(x=>x.existingDomestic).map(x=>({order:x.order,matched_order_ids:x.matched_order_ids})).flatMap(({order,matched_order_ids})=>{
    // Never automatically alter ambiguous/combined matches.
    if(matched_order_ids.length!==1)return [];
    const order_id=matched_order_ids[0],ship=shippingMap.get(order_id);
    if(!ship)return [];
    const currentOrder=(domestic??[]).find(d=>String(d.order_id)===order_id);
    const tracking=asText(ship.tracking_number),direct=asText(order.deliveryCompany).toUpperCase()==="DIRECT";
    const changes:Record<string,string|boolean>={};
    const sourcePhone=asText(order.receiverPhoneNum);
    const phoneMatches=rows.filter(x=>x.matched_order_ids.length===1&&x.matched_order_ids[0]===order_id).map(x=>asText(x.order.receiverPhoneNum)).filter(Boolean);
    const uniquePhones=new Set(phoneMatches.map(x=>x.replace(/\\D/g,"")));
    if(sourcePhone&&/\\d/.test(sourcePhone)&&uniquePhones.size===1&&sourcePhone.replace(/\\D/g,"")!==asText(currentOrder?.phone).replace(/\\D/g,""))changes.phone=sourcePhone;
    if(direct&&Number(order.status)===25){if(!ship.tracking_registered)changes.tracking_registered=true;if(currentOrder?.order_status!=="kept")changes.order_status="kept";}
    if(!Object.keys(changes).length)return [];
    return [{wise_order_id:order.id,order_id,nickname:asText(order.user?.nickname),ordered_at:order.createdAt,wise_status:Number(order.status),delivery_company:order.deliveryCompany,tracking_number:tracking,current:{tracking_registered:ship.tracking_registered,shipping_status:ship.shipping_status,order_status:currentOrder?.order_status??null},changes}];
  });
  const uniqueUpdates=[...new Map(updateCandidates.map(x=>[x.wise_order_id,x])).values()];
  if(mode==="apply_updates"){
    const raw=asText(form.get("selected_ids"));
    const selected=JSON.parse(raw||"[]");
    if(!Array.isArray(selected)||!selected.every(Number.isSafeInteger))return NextResponse.json({error:"선택 ID 형식 오류"},{status:400});
    const allowed=new Set(selected);
    const results=[];
    for(const candidate of uniqueUpdates.filter(x=>allowed.has(x.wise_order_id))){
      const {order_id,changes}=candidate;
      const {order_status,phone,...shippingChanges}=changes;
      let failure="";
      if(order_status){
        const {error}=await db.from("domestic_order").update({order_status}).eq("order_id",order_id).eq("platform","wise");
        if(error)failure=error.message;
      }
      if(!failure&&phone){
        const {error}=await db.from("domestic_order").update({phone}).eq("order_id",order_id).eq("platform","wise");
        if(error)failure=error.message;
      }
      if(!failure&&Object.keys(shippingChanges).length){
        const {error}=await db.from("domestic_shipping").update(shippingChanges).eq("order_id",order_id);
        if(error)failure=error.message;
      }
      results.push({wise_order_id:candidate.wise_order_id,order_id,ok:!failure,error:failure||null});
    }
    return NextResponse.json({ok:true,results,updated:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length});
  }
  if(mode==="preview")return NextResponse.json({ok:true,total:rows.length,excluded_count:parsed.length-orders.length,new_orders:rows.filter(x=>!x.existingDomestic&&!x.alreadyQueued).map(({order,...x})=>x),possible_existing:rows.filter(x=>x.existingDomestic).map(({order,...x})=>x),already_queued:rows.filter(x=>x.alreadyQueued).length,update_candidates:uniqueUpdates,queued_orders:rows.filter(x=>x.alreadyQueued).map(({order,...x})=>x),notice:"닉네임+주문 분 단위 날짜로 기존 주문을 추정합니다. 동일 분 주문은 검토가 필요합니다."});
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
