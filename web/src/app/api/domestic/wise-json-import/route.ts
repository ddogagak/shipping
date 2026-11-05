import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime="nodejs";
type RawOrder={id:number;status?:number;deliveryCompany?:string|null;deliveryCode?:string|null;startAt?:string|null;updatedAt?:string|null;createdAt?:string|null;receiverName?:string|null;receiverPhoneNum?:string|null;receiverphonenum?:string|null;virtualPhoneNum?:string|null;virtualphonenum?:string|null;postNum?:string|null;addr1?:string|null;addr2?:string|null;addr3?:string|null;user?:{nickname?:string|null};stocks?:Array<{id:number;name?:string;price?:number;thumbnail?:string|null;soldAt?:string|null;videoId?:string|null}>};
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
function validPhone(v:unknown){return phoneDigits(v).length>=8}
function wisePhone(o:RawOrder){
 const sources=[o.receiverPhoneNum,o.receiverphonenum,o.virtualPhoneNum,o.virtualphonenum];
 return asText(sources.find(validPhone));
}
function orderNumberKey(v:unknown){return key(asText(v).replace(/-C\d+$/i,""))}
function batches<T>(a:T[],n=200){const out:T[][]=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out}
// A list-only Wise JSON omits soldAt/videoId. Never erase already-synced item metadata.
async function upsertWisePhotosPreservingTimes(db:ReturnType<typeof createServiceRoleClient>,rows:Array<{wise_stock_id:number;sold_at:string|null;video_id:string|null;[key:string]:unknown}>,errorPrefix:string){
 for(const chunk of batches(rows)){
  const ids=chunk.map(row=>row.wise_stock_id);
  const {data:existing,error:readError}=await db.from("domestic_wise_item_photo").select("wise_stock_id,sold_at,video_id").in("wise_stock_id",ids);
  if(readError)throw new Error(errorPrefix+": 기존 상품정보 조회 실패: "+readError.message);
  const oldById=new Map((existing??[]).map(row=>[Number(row.wise_stock_id),row]));
  const safeRows=chunk.map(row=>{
   const old=oldById.get(row.wise_stock_id);
   return {...row,sold_at:row.sold_at??old?.sold_at??null,video_id:row.video_id??old?.video_id??null};
  });
  const {error}=await db.from("domestic_wise_item_photo").upsert(safeRows,{onConflict:"wise_stock_id"});
  if(error)throw new Error(errorPrefix+": "+error.message);
 }
}
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
    sold_at:validDate(s.soldAt),
    video_id:asText(s.videoId)||null,
    item_name:asText(s.name),
    item_price:Number.isFinite(Number(s.price??0))?Number(s.price??0):0,
    image_url:s.thumbnail??null,
    imported_at:importedAt
   })));
   await upsertWisePhotosPreservingTimes(db,salesRows,"와이스 매출 자료 저장 실패");
   return NextResponse.json({ok:true,sales_saved_orders:salesOrders.length,sales_saved_items:salesRows.length,sold_at_count:salesRows.filter(row=>row.sold_at).length,missing_sold_at_count:salesRows.filter(row=>!row.sold_at).length,imported_at:importedAt});
  }
  // Page through all orders; otherwise Supabase's default row cap hides older phone-only changes.
  const domestic:Array<{order_id:string;customer_order_no:string|null;nickname:string|null;platform:string|null;order_status:string|null;phone:string|null;first_order_date:string|null;source_order_dates:string[]|null;item_total_price:number|null;item_summary:string|null;order_count:number|null}>=[];
  for(let offset=0;;offset+=500){
   const {data,error}=await db.from("domestic_order").select("order_id,customer_order_no,nickname,platform,order_status,phone,first_order_date,source_order_dates,item_total_price,item_summary,order_count").order("order_id").range(offset,offset+499);
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
  const byNickname=new Map<string,typeof wiseDomestic>();
  for(const d of wiseDomestic){
    if(asText(d.order_status)==="done"||completedShipping.has(String(d.order_id)))continue;
    const k=key(asText(d.nickname));if(!k)continue;
    byNickname.set(k,[...(byNickname.get(k)??[]),d]);
  }
  // One selectable phone update per nickname, not one per Wise order (combined orders
  // otherwise create duplicate update selections for the same DDOGA order).
  const wiseByNickname=new Map<string,RawOrder>();
  const sourceSortTime=(o:RawOrder)=>Date.parse(asText(o.updatedAt))||Date.parse(asText(o.createdAt))||0;
  for(const order of parsed as RawOrder[]){
    const nicknameKey=key(asText(order.user?.nickname));
    if(!nicknameKey||!wisePhone(order))continue;
    const previous=wiseByNickname.get(nicknameKey);
    if(!previous||sourceSortTime(order)>sourceSortTime(previous)||
      (sourceSortTime(order)===sourceSortTime(previous)&&order.id>previous.id)){
      wiseByNickname.set(nicknameKey,order);
    }
  }
  const uniqueUpdates=[...wiseByNickname].flatMap(([nicknameKey,order])=>{
    const targets=(byNickname.get(nicknameKey)??[]).filter(d=>!phoneDigits(d.phone));
    if(!targets.length)return [];
    const sourcePhone=wisePhone(order);
    return [{
      candidate_id:"nickname:"+nicknameKey,
      wise_order_id:order.id,
      order_id:String(targets[0].order_id),
      order_ids:targets.map(d=>String(d.order_id)),
      target_count:targets.length,
      nickname:asText(targets[0].nickname),
      ordered_at:order.createdAt??null,
      wise_status:Number(order.status),
      delivery_company:order.deliveryCompany??null,
      tracking_number:null,
      current:{tracking_registered:null,shipping_status:null,order_status:targets[0].order_status??null,phone:targets[0].phone??null},
      changes:{phone:sourcePhone}
    }];
  });
  if(mode==="apply_updates"){
    const chosen:unknown=JSON.parse(asText(form.get("selected_ids"))||"[]");
    if(!Array.isArray(chosen)||chosen.length>200||!chosen.every(x=>typeof x==="string")||new Set(chosen).size!==chosen.length)
      return NextResponse.json({error:"선택 ID 형식 오류"},{status:400});
    const candidates=uniqueUpdates.filter(c=>chosen.includes(c.candidate_id));
    if(candidates.length!==chosen.length)return NextResponse.json({error:"선택 대상을 찾지 못했어. 미리보기를 다시 실행해 줘."},{status:409});
    const results=[];
    for(const c of candidates){
      let error="";
      const expected=phoneDigits(c.changes.phone);
      const ids=c.order_ids;
      const {data:current,error:lookupError}=await db.from("domestic_order")
        .select("order_id,nickname,platform,order_status,phone")
        .in("order_id",ids);
      if(lookupError)error="주문 재조회 실패: "+lookupError.message;
      else if(!current||current.length!==ids.length||
        current.some(d=>d.platform!=="wise"||key(asText(d.nickname))!==key(c.nickname)))
        error="닉네임이 일치하는 기존 DDOGA 주문을 정확히 찾지 못했어.";
      else if(current.some(d=>asText(d.order_status)==="done"||Boolean(phoneDigits(d.phone))))
        error="선택한 주문 중 완료 상태이거나 이미 전화번호가 있는 주문이 있어. 미리보기를 다시 실행해 줘.";
      if(!error){
        const {data:shipping,error:shippingError}=await db.from("domestic_shipping")
          .select("order_id,shipping_status").in("order_id",ids);
        if(shippingError)error="배송상태 재확인 실패: "+shippingError.message;
        else if((shipping??[]).some(d=>asText(d.shipping_status)==="done"))
          error="배송완료된 주문이 있어. 미리보기를 다시 실행해 줘.";
      }
      if(!error){
        // The match uses nickname, while IDs address the actual retained DDOGA rows
        // (including combined-shipping orders). Only the phone column is modified.
        const {data:written,error:writeError}=await db.from("domestic_order")
          .update({phone:c.changes.phone}).in("order_id",ids).eq("platform","wise")
          .select("order_id,phone");
        if(writeError)error="전화번호 저장 실패: "+writeError.message;
        else if((written??[]).length!==ids.length)error="저장된 주문 수가 예상과 달라.";
        else if((written??[]).some(d=>phoneDigits(d.phone)!==expected))
          error="저장 결과의 전화번호가 요청값과 일치하지 않아.";
      }
      if(!error){
        const {data:verified,error:verifyError}=await db.from("domestic_order")
          .select("order_id,phone").in("order_id",ids);
        if(verifyError)error="저장 후 검증 실패: "+verifyError.message;
        else if((verified??[]).length!==ids.length||
          (verified??[]).some(d=>phoneDigits(d.phone)!==expected))
          error="저장 후 DB 전화번호가 일치하지 않아.";
      }
      results.push({
        candidate_id:c.candidate_id,wise_order_id:c.wise_order_id,order_id:c.order_id,
        order_ids:ids,nickname:c.nickname,ok:!error,changed:!error,
        error:error||null
      });
    }
    return NextResponse.json({ok:true,results,
      updated:results.filter(x=>x.changed).length,
      updated_orders:results.filter(x=>x.changed).reduce((n,x)=>n+x.order_ids.length,0),
      failed:results.filter(x=>!x.ok).length
    });
  }
  if(mode==="preview")return NextResponse.json({ok:true,total:rows.length,excluded_count:parsed.length-orders.length,new_orders:rows.filter(x=>!x.existingDomestic&&!x.alreadyQueued).map(({order,...x})=>x),possible_existing:rows.filter(x=>x.existingDomestic).map(({order,...x})=>x),already_queued:rows.filter(x=>x.alreadyQueued).length,update_candidates:uniqueUpdates,queued_orders:rows.filter(x=>x.alreadyQueued).map(({order,...x})=>x),notice:"닉네임별 전화번호 추가 후보만 한 번씩 표시합니다. 선택하면 해당 닉네임의 미완료 DDOGA 주문 중 번호가 빈 주문에만 저장합니다."});
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
  // Recover missing Wise order-ID links after a nickname change. Never infer from
  // nickname/address alone: exact KST minute, total amount, and ordered item names
  // must match a single unlinked DDOGA order and a single unlinked Wise order.
  // Combined orders (order_count !== 1) and orders with existing links are excluded.
  const linkedWiseIds=new Set<number>();
  const linkedDomesticIds=new Set<string>();
  for(const chunk of batches(salesRows.map(row=>row.wise_order_id))){
   const {data:links,error}=await db.from("domestic_wise_order_link")
    .select("wise_order_id,domestic_order_id").in("wise_order_id",chunk);
   if(error)throw new Error("와이스 기존 연결 조회 실패: "+error.message);
   for(const link of links??[]){
    linkedWiseIds.add(Number(link.wise_order_id));
    linkedDomesticIds.add(String(link.domestic_order_id));
   }
  }
  for(const chunk of batches(wiseDomestic.map(row=>String(row.order_id)))){
   const {data:links,error}=await db.from("domestic_wise_order_link")
    .select("wise_order_id,domestic_order_id").in("domestic_order_id",chunk);
   if(error)throw new Error("DDOGA 기존 연결 조회 실패: "+error.message);
   for(const link of links??[]){
    linkedWiseIds.add(Number(link.wise_order_id));
    linkedDomesticIds.add(String(link.domestic_order_id));
   }
  }
  const signature=(minute:string,amount:number,items:string[])=>JSON.stringify([
   minute,amount,items.map(name=>name.normalize("NFKC").trim())
  ]);
  const candidates=new Map<string,string[]>();
  for(const row of wiseDomestic){
   if(linkedDomesticIds.has(String(row.order_id))||Number(row.order_count)!==1)continue;
   const minute=domesticDateKey(row.first_order_date);
   const summary=asText(row.item_summary);
   const amount=Number(row.item_total_price);
   if(!minute||!summary||!Number.isFinite(amount)||amount<=0)continue;
   const k=signature(minute,amount,summary.split(/\s*\/\s*/));
   candidates.set(k,[...(candidates.get(k)??[]),String(row.order_id)]);
  }
  const wiseCandidates=new Map<string,typeof salesRows>();
  for(const row of salesRows){
   if(linkedWiseIds.has(row.wise_order_id)||!row.item_names.length||row.total_amount<=0)continue;
   const minute=domesticDateKey(row.ordered_at);
   if(!minute)continue;
   const k=signature(minute,row.total_amount,row.item_names);
   wiseCandidates.set(k,[...(wiseCandidates.get(k)??[]),row]);
  }
  let recoveredLinks=0;
  for(const [signatureKey,wiseRows] of wiseCandidates){
   const matchingOrders=candidates.get(signatureKey)??[];
   if(wiseRows.length!==1||matchingOrders.length!==1)continue;
   const wiseRow=wiseRows[0], domesticId=matchingOrders[0];
   const {data:existing,error:checkError}=await db.from("domestic_wise_order_link")
    .select("wise_order_id,domestic_order_id").or(
     `wise_order_id.eq.${wiseRow.wise_order_id},domestic_order_id.eq.${domesticId}`
    );
   if(checkError)throw new Error("와이스 자동연결 충돌 조회 실패: "+checkError.message);
   if(existing?.length)continue;
   const {error:insertError}=await db.from("domestic_wise_order_link")
    .insert({wise_order_id:wiseRow.wise_order_id,domestic_order_id:domesticId});
   if(insertError)throw new Error("와이스 자동연결 저장 실패: "+insertError.message);
   linkedWiseIds.add(wiseRow.wise_order_id);
   linkedDomesticIds.add(domesticId);
   recoveredLinks++;
  }
  // Keep the displayed domestic nickname in sync for orders with explicit Wise ID links.
  // Shipping, item summaries, and historical order numbers remain unchanged.
  const importedIds=salesRows.map(x=>x.wise_order_id);
  const touchedDomesticIds=new Set<string>();
  for(const chunk of batches(importedIds)){
   const {data:links,error:linkError}=await db.from("domestic_wise_order_link").select("domestic_order_id").in("wise_order_id",chunk);
   if(linkError)throw new Error("와이스 연결 조회 실패: "+linkError.message);
   for(const link of links||[])touchedDomesticIds.add(String(link.domestic_order_id));
  }
  for(const domesticId of touchedDomesticIds){
   const {data:links,error:linkError}=await db.from("domestic_wise_order_link").select("wise_order_id").eq("domestic_order_id",domesticId);
   if(linkError)throw new Error("와이스 닉네임 연결 조회 실패: "+linkError.message);
   const linkedIds=(links||[]).map(x=>x.wise_order_id);
   if(!linkedIds.length)continue;
   const {data:latest,error:latestError}=await db.from("domestic_wise_sales_order")
    .select("buyer_nickname,ordered_at").in("wise_order_id",linkedIds).order("ordered_at",{ascending:false}).limit(1);
   if(latestError)throw new Error("최신 와이스 닉네임 조회 실패: "+latestError.message);
   const currentNickname=asText(latest?.[0]?.buyer_nickname);
   if(currentNickname){
    const {error:nickError}=await db.from("domestic_order").update({nickname:currentNickname}).eq("order_id",domesticId).eq("platform","wise");
    if(nickError)throw new Error("와이스 닉네임 동기화 실패: "+nickError.message);
   }
  }
  // Refresh WYYYES-only shipping snapshots and item metadata without changing shipping state.
  for(const chunk of batches(orders)){
   const snapshots=chunk.map(o=>({wise_order_id:o.id,wise_status:o.status??null,wise_delivery_company:o.deliveryCompany??null,wise_delivery_code:o.deliveryCode??null,wise_start_at:validDate(o.startAt),wise_updated_at:validDate(o.updatedAt),snapshot_imported_at:new Date().toISOString()}));
   const {error}=await db.from("domestic_wise_order_snapshot").upsert(snapshots,{onConflict:"wise_order_id"});
   if(error)throw new Error("와이스 배송 스냅샷 저장 실패: "+error.message);
  }
  const photoRows=orders.flatMap(o=>(o.stocks??[]).filter(s=>Number.isSafeInteger(s.id)).map(s=>({wise_stock_id:s.id,wise_order_id:o.id,buyer_nickname:asText(o.user?.nickname),ordered_at:validDate(o.createdAt)??new Date().toISOString(),sold_at:validDate(s.soldAt),video_id:asText(s.videoId)||null,item_name:asText(s.name),item_price:Number(s.price??0),image_url:s.thumbnail??null})));
  await upsertWisePhotosPreservingTimes(db,photoRows,"와이스 상품정보 저장 실패");
  const selectedRaw=asText(form.get("selected_ids"));
  const selectedIds=selectedRaw?JSON.parse(selectedRaw):null;
  if(selectedIds!==null&&(!Array.isArray(selectedIds)||selectedIds.length>40||!selectedIds.every(Number.isSafeInteger)||new Set(selectedIds).size!==selectedIds.length))
   return NextResponse.json({error:"선택 주문 ID 형식 오류"},{status:400});
  const allowedIds=selectedIds===null?null:new Set<number>(selectedIds);
  const fresh=rows.filter(x=>!x.existingDomestic&&!x.alreadyQueued&&(allowedIds===null||allowedIds.has(x.wise_order_id)));
  for(const chunk of batches(fresh)){
   const payload=chunk.map(({order:o,ordered_at,nickname})=>({wise_order_id:o.id,buyer_nickname:nickname,ordered_at,receiver_name:o.receiverName??null,receiver_phone:wisePhone(o)||null,postal_code:o.postNum??null,address:[o.addr1,o.addr2,o.addr3].filter(Boolean).join(" "),item_summary:(o.stocks??[]).map(s=>asText(s.name)).join(" / "),item_total_price:(o.stocks??[]).reduce((sum,s)=>sum+Number(s.price??0),0),item_count:o.stocks?.length??0}));
   const {error}=await db.from("domestic_wise_import_queue").upsert(payload,{onConflict:"wise_order_id",ignoreDuplicates:true});if(error)throw error;
  }
  return NextResponse.json({ok:true,recovered_links:recoveredLinks,queued_new:fresh.length,sales_saved:salesRows.length,updated_snapshots:orders.length,updated_items:photoRows.length,excluded_count:parsed.length-orders.length,skipped_existing:rows.filter(x=>x.existingDomestic).length,skipped_queued:rows.filter(x=>x.alreadyQueued).length});
 }catch(e){
  console.error("Wise JSON import failed:",e);
  const err=e as {message?:string;details?:string;hint?:string;code?:string}|null;
  return NextResponse.json({error:err?.message||String(e)||"Import failed",detail:err?.details,code:err?.code,hint:err?.hint},{status:500});
 }
}
