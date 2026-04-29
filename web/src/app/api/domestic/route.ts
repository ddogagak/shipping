import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const platform = searchParams.get("platform") || "all";

  const supabase = createServiceRoleClient();
  let query = supabase
    .from("orders")
    .select("id, platform, platform_order_no, customer_nickname, item_summary, item_count, recipient_name, phone, address1, address2, workflow_status, tracking_number, domestic_memo, created_at")
    .eq("order_type", "domestic")
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("workflow_status", status);
  if (platform !== "all") query = query.eq("platform", platform);
  if (status !== "delivered") query = query.neq("workflow_status", "delivered");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const hasAddress = Boolean(String(body.address1 || "").trim());
  const workflow_status = hasAddress ? "address_input" : "order_input";

  const payload = {
    order_type: "domestic",
    platform: body.platform,
    platform_order_no: body.platform_order_no || null,
    customer_nickname: body.customer_nickname || null,
    item_summary: body.item_summary || null,
    item_count: Number(body.item_count || 0),
    recipient_name: body.recipient_name || null,
    phone: body.phone || null,
    postal_code: body.postal_code || null,
    address1: body.address1 || null,
    address2: body.address2 || null,
    domestic_memo: body.domestic_memo || null,
    workflow_status,
    shipping_status: "not_exported"
  };

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("orders").insert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, workflow_status } = body;
  if (!id || !workflow_status) return NextResponse.json({ error: "id/workflow_status required" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("orders").update({ workflow_status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
