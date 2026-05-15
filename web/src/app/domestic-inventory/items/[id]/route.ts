import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        item_name: body.item_name ?? "",
        item_type: body.item_type ?? "기타",
        series_name: body.series_name ?? "기타",
        image_url: body.image_url ?? "",
        order_number: body.order_number ?? "",
        order_date: body.order_date ?? "",
        tracking_number: body.tracking_number ?? "",
        quantity: Number(body.quantity ?? 1),
        yen_price: Number(body.yen_price ?? 0),
        shipping_fee: Number(body.shipping_fee ?? 0),
        domestic_shipping_fee: Number(body.domestic_shipping_fee ?? 0),
        total_price: Number(body.total_price ?? 0),
        status: body.status ?? "입고전",
        memo: body.memo ?? "",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "수정 실패",
      },
      { status: 500 }
    );
  }
}
