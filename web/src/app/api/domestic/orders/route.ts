import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const platforms = (searchParams.get("platforms") || "").split(",").filter(Boolean);
  const orderStatuses = (searchParams.get("orderStatuses") || "").split(",").filter(Boolean);
  const shippingStatuses = (searchParams.get("shippingStatuses") || "").split(",").filter(Boolean);

  const supabase = createServiceRoleClient();
  let q = supabase.from("domestic_order").select("*, domestic_shipping(*)").order("created_at", { ascending: false });
  if (platforms.length) q = q.in("platform", platforms);
  if (orderStatuses.length) q = q.in("order_status", orderStatuses);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data || []) as any[];
  if (shippingStatuses.length) rows = rows.filter((r) => shippingStatuses.includes(r.domestic_shipping?.shipping_status));
  if (!shippingStatuses.includes("done")) rows = rows.filter((r) => r.domestic_shipping?.shipping_status !== "done");

  return NextResponse.json({ rows });
}

export async function PATCH(req: Request) {
  const { orderIds, action } = await req.json();
  if (!Array.isArray(orderIds) || !orderIds.length) return NextResponse.json({ error: "orderIds required" }, { status: 400 });

  const supabase = createServiceRoleClient();

  if (action === "checked") {
    const { error } = await supabase.from("domestic_order").update({ order_status: "checked" }).in("order_id", orderIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "done") {
    const { error } = await supabase.from("domestic_order").update({ order_status: "done" }).in("order_id", orderIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "shipping_done") {
    const { error: sErr } = await supabase.from("domestic_shipping").update({ shipping_status: "done" }).in("order_id", orderIds);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    const { error: oErr } = await supabase.from("domestic_order").update({ order_status: "done" }).in("order_id", orderIds);
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { orderIds } = await req.json();
  if (!Array.isArray(orderIds) || !orderIds.length) return NextResponse.json({ error: "orderIds required" }, { status: 400 });
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("domestic_shipping")
    .update({ shipping_status: "excel_exported", excel_exported_at: new Date().toISOString() })
    .in("order_id", orderIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
