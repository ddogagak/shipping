import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normalize(s: any) {
  return String(s ?? "").trim();
}

export async function POST(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();

  const rows = body.rows || [];

  let updated = 0;
  let inserted = 0;

  for (const r of rows) {
    if (!r.selected) continue;

    const orderNo = normalize(r.db_order) || normalize(r.original_order_number);

    // -----------------------------
    // 기존 주문 존재 여부 확인
    // -----------------------------
    const { data: existing } = await supabase
      .from("ebay_order")
      .select("order_number")
      .eq("order_number", orderNo)
      .maybeSingle();

    // =============================
    // 1. 기존 주문 → 업데이트
    // =============================
    if (existing) {
      await supabase
        .from("ebay_shipping")
        .update({
          tracking_number: r.tracking,
          shipping_label_status: r.next_status,
        })
        .eq("order_number", orderNo);

      updated++;
      continue;
    }

    // =============================
    // 2. 신규 주문 생성
    // =============================

    // ebay_order
    await supabase.from("ebay_order").insert({
      order_number: orderNo,
      source_order_numbers: [orderNo],
      username: normalize(r.username) || null,
      name: normalize(r.name) || null,
      country: null,
      country_code: normalize(r.country) || null,
      quantity: 1,
      shipping_method: r.carrier,
      order_status: "check",
    });

    // ebay_shipping
    await supabase.from("ebay_shipping").insert({
      order_number: orderNo,
      username: normalize(r.username) || null,
      shipping_method: r.carrier,
      shipping_label_status: r.next_status,
      tracking_number: r.tracking,
      receipt_status: null,
      export_data: {},
    });

    // ebay_order_item
    await supabase.from("ebay_order_item").insert({
      order_number: orderNo,
      username: normalize(r.username) || null,
      quantity: 1,
      item_list: "",
      stockout_item_indexes: [],
    });

    inserted++;
  }

  return NextResponse.json({
    ok: true,
    updated,
    inserted,
  });
}
