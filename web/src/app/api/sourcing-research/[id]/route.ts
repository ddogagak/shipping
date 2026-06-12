import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("sourcing_research")
    .update({
      status: body.status || "검토중",
      product_url: body.product_url || "",
      product_name: body.product_name || "",
      source_site: body.source_site || "",
      series_name: body.series_name || "",
      item_type: body.item_type || "",
      yen_price: Number(body.yen_price || 0),
      extra_cost_yen: Number(body.extra_cost_yen || 0),
      box_item_count: Number(body.box_item_count || 1),
      exchange_multiplier: Number(body.exchange_multiplier || 15),
      expected_unit_price_krw: Number(body.expected_unit_price_krw || 0),
      memo: body.memo || "",
      image_url: body.image_url || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "사입 검토 수정 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("sourcing_research")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "사입 검토 삭제 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
