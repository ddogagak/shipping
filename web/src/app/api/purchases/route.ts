import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const [{ data, error }, { data: sourcingRows, error: sourcingError }] = await Promise.all([
      sb.from("purchase_orders").select(`*,purchase_items(*),purchase_costs(*),purchase_files(*)`).order("ordered_at", { ascending: false }),
      sb.from("inventory_items").select("id,item_name,item_type,series_name,image_url,lineup_image_url,source_url,memo,internal_sku,source_product_id"),
    ]);
    if (error) throw error;
    if (sourcingError) throw sourcingError;

    const sourcingByProductId = new Map<string, any>();
    const duplicateProductIds = new Set<string>();
    const sourcingById = new Map<string, any>();
    for (const row of sourcingRows ?? []) {
      sourcingById.set(String(row.id), row);
      const productId = String(row.source_product_id || "").trim() || extractSourceProductId(row.source_url) || "";
      if (productId) {
        if (sourcingByProductId.has(productId)) duplicateProductIds.add(productId);
        else sourcingByProductId.set(productId, row);
      }
    }

    const orders = (data ?? []).map((order: any) => ({
      ...order,
      purchase_items: (order.purchase_items ?? []).map((item: any) => {
        const productId = String(item.source_product_id || "").trim() || extractSourceProductId(item.product_url) || "";
        const sourcing = (item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null) ||
          (productId && !duplicateProductIds.has(productId) ? sourcingByProductId.get(productId) : null) || null;
        return {
          ...item,
          source_product_id: item.source_product_id || productId || null,
          sourcing_inventory_id: item.sourcing_inventory_id || sourcing?.id || null,
          internal_sku: item.internal_sku || sourcing?.internal_sku || null,
          matched_name_ko: sourcing?.item_name || null,
          display_name_ko: item.display_name_ko || sourcing?.item_name || null,
          matched_image_url: sourcing?.image_url || null,
          matched_lineup_image_url: sourcing?.lineup_image_url || null,
          matched_series_name: sourcing?.series_name || null,
          matched_item_type: sourcing?.item_type || null,
          matched_memo: sourcing?.memo || null,
        };
      }),
    }));
    return NextResponse.json({ ok: true, orders });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "매입 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const sb = createServiceRoleClient();
    if (body.item_id) {
      const updateData: Record<string, unknown> = {};
      if (body.display_name_ko !== undefined) updateData.display_name_ko = String(body.display_name_ko || "").trim() || null;
      if (body.option_text !== undefined) updateData.option_text = String(body.option_text || "").trim() || null;
      if (body.quantity !== undefined) updateData.quantity = Math.max(1, Number(body.quantity || 1));
      if (body.product_url !== undefined) updateData.product_url = String(body.product_url || "").trim() || null;
      if (body.sourcing_inventory_id !== undefined) updateData.sourcing_inventory_id = body.sourcing_inventory_id || null;
      if (body.source_product_id !== undefined) updateData.source_product_id = body.source_product_id || null;
      if (body.internal_sku !== undefined) updateData.internal_sku = String(body.internal_sku || "").trim() || null;
      const { data: item, error: itemError } = await sb.from("purchase_items").update(updateData).eq("id", body.item_id).select().single();
      if (itemError) throw itemError;
      return NextResponse.json({ ok: true, item });
    }
    if (!body.id) return NextResponse.json({ ok: false, message: "매입 주문 ID가 없습니다." }, { status: 400 });
    const updateData: Record<string, unknown> = {};
    if (body.order_number !== undefined) updateData.order_number = String(body.order_number || "").trim();
    if (body.order_status !== undefined) updateData.order_status = body.order_status;
    if (body.tracking_company !== undefined) updateData.tracking_company = String(body.tracking_company || "").trim() || null;
    if (body.tracking_number !== undefined) updateData.tracking_number = String(body.tracking_number || "").trim() || null;
    if (body.memo !== undefined) updateData.memo = String(body.memo || "").trim() || null;
    const trackingNumber = String(body.tracking_number || "").trim();
    const requestedStatus = String(body.order_status || "주문완료");
    if (trackingNumber && requestedStatus === "주문완료") updateData.order_status = "현지배송";
    const { data: order, error } = await sb.from("purchase_orders").update(updateData).eq("id", body.id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "매입 정보를 수정하지 못했습니다." }, { status: 500 });
  }
}
