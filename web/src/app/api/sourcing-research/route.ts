import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("sourcing_research")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "사입 검토 목록 조회 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, items: data || [] });
}

export async function POST(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from("sourcing_research")
    .insert({
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
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "사입 검토 저장 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, item: data });
}
