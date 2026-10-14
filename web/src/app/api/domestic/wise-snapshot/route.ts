import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SNAPSHOT_ID = "latest";
type Row = {
  nickname: string;
  order_id: string;
  days: number;
  status: "unshipped" | "pending" | "confirmed" | "urgent";
  source: "wise";
};

export async function GET() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("domestic_wise_snapshot")
    .select("rows,updated_at")
    .eq("id", SNAPSHOT_ID)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, snapshot: data || null });
}

export async function POST(request: Request) {
  let body: { rows?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 }); }

  if (!Array.isArray(body.rows) || body.rows.length > 20000) {
    return NextResponse.json({ error: "유효하지 않은 주문 목록" }, { status: 400 });
  }
  const rows: Row[] = [];
  for (const item of body.rows) {
    if (!item || typeof item !== "object") {
      return NextResponse.json({ error: "유효하지 않은 주문 데이터" }, { status: 400 });
    }
    const row = item as Record<string, unknown>;
    if (typeof row.nickname !== "string" || typeof row.order_id !== "string" ||
        typeof row.days !== "number" || !Number.isFinite(row.days) ||
        !["unshipped", "pending", "confirmed", "urgent"].includes(String(row.status)) ||
        row.source !== "wise") {
      return NextResponse.json({ error: "유효하지 않은 주문 필드" }, { status: 400 });
    }
    rows.push({
      nickname: row.nickname.slice(0, 120),
      order_id: row.order_id.slice(0, 100),
      days: row.days,
      status: row.status as Row["status"],
      source: "wise"
    });
  }
  const supabase = createServiceRoleClient();
  // A partial Wise scan must not be interpreted as receipt confirmation.
  if ((body as { complete?: unknown }).complete !== true) {
    return NextResponse.json({ error: "일부 주문 조회 실패: 이전 목록 유지" }, { status: 422 });
  }
  const { data: previous, error: readError } = await supabase
    .from("domestic_wise_snapshot").select("rows").eq("id", SNAPSHOT_ID).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  const previousRows: Row[] = Array.isArray(previous?.rows) ? previous.rows as Row[] : [];
  const present = new Set(rows.map(row => row.order_id));
  const confirmed = previousRows.filter(row =>
    (row.status === "pending" || row.status === "confirmed") &&
    !present.has(row.order_id)
  ).map(row => ({ ...row, status: "confirmed" as const }));
  rows.push(...confirmed);
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from("domestic_wise_snapshot")
    .upsert({ id: SNAPSHOT_ID, rows, updated_at }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updatedAt: updated_at, rows });
}

export async function PATCH(request: Request) {
 const body = await request.json().catch(() => null);
 const id = String(body?.order_id || "");
 const action = body?.action;
 if (!id || !["register","dismiss"].includes(action)) return NextResponse.json({error:"잘못된 요청"},{status:400});
 const db = createServiceRoleClient();
 const {data:snapshot,error:readError} = await db.from("domestic_wise_snapshot").select("rows").eq("id",SNAPSHOT_ID).maybeSingle();
 if (readError) return NextResponse.json({error:readError.message},{status:500});
 const rows:Row[] = Array.isArray(snapshot?.rows) ? snapshot.rows as Row[] : [];
 const selected = rows.find(row=>row.order_id===id && row.status==="confirmed");
 if (!selected) return NextResponse.json({error:"처리할 추정 주문이 없어"},{status:409});
 if (action==="register") {
  const normalize=(s:string)=>s.normalize("NFKC").replace(/\s+/g,"").toLowerCase();
  const {data:orders,error:ordersError}=await db.from("domestic_order").select("order_id,nickname,platform,order_status,domestic_shipping(tracking_registered,shipping_status)");
  if(ordersError)return NextResponse.json({error:ordersError.message},{status:500});
  const found=(orders||[]).filter((o:any)=>{
   if(o.platform!=="wise"||normalize(String(o.nickname||""))!==normalize(selected.nickname))return false;
   const shipping=Array.isArray(o.domestic_shipping)?o.domestic_shipping[0]:o.domestic_shipping;
   return shipping?.tracking_registered===false &&
     !["kept","done"].includes(String(o.order_status||"")) &&
     shipping.shipping_status!=="done";
  });
  if(found.length!==1)return NextResponse.json({error:"등록 가능한 주문이 0건 또는 여러 건이야. 직접 확인해줘."},{status:409});
  const order:any=found[0];
  const shipping=Array.isArray(order.domestic_shipping)?order.domestic_shipping[0]:order.domestic_shipping;
  if(!shipping||shipping.tracking_registered!==false||["kept","done"].includes(String(order.order_status||""))||shipping.shipping_status==="done")return NextResponse.json({error:"이미 처리됐거나 변경 불가 상태야"},{status:409});
  const {data:changed,error:shippingError}=await db.from("domestic_shipping").update({tracking_registered:true}).eq("order_id",order.order_id).eq("tracking_registered",false).neq("shipping_status","done").select("order_id");
  if(shippingError||!changed?.length)return NextResponse.json({error:shippingError?.message||"등록 변경 실패"},{status:409});
  const {error:orderError}=await db.from("domestic_order").update({order_status:"kept"}).eq("order_id",order.order_id);
  if(orderError)return NextResponse.json({error:"등록 Y 저장됨, 직킵 변경 실패: "+orderError.message},{status:500});
 }
 const next=rows.filter(row=>row.order_id!==id);
 const {error:saveError}=await db.from("domestic_wise_snapshot").update({rows:next,updated_at:new Date().toISOString()}).eq("id",SNAPSHOT_ID);
 if(saveError)return NextResponse.json({error:saveError.message},{status:500});
 return NextResponse.json({ok:true,rows:next});
}
