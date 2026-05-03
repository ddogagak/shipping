import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { DomesticTrackingPreview } from "@/lib/domestic/types";

export async function POST(req: Request) {
  const { rows } = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows required" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const out: DomesticTrackingPreview[] = [];

  for (const r of rows) {
    const tracking = String(r.tracking_number || "").trim();
    if (!tracking) {
      out.push({ ...r, match_status: "missing_tracking" });
      continue;
    }

    const orderId = String(r.order_id_input || "").trim();
    if (orderId) {
      const { data } = await supabase.from("domestic_order").select("order_id").eq("order_id", orderId);
      if (data?.length === 1) { out.push({ ...r, matched_order_id: orderId, match_status: "matched_by_order_id" }); continue; }
      if ((data?.length || 0) > 1) { out.push({ ...r, match_status: "duplicate_candidate" }); continue; }
    }

    const name = String(r.recipient_name || "").trim();
    const phone = String(r.phone || "").trim();
    if (name && phone) {
      const { data } = await supabase.from("domestic_order").select("order_id").eq("recipient_name", name).eq("phone", phone);
      if (data?.length === 1) { out.push({ ...r, matched_order_id: data[0].order_id, match_status: "matched_by_name_phone" }); continue; }
      if ((data?.length || 0) > 1) { out.push({ ...r, match_status: "duplicate_candidate" }); continue; }
    }

    const addr = String(r.address || "").trim();
    if (name && addr) {
      const { data } = await supabase.from("domestic_order").select("order_id,address").eq("recipient_name", name);
      const match = (data || []).filter((d: any) => String(d.address || "").includes(addr.slice(0, 6)));
      if (match.length === 1) { out.push({ ...r, matched_order_id: match[0].order_id, match_status: "matched_by_name_address" }); continue; }
      if (match.length > 1) { out.push({ ...r, match_status: "duplicate_candidate" }); continue; }
    }

    out.push({ ...r, match_status: "not_found" });
  }

  return NextResponse.json({ rows: out });
}
