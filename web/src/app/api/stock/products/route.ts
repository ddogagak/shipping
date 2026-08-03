import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = createServiceRoleClient();
  const url = new URL(req.url);
  const category = url.searchParams.get("category") || "";
  const q = url.searchParams.get("q") || "";

  let query = supabase.from("stock_product").select(`id,sku,title,collection_name,folder_name,release_name,item_type,release_price,desired_price,currency,primary_image_url,memo,status,created_at,stock_category(id,code,name),stock_batch(id,name),stock_variant(id,variant_name,variant_code,image_url,desired_price,stock_quantity(id,quantity,stock_location(id,name)))`).order("created_at", { ascending: false });
  if (category) query = query.eq("stock_category.code", category);
  if (q) query = query.or(`title.ilike.%${q}%,sku.ilike.%${q}%,collection_name.ilike.%${q}%,release_name.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "STOCK 조회 실패", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, products: data || [] });
}

export async function POST(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "상품명을 입력해줘." }, { status: 400 });
  const { data: product, error: productError } = await supabase.from("stock_product").insert({
    category_id: body.category_id || null,
    batch_id: body.batch_id || null,
    title,
    collection_name: body.collection_name || null,
    folder_name: body.folder_name || null,
    release_name: body.release_name || null,
    item_type: body.item_type || null,
    release_price: body.release_price === "" ? null : Number(body.release_price),
    desired_price: body.desired_price === "" ? null : Number(body.desired_price),
    currency: body.currency || "KRW",
    primary_image_url: body.primary_image_url || null,
    memo: body.memo || null,
  }).select("id,sku").single();
  if (productError || !product) return NextResponse.json({ error: "상품 저장 실패", detail: productError?.message }, { status: 500 });

  const variants = Array.isArray(body.variants) && body.variants.length ? body.variants : [{ variant_name: "기본", variant_code: "BASE", quantity: 0, location_id: body.location_id }];
  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    const { data: variant, error: variantError } = await supabase.from("stock_variant").insert({
      product_id: product.id,
      variant_name: String(v.variant_name || "기본").trim(),
      variant_code: String(v.variant_code || `V${i + 1}`).trim().toUpperCase(),
      member_name: v.member_name || null,
      character_name: v.character_name || null,
      version_name: v.version_name || null,
      image_url: v.image_url || null,
      desired_price: v.desired_price === "" ? null : Number(v.desired_price),
      sort_order: i,
    }).select("id").single();
    if (variantError || !variant) return NextResponse.json({ error: "하위항목 저장 실패", detail: variantError?.message }, { status: 500 });
    if (v.location_id) {
      const quantity = Math.max(0, Number(v.quantity || 0));
      const { error: quantityError } = await supabase.from("stock_quantity").insert({ variant_id: variant.id, location_id: v.location_id, quantity });
      if (quantityError) return NextResponse.json({ error: "수량 저장 실패", detail: quantityError.message }, { status: 500 });
      await supabase.from("stock_history").insert({ variant_id: variant.id, location_id: v.location_id, action: "initial", quantity_change: quantity, quantity_after: quantity, reason: "최초 등록" });
    }
  }
  return NextResponse.json({ ok: true, id: product.id, sku: product.sku });
}
