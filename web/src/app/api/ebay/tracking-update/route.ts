import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();

  const rows = body.rows || [];

  for (const r of rows) {
    if (!r.selected || !r.db_order) continue;

    await supabase
      .from("ebay_shipping")
      .update({
        tracking_number: r.tracking,
        shipping_label_status: r.next_status,
      })
      .eq("order_number", r.db_order);
  }

  return NextResponse.json({ ok: true });
}
