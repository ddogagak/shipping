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
  return NextResponse.json({items:data||[],match_type:"wise_order_id"});
 }
 // Legacy orders without persisted Wise IDs retain their previous candidate behavior.
 const {data,error:itemError}=await db.from("domestic_wise_item_photo").select("wise_stock_id,ordered_at,item_name,item_price,image_url").eq("buyer_nickname",order.nickname||"").order("ordered_at",{ascending:true});
 if(itemError)return NextResponse.json({error:itemError.message},{status:500});
 const summary=norm(order.item_summary);
 const items=(data||[]).filter(x=>summary && norm(x.item_name) && summary.includes(norm(x.item_name)));
 return NextResponse.json({items,match_type:"legacy",notice:"과거 주문은 닉네임+상품명 후보 매칭입니다."});
}
