import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parseDomesticText } from "@/lib/domestic/parser";
import type { DomesticPreviewRow, Platform } from "@/lib/domestic/types";

function hasAddress(row: DomesticPreviewRow) {
  return Boolean(String(row.address || "").trim());
}

async function saveRows(rows: DomesticPreviewRow[]) {
  const supabase = createServiceRoleClient();
  const orderIds = rows.map((r) => r.order_id);

  const { data: existing } = await supabase.from("domestic_order").select("order_id").in("order_id", orderIds);
  const existingSet = new Set((existing || []).map((e) => e.order_id));

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (existingSet.has(row.order_id)) {
      skipped++;
      continue;
    }

    const orderPayload = {
      order_id: row.order_id,
      platform: row.platform,
      source_order_dates: row.source_order_dates,
      first_order_date: row.first_order_date || null,
      nickname: row.nickname || null,
      recipient_name: row.recipient_name || null,
      phone: row.phone || null,
      postal_code: row.postal_code || null,
      address: row.address || null,
      order_count: row.order_count || 1,
      item_total_price: row.item_total_price || 0,
      order_status: hasAddress(row) ? "checked" : "accepted"
    };

    const { error: oErr } = await supabase.from("domestic_order").insert(orderPayload);
    if (oErr) return { error: oErr.message };

    const { error: sErr } = await supabase.from("domestic_shipping").insert({
      order_id: row.order_id,
      shipping_status: "start"
    });
    if (sErr) return { error: sErr.message };

    if (row.item_texts.length) {
      const items = row.item_texts.map((item_text) => ({ order_id: row.order_id, item_text, price: 0 }));
      const { error: iErr } = await supabase.from("domestic_order_item").insert(items);
      if (iErr) return { error: iErr.message };
    }

    inserted++;
  }

  return { inserted, skipped };
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const text = String(form.get("text") || "");
    const platform = String(form.get("platform") || "wise") as Platform;
    const rows = parseDomesticText(text, platform);
    return NextResponse.json({ rows });
  }

  const body = await req.json();
  const rows = (body?.rows || []) as DomesticPreviewRow[];
  if (!rows.length) return NextResponse.json({ error: "저장할 rows가 없습니다." }, { status: 400 });

  const saved = await saveRows(rows);
  if ((saved as any).error) return NextResponse.json(saved, { status: 500 });
  return NextResponse.json(saved);
}
