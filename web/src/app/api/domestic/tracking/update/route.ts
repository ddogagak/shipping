import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  const { rows } = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows required" }, { status: 400 });

  const supabase = createServiceRoleClient();
  let updated = 0;
  for (const r of rows) {
    if (!r.matched_order_id || !r.tracking_number) continue;
    const { error } = await supabase
      .from("domestic_shipping")
      .update({ tracking_number: r.tracking_number, shipping_status: "uploaded" })
      .eq("order_id", r.matched_order_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated++;
  }
  return NextResponse.json({ ok: true, updated });
}
