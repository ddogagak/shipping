import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        item_name: body.item_name,
        item_type: body.item_type,
        series_name: body.series_name,
        image_url: body.image_url,
        order_number: body.order_number,
        order_date: body.order_date,
        tracking_number: body.tracking_number,
        quantity: body.quantity,
        total_price: body.total_price,
        domestic_shipping_fee: body.domestic_shipping_fee,
        status: body.status,
        memo: body.memo,
      })
      .eq("id", Number(id))
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data,
    });

  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message:
          err instanceof Error ? err.message : "저장 실패",
      },
      { status: 500 }
    );
  }
}
