import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculatePricing } from "@/lib/pricing";

export const runtime = "nodejs";

type MemberInput = { id: string; image_url?: string; item_name?: string; component_count?: number; unit_cost_price?: number };
const isUuid = (value: unknown) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(value || ""));
const message = (e: unknown) => e instanceof Error ? e.message : String(e || "처리 실패");

function priceFor(unitPrice: number, currency: string, count: number) {
  if (currency === "KRW") return Math.ceil(unitPrice / count);
  return Math.ceil(calculatePricing(currency, unitPrice, count).costPrice / count);
}

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb.from("sale_random_boxes")
      .select("*,sale_random_box_members(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const items = (data || []).map((row: any) => ({
      id: row.id,
      is_random_box: true,
      display_name: row.title,
      product_name: row.title,
      image_url: row.image_url,
      lineup_image_url: row.image_url,
      memo: null,
      sale_memo: row.sale_memo,
      public_comment: row.public_comment,
      component_count: row.component_count,
      purchase_quantity: 1,
      sold_quantity: row.view_status === "completed" ? 1 : 0,
      remaining_quantity: row.view_status === "completed" ? 0 : 1,
      box_cost_price: Number(row.total_cost_krw),
      unit_cost_price: Math.ceil(Number(row.total_cost_krw) / Number(row.component_count)),
      actual_purchase_currency: "KRW",
      actual_purchase_unit_price: Number(row.total_cost_krw),
      sale_price: row.sale_price,
      view_status: row.view_status,
      stock_status: row.view_status === "completed" ? "soldout" : "active",
      series_name: "랜덤박스",
      item_type: "기타",
      members: row.sale_random_box_members || [],
    }));
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, message: message(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = createServiceRoleClient();
    const type = req.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      if (form.get("action") !== "upload_image") return NextResponse.json({ ok: false, message: "잘못된 이미지 요청" }, { status: 400 });
      const file = form.get("image");
      if (!(file instanceof File) || !["image/png","image/jpeg"].includes(file.type) || file.size < 100 || file.size > 4 * 1024 * 1024)
        return NextResponse.json({ ok: false, message: "4MB 이하의 합성 JPG/PNG 이미지가 필요해." }, { status: 400 });
      const key = `random-boxes/${crypto.randomUUID()}.${file.type === "image/jpeg" ? "jpg" : "png"}`;
      const { error } = await sb.storage.from("stock-images").upload(key, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type, upsert: false
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, image_url: sb.storage.from("stock-images").getPublicUrl(key).data.publicUrl });
    }

    const body = await req.json();
    if (body.action !== "create") return NextResponse.json({ ok: false, message: "잘못된 생성 요청" }, { status: 400 });
    const ids = Array.isArray(body.member_ids) ? body.member_ids.map(String) : [];
    if (ids.length < 2 || ids.length > 40 || ids.some((id: string) => !isUuid(id)) || new Set(ids).size !== ids.length)
      return NextResponse.json({ ok: false, message: "서로 다른 상품 2~40개를 선택해줘." }, { status: 400 });
    const title = String(body.title || "").trim().slice(0, 200);
    const imageUrl = String(body.image_url || "");
    if (!title || !/^https:\/\//.test(imageUrl) || !imageUrl.includes("/storage/v1/object/public/stock-images/random-boxes/"))
      return NextResponse.json({ ok: false, message: "랜덤박스 제목과 합성 대표이미지가 필요해." }, { status: 400 });

    const { data: existingMembers, error: usedError } = await sb.from("sale_random_box_members")
      .select("purchase_item_id").in("purchase_item_id", ids);
    if (usedError) throw usedError;
    if (existingMembers?.length) return NextResponse.json({ ok: false, message: "이미 다른 랜덤박스에 포함된 상품이 있어." }, { status: 409 });

    const { data: purchaseItems, error: itemError } = await sb.from("purchase_items")
      .select("id,purchase_order_id,product_name,unit_price,quantity,received_quantity,component_count,sourcing_inventory_id,image_url")
      .in("id", ids);
    if (itemError) throw itemError;
    if (purchaseItems?.length !== ids.length) return NextResponse.json({ ok: false, message: "선택 상품을 찾지 못했어." }, { status: 404 });

    const orderIds = [...new Set(purchaseItems.map((i: any) => i.purchase_order_id))];
    const { data: orders, error: ordersError } = await sb.from("purchase_orders")
      .select("id,order_status,currency,source_site").in("id", orderIds);
    if (ordersError) throw ordersError;
    const orderMap = new Map((orders || []).map((o: any) => [o.id, o]));
    const { data: ledgers, error: ledgersError } = await sb.from("purchase_sale_inventory")
      .select("purchase_item_id,stock_status,box_quantity_override,component_count_override,purchase_price_override,display_name,image_url_override")
      .in("purchase_item_id", ids);
    if (ledgersError) throw ledgersError;
    const ledgerMap = new Map((ledgers || []).map((l: any) => [l.purchase_item_id, l]));
    const inventoryIds = purchaseItems.map((i: any) => i.sourcing_inventory_id).filter(Boolean);
    const { data: inventories, error: inventoryError } = inventoryIds.length
      ? await sb.from("inventory_items").select("id,component_count,item_name,image_url").in("id", inventoryIds)
      : { data: [], error: null };
    if (inventoryError) throw inventoryError;
    const inventoryMap = new Map((inventories || []).map((i: any) => [i.id, i]));
    const images = Array.isArray(body.members) ? body.members as MemberInput[] : [];
    const imageMap = new Map(images.map((m) => [String(m.id), m]));

    const members = ids.map((id: string) => {
      const item: any = purchaseItems.find((p: any) => p.id === id);
      const order: any = orderMap.get(item.purchase_order_id);
      const ledger: any = ledgerMap.get(id);
      const inventory: any = inventoryMap.get(item.sourcing_inventory_id);
      const fromUi: any = imageMap.get(id);
      if (!order || order.order_status !== "입고완료" || ledger?.stock_status === "soldout")
        throw new Error("입고완료 상태의 판매 가능 상품만 선택할 수 있어.");
      const currency = String(order.currency || "JPY").toUpperCase();
      const count = Number(ledger?.component_count_override ?? item.component_count ?? inventory?.component_count ?? fromUi?.component_count ?? 0);
      const qty = Number(ledger?.box_quantity_override ?? item.received_quantity ?? item.quantity ?? 0);
      const unitPrice = Number(ledger?.purchase_price_override ?? item.unit_price ?? 0);
      const url = String(fromUi?.image_url || ledger?.image_url_override || inventory?.image_url || item.image_url || "");
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(qty) || qty < 1 ||
          !Number.isFinite(unitPrice) || unitPrice <= 0 || !["JPY","CNY","KRW"].includes(currency) || !/^https?:\/\//.test(url))
        throw new Error("선택 상품에 구성품 수·입고수량·매입가·이미지 누락이 있어.");
      const unitCost = priceFor(unitPrice, currency, count);
      return {
        purchase_item_id: id, item_name: String(ledger?.display_name || inventory?.item_name || item.product_name),
        original_box_quantity: qty, component_count: count, unit_purchase_price: unitPrice,
        currency, unit_cost_krw: unitCost, image_url: url
      };
    });
    const { data: created, error: createError } = await sb.rpc("create_sale_random_box", {
      p_title: title, p_image_url: imageUrl, p_members: members
    });
    if (createError) throw createError;
    return NextResponse.json({ ok: true, id: created });
  } catch (e) {
    const description = message(e);
    return NextResponse.json({ ok: false, message: description }, { status: /duplicate|unique|이미 다른|중복/.test(description) ? 409 : 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!isUuid(body.id)) return NextResponse.json({ ok: false, message: "랜덤박스 ID 오류" }, { status: 400 });
    const sb = createServiceRoleClient();
    const { data, error } = await sb.rpc("update_sale_random_box", {
      p_id: body.id,
      p_title: String(body.title || "").slice(0, 200),
      p_image_url: String(body.image_url || ""),
      p_sale_memo: String(body.sale_memo || ""),
      p_public_comment: String(body.public_comment || "").slice(0, 100),
      p_sale_price: body.sale_price === "" || body.sale_price == null ? null : Number(body.sale_price),
      p_view_status: body.view_status || "display"
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data });
  } catch (e) {
    return NextResponse.json({ ok: false, message: message(e) }, { status: 400 });
  }
}
