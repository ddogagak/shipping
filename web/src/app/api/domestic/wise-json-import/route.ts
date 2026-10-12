import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime="nodejs";
type RawOrder={id:number;status?:number;deliveryCompany?:string|null;deliveryCode?:string|null;startAt?:string|null;updatedAt?:string|null;createdAt?:string|null;receiverName?:string|null;receiverPhoneNum?:string|null;postNum?:string|null;addr1?:string|null;addr2?:string|null;addr3?:string|null;user?:{nickname?:string|null};stocks?:Array<{id:number;name?:string;price?:number;thumbnail?:string|null}>};
function asText(v:unknown){return String(v??"").trim()}
function validDate(v:unknown){const s=asText(v);return s&&!Number.isNaN(Date.parse(s))?s:null}
function kst(v:string){return new Date(v).toLocaleString("sv-SE",{timeZone:"Asia/Seoul"}).slice(0,16)}
function key(v:string){return v.normalize("NFKC").replace(/\\s+/g,"").toLowerCase()}
function batches<T>(a:T[],n=200){const out:T[][]=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out}
export async function POST(req:Request){
 try{
  const form=await req.formData();
  const file=form.get("file");
  const mode=asText(form.get("mode"));
  if(!(file instanceof File)||file.size>15_000_000) return NextResponse.json({error:"15MB 이하 JSON 파일 필요"},{status:400});
  const parsed=JSON.parse(await file.text());
  if(!Array.isArray(parsed)||!parsed.every(x=>x&&Number.isSafeInteger(x.id)&&Array.isArray(x.stocks)))return NextResponse.json({error:"와이스 주문 배열 형식이 아닙니다."},{status:400});
  const orders=parsed as RawOrder[];
  const db=createServiceRoleClient();
  const {data:domestic,error:domesticError}=await db.from("domestic_order").select("order_id,nickname,platform,first_order_date,source_order_dates");
  if(domesticError)throw domesticError;
  const {data:queued,error:queueError}=await db.from("domestic_wise_import_queue").select("wise_order_id");
  if(queueError)throw queueError;
  const queuedIds=new Set((queued??[]).map(x=>Number(x.wise_order_id)));
  const domesticKeys=new Set<string>();
  for(const d of domestic??[]){
   if(d.platform!=="wise")continue;
   for(const date of [...(Array.isArray(d.source_order_dates)?d.source_order_dates:[]),d.first_order_date]){
    const m=asText(date).match(/^(\\d{4})[.\\/-](\\d{1,2})[.\\/-](\\d{1,2})\\s+(\\d{1,2}):(\\d{1,2})/);
    if(m)domesticKeys.add(key(asText(d.nickname))+"|"+[m[1],m[2].padStart(2,"0"),m[3].padStart(2,"0")].join("-")+" "+m[4].padStart(2,"0")+":"+m[5]);
   }
  }
  const rows=orders.filter(x=>validDate(x.createdAt)).map(o=>{
   const date=validDate(o.createdAt)!;
   const nickname=asText(o.user?.nickname);
   const existingDomestic=domesticKeys.has(key(nickname)+"|"+kst(date));
   return {order:o,wise_order_id:o.id,nickname,ordered_at:date,existingDomestic,alreadyQueued:queuedIds.has(o.id),items:o.stocks?.length??0};
  });
  if(mode==="preview")return NextResponse.json({ok:true,total:rows.length,new_orders:rows.filter(x=>!x.existingDomestic&&!x.alreadyQueued).map(({order,...x})=>x),possible_existing:rows.filter(x=>x.existingDomestic).map(({order,...x})=>x),already_queued:rows.filter(x=>x.alreadyQueued).length,notice:"닉네임+주문 분 단위 날짜로 기존 주문을 추정합니다. 동일 분 주문은 검토가 필요합니다."});
  if(mode!=="save")return NextResponse.json({error:"Invalid mode"},{status:400});
  // Never alter existing domestic orders or shipping. Refresh WYYYES-only snapshots and item metadata.
  for(const chunk of batches(orders)){
   const snapshots=chunk.map(o=>({wise_order_id:o.id,wise_status:o.status??null,wise_delivery_company:o.deliveryCompany??null,wise_delivery_code:o.deliveryCode??null,wise_start_at:validDate(o.startAt),wise_updated_at:validDate(o.updatedAt),snapshot_imported_at:new Date().toISOString()}));
   const {error}=await db.from("domestic_wise_order_snapshot").upsert(snapshots,{onConflict:"wise_order_id"});
   if(error)throw error;
  }
  const photoRows=orders.flatMap(o=>(o.stocks??[]).filter(s=>Number.isSafeInteger(s.id)).map(s=>({wise_stock_id:s.id,wise_order_id:o.id,buyer_nickname:asText(o.user?.nickname),ordered_at:validDate(o.createdAt)??new Date().toISOString(),item_name:asText(s.name),item_price:Number(s.price??0),image_url:s.thumbnail??null})));
  for(const chunk of batches(photoRows)){const {error}=await db.from("domestic_wise_item_photo").upsert(chunk,{onConflict:"wise_stock_id"});if(error)throw error}
  const fresh=rows.filter(x=>!x.existingDomestic&&!x.alreadyQueued);
  for(const chunk of batches(fresh)){
   const payload=chunk.map(({order:o,ordered_at,nickname})=>({wise_order_id:o.id,buyer_nickname:nickname,ordered_at,receiver_name:o.receiverName??null,receiver_phone:o.receiverPhoneNum??null,postal_code:o.postNum??null,address:[o.addr1,o.addr2,o.addr3].filter(Boolean).join(" "),item_summary:(o.stocks??[]).map(s=>asText(s.name)).join(" / "),item_total_price:(o.stocks??[]).reduce((sum,s)=>sum+Number(s.price??0),0),item_count:o.stocks?.length??0}));
   const {error}=await db.from("domestic_wise_import_queue").upsert(payload,{onConflict:"wise_order_id",ignoreDuplicates:true});if(error)throw error;
  }
  return NextResponse.json({ok:true,queued_new:fresh.length,updated_snapshots:orders.length,updated_items:photoRows.length,skipped_existing:rows.filter(x=>x.existingDomestic).length,skipped_queued:rows.filter(x=>x.alreadyQueued).length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Import failed"},{status:500})}
}
