import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
function shipping(row: any) {
  return Array.isArray(row.domestic_shipping) ? row.domestic_shipping[0] || null : row.domestic_shipping || null;
}
export async function GET() {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("domestic_order").select(
    "order_id,customer_order_no,platform,nickname,recipient_name,phone,order_status,domestic_shipping(tracking_number,tracking_registered,shipping_status)"
  );
  if (error) return NextResponse.json({error:"조회 실패",detail:error.message},{status:500});
  const rows = (data || []).filter((row:any) => {
    const s = shipping(row);
    return row.platform === "wise"
      && !["kept","done"].includes(String(row.order_status || ""))
      && String(s?.shipping_status || "") !== "done"
      && s?.tracking_registered !== true
      && /[0-9]/.test(String(s?.tracking_number || ""));
  }).map((row:any) => ({
    order_id:row.order_id,customer_order_no:row.customer_order_no,
    nickname:row.nickname,recipient_name:row.recipient_name,phone:row.phone,
    tracking_number:String(shipping(row)?.tracking_number || "").trim()
  }));
  return NextResponse.json({ok:true,rows,total:rows.length});
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const orderId = String(body?.order_id || "").trim();
  const tracking = String(body?.tracking_number || "").trim();
  const deliveryId = Number(body?.wise_delivery_id);
  const success = body?.wise_success === true;
  if (!orderId || !tracking || !success || !Number.isSafeInteger(deliveryId) || deliveryId <= 0) {
    return NextResponse.json({error:"와이스 성공 응답과 배송 식별자가 필요합니다."},{status:400});
  }
  const db = createServiceRoleClient();
  const {data:order,error} = await db.from("domestic_order").select(
    "order_id,platform,order_status,domestic_shipping(tracking_number,tracking_registered,shipping_status)"
  ).eq("order_id",orderId).single();
  if(error || !order) return NextResponse.json({error:"주문을 찾을 수 없습니다.",detail:error?.message},{status:404});
  const ship = shipping(order);
  if(order.platform !== "wise" || ["kept","done"].includes(String(order.order_status || "")) ||
     String(ship?.shipping_status || "") === "done" || ship?.tracking_registered === true ||
     String(ship?.tracking_number || "").trim() !== tracking) {
    return NextResponse.json({error:"주문 상태 또는 송장번호가 변경되었습니다. 다시 조회하세요."},{status:409});
  }
  const {data:updated,error:updateError} = await db.from("domestic_shipping").update({
    tracking_registered:true,shipping_status:"registered",updated_at:new Date().toISOString()
  }).eq("order_id",orderId).eq("tracking_number",tracking).eq("tracking_registered",false)
    .select("order_id");
  if(updateError) return NextResponse.json({error:"ddoga 상태 저장 실패",detail:updateError.message},{status:500});
  if(!updated?.length) return NextResponse.json({error:"업데이트 대상이 없습니다. 새로고침 후 확인하세요."},{status:409});
  return NextResponse.json({ok:true,order_id:orderId,wise_delivery_id:deliveryId});
}
