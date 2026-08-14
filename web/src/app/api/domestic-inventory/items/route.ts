import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = createServiceRoleClient();

    const currency = String(body.currency ?? "JPY").toUpperCase();
    const purchasePrice = Number(
      body.purchase_price ?? body.total_price ?? body.yen_price ?? 0
    );

    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        item_name: body.item_name ?? "",
        item_type: body.item_type ?? "기타",
        series_name: body.series_name ?? "기타",
        image_url: body.image_url ?? "",
        lineup_image_url: body.lineup_image_url ?? "",
        source_url: body.source_url ?? "",
        order_number: body.order_number ?? "",
        order_date: body.order_date ?? "",
        tracking_number: body.tracking_number ?? "",
        quantity: Number(body.quantity ?? 1),
        currency,
        purchase_price: purchasePrice,
        yen_price: currency === "JPY" ? purchasePrice : 0,
        shipping_fee: Number(body.shipping_fee ?? 0),
        domestic_shipping_fee: Number(body.domestic_shipping_fee ?? 0),
        total_price: Number(body.total_price ?? purchasePrice),
        status: body.status ?? "입고전",
        memo: body.memo ?? "",
        raw_text: body.raw_text ?? "",
        component_count: body.component_count ? Number(body.component_count) : null,
        unit_sale_price: body.unit_sale_price ? Number(body.unit_sale_price) : null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "저장 실패" },
      { status: 500 }
    );
  }
}
