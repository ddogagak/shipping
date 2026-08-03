import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createServiceRoleClient();
  const [{ data: categories, error: categoryError }, { data: locations, error: locationError }, { data: batches, error: batchError }, { data: dictionary, error: dictionaryError }] = await Promise.all([
    supabase.from("stock_category").select("id,code,name,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("stock_location").select("id,name,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("stock_batch").select("id,name,purchased_at,source").order("created_at", { ascending: false }),
    supabase.from("stock_variant_dictionary").select("dictionary_type,display_name,alias,code").order("display_name"),
  ]);

  const error = categoryError || locationError || batchError || dictionaryError;
  if (error) return NextResponse.json({ error: "STOCK 설정 조회 실패", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, categories: categories || [], locations: locations || [], batches: batches || [], dictionary: dictionary || [] });
}

export async function POST(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();
  const kind = String(body.kind || "");
  if (kind === "location") {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "위치명을 입력해줘." }, { status: 400 });
    const { data, error } = await supabase.from("stock_location").insert({ name }).select().single();
    if (error) return NextResponse.json({ error: "위치 추가 실패", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }
  if (kind === "batch") {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "배치명을 입력해줘." }, { status: 400 });
    const { data, error } = await supabase.from("stock_batch").insert({ name, purchased_at: body.purchased_at || null, source: body.source || null, memo: body.memo || null }).select().single();
    if (error) return NextResponse.json({ error: "배치 추가 실패", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }
  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}
