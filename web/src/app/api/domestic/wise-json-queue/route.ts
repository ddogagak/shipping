import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export async function GET() {
 const db = createServiceRoleClient();
 const { data, error } = await db.from("domestic_wise_import_queue").select("*").eq("review_status","pending").order("ordered_at",{ascending:false});
 return error ? NextResponse.json({error:error.message},{status:500}) : NextResponse.json({orders:data??[]});
}

export async function POST(req: Request) {
 try {
  const {wise_order_id,action}=await req.json();
  if(!Number.isSafeInteger(wise_order_id)||!["approve","ignore"].includes(action))return NextResponse.json({error:"잘못된 요청"},{status:400});
  const db=createServiceRoleClient();
  const {data:q,error:qe}=await db.from("domestic_wise_import_queue").select("*").eq("wise_order_id",wise_order_id).single();
  if(qe)throw qe;
  if(q.review_status!=="pending")return NextResponse.json({error:"이미 처리된 주문"},{status:409});
  if(action==="ignore"){
   const {error}=await db.from("domestic_wise_import_queue").update({review_status:"ignored"}).eq("wise_order_id",wise_order_id);
   if(error)throw error;
   return NextResponse.json({ok:true});
  }
  const id="WJSON_"+wise_order_id;
  const {data:existing,error:ee}=await db.from("domestic_order").select("order_id").eq("order_id",id).maybeSingle();
  if(ee)throw ee;
  if(existing)return NextResponse.json({error:"이미 등록된 주문"},{status:409});
  const {data:orders,error:oe}=await db.from("domestic_order").select("order_id,nickname,platform,first_order_date,source_order_dates").eq("platform","wise");
  if(oe)throw oe;
  const norm=(v:unknown)=>String(v??"").normalize("NFKC").replace(/\s+/g,"").toLowerCase();
  const dateKey=(v:unknown)=>{const s=String(v??"");const m=s.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})[ T/]+(\d{1,2}):(\d{1,2})/);return m?[m[1],m[2].padStart(2,"0"),m[3].padStart(2,"0")].join("-")+" "+m[4].padStart(2,"0")+":"+m[5]:""};
  const date=new Date(q.ordered_at).toLocaleString("sv-SE",{timeZone:"Asia/Seoul",hour12:false}).replace(/-/g,".").slice(0,16);
  const duplicate=(orders??[]).find(o=>norm(o.nickname)===norm(q.buyer_nickname)&&[o.first_order_date,...(Array.isArray(o.source_order_dates)?o.source_order_dates:[])].some(d=>dateKey(d)===dateKey(date)));
  if(duplicate)return NextResponse.json({error:"기존 주문 중복 가능: "+duplicate.order_id},{status:409});
  const {error:ie}=await db.from("domestic_order").insert({order_id:id,customer_order_no:"W"+wise_order_id,platform:"wise",source_order_dates:[date],first_order_date:date,nickname:String(q.buyer_nickname??"").split("(이전")[0].trim(),recipient_name:q.receiver_name,phone:/\d/.test(q.receiver_phone??"")?q.receiver_phone:null,postal_code:q.postal_code,address:q.address,order_count:1,item_summary:q.item_summary,item_total_price:q.item_total_price,order_status:"accepted"});
  if(ie)throw ie;
  const {error:se}=await db.from("domestic_shipping").insert({order_id:id,carrier:"우체국택배",shipping_type:"일반택배",tracking_number:null,shipping_status:"start"});
  if(se)throw new Error("주문 등록됨, 배송정보 저장 실패: "+se.message);
  const {data:items,error:pe}=await db.from("domestic_wise_item_photo").select("item_name,item_price").eq("wise_order_id",wise_order_id);
  if(pe)throw pe;
  if(items?.length){
   const {error:it}=await db.from("domestic_order_item").insert(items.map(x=>({order_id:id,item_text:x.item_name,price:x.item_price})));
   if(it)throw new Error("주문 등록됨, 상품정보 저장 실패: "+it.message);
  }
  const {error:re}=await db.from("domestic_wise_import_queue").update({review_status:"reviewed"}).eq("wise_order_id",wise_order_id);
  if(re)throw new Error("주문 등록됨, 대기열 상태 저장 실패: "+re.message);
  return NextResponse.json({ok:true,order_id:id});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"저장 실패"},{status:500})}
}
