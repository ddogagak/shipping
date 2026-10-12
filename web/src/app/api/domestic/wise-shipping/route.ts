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
