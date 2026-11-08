import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
function norm(v: unknown) { return String(v ?? "").normalize("NFKC").replace(/\\s+/g,"").toLowerCase(); }
export async function GET(req: Request) {
 const orderId = new URL(req.url).searchParams.get("order_id");
 if (!orderId) return NextResponse.json({error:"order_id required"},{status:400});
 const db=createServiceRoleClient();
 const {data:order,error}=await db.from("domestic_order").select("order_id,nickname,item_summary,platform").eq("order_id",orderId).maybeSingle();
 if(error) return NextResponse.json({error:error.message},{status:500});
 if(!order) return NextResponse.json({error:"주문을 찾을 수 없습니다."},{status:404});
 if(order.platform!=="wise") return NextResponse.json({items:[]});
 const {data: links,error:linkError}=await db.from("domestic_wise_order_link").select("wise_order_id").eq("domestic_order_id",orderId);
 if(linkError) return NextResponse.json({error:linkError.message},{status:500});
 const ids=(links||[]).map(x=>x.wise_order_id);
 if(ids.length){
  const {data,error:itemError}=await db.from("domestic_wise_item_photo").select("wise_stock_id,wise_order_id,ordered_at,item_name,item_price,image_url").in("wise_order_id",ids).order("ordered_at",{ascending:true});
  if(itemError)return NextResponse.json({error:itemError.message},{status:500});
  // Build the complete display from the Wise order queue, not just the optional
  // photo cache. A missing photo must never hide a purchased item or its date.
  const {data:queued,error:queueError}=await db.from("domestic_wise_import_queue")
   .select("wise_order_id,ordered_at,item_summary,item_count").in("wise_order_id",ids).order("ordered_at",{ascending:true});
  if(queueError)return NextResponse.json({error:queueError.message},{status:500});
  const photos=data||[];
  const result:Array<{wise_stock_id:number;wise_order_id:number;ordered_at:string;item_name:string;item_price:number|null;image_url:string|null;photo_missing:boolean;display_key:string}>=[];
  const queues=queued||[];
  for(const q of queues){
   const orderPhotos=photos.filter(p=>p.wise_order_id===q.wise_order_id);
   const names=String(q.item_summary||"").split(" / ").map(s=>s.trim()).filter(Boolean);
   const used=new Set<number>();
   for(let i=0;i<names.length;i++){
    const matchIndex=orderPhotos.findIndex((p,j)=>!used.has(j)&&p.item_name===names[i]);
    const p=matchIndex>=0?orderPhotos[matchIndex]:null;
    if(matchIndex>=0)used.add(matchIndex);
    result.push({wise_stock_id:p?.wise_stock_id??-(q.wise_order_id*10000+i+1),wise_order_id:q.wise_order_id,ordered_at:p?.ordered_at||q.ordered_at,item_name:names[i],item_price:p?.item_price??null,image_url:p?.image_url??null,photo_missing:!p?.image_url,display_key:q.wise_order_id+":"+i});
   }
   // Preserve photographs not represented in the queue summary.
   orderPhotos.forEach((p,j)=>{if(!used.has(j))result.push({...p,photo_missing:!p.image_url,display_key:q.wise_order_id+":photo:"+j});});
  }
  // Support linked historical orders whose queue record has been pruned.
  photos.filter(p=>!queues.some(q=>q.wise_order_id===p.wise_order_id)).forEach((p,i)=>result.push({...p,photo_missing:!p.image_url,display_key:p.wise_order_id+":orphan:"+i}));
  return NextResponse.json({items:result,match_type:"wise_order_id",expected_count:queues.reduce((n,q)=>n+(q.item_count||0),0),photo_count:result.filter(x=>!!x.image_url).length});
 }
 // Legacy orders without persisted Wise IDs retain their previous candidate behavior.
 const {data,error:itemError}=await db.from("domestic_wise_item_photo").select("wise_stock_id,ordered_at,item_name,item_price,image_url").eq("buyer_nickname",order.nickname||"").order("ordered_at",{ascending:true});
 if(itemError)return NextResponse.json({error:itemError.message},{status:500});
 const summary=norm(order.item_summary);
 const items=(data||[]).filter(x=>summary && norm(x.item_name) && summary.includes(norm(x.item_name)));
 return NextResponse.json({items,match_type:"legacy",notice:"과거 주문은 닉네임+상품명 후보 매칭입니다."});
}
