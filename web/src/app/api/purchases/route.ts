import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";

export const runtime = "nodejs";

function sourcingPrice(row: any) {
  const values = [row?.purchase_price, row?.total_price];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function chooseCandidate(candidates: any[], purchaseUnitPrice: unknown) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const target = Number(purchaseUnitPrice);
  const ordered = [...candidates].sort((a, b) => Number(a.option_seq ?? 0) - Number(b.option_seq ?? 0));
  if (!Number.isFinite(target) || target <= 0) return ordered[0];
  let best: any = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const row of ordered) {
    const price = sourcingPrice(row);
    if (price == null) continue;
    const diff = Math.abs(price - target);
    if (diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best || ordered[0];
}

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const [{ data, error }, { data: sourcingRows, error: sourcingError }] = await Promise.all([
      sb.from("purchase_orders").select(`*,purchase_items(*),purchase_costs(*),purchase_files(*)`).order("ordered_at", { ascending: false }),
      sb.from("inventory_items").select("id,item_name,item_type,series_name,image_url,lineup_image_url,source_url,memo,internal_sku,source_product_id,option_seq,purchase_price,total_price"),
    ]);
    if (error) throw error;
    if (sourcingError) throw sourcingError;

    const sourcingById = new Map<string, any>();
    const byProductId = new Map<string, any[]>();
    for (const row of sourcingRows ?? []) {
      sourcingById.set(String(row.id), row);
      const productId = String(row.source_product_id || "").trim() || extractSourceProductId(row.source_url) || "";
      if (productId) byProductId.set(productId, [...(byProductId.get(productId) || []), row]);
    }

    const linkUpdates: PromiseLike<unknown>[] = [];
    const orders = (data ?? []).map((order: any) => ({
      ...order,
      purchase_items: (order.purchase_items ?? []).map((item: any) => {
        // Product ID is the hard boundary. Price is used ONLY to choose an option
        // among sourcing rows that belong to this exact same product ID.
        const productId = extractSourceProductId(item.product_url) || String(item.source_product_id || "").trim() || "";
        const current = item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null;
        const currentProductId = current ? (String(current.source_product_id || "").trim() || extractSourceProductId(current.source_url) || "") : "";
        const currentIsSameProduct = Boolean(current && productId && currentProductId === productId);
        const sameProductCandidates = productId ? (byProductId.get(productId) || []) : [];
        const sourcing = currentIsSameProduct ? current : chooseCandidate(sameProductCandidates, item.unit_price);

        const resolvedSourceProductId = productId || null;
        const resolvedSourcingId = sourcing?.id || null;
        const resolvedInternalSku = sourcing?.internal_sku || null;

        const linkChanged =
          String(item.sourcing_inventory_id || "") !== String(resolvedSourcingId || "") ||
          String(item.source_product_id || "") !== String(resolvedSourceProductId || "") ||
          String(item.internal_sku || "") !== String(resolvedInternalSku || "");

        if (linkChanged) {
          linkUpdates.push(
            sb.from("purchase_items").update({
              sourcing_inventory_id: resolvedSourcingId,
              source_product_id: resolvedSourceProductId,
              internal_sku: resolvedInternalSku,
            }).eq("id", item.id).then(({ error: updateError }) => {
              if (updateError) console.error("purchase sourcing link persist failed", item.id, updateError);
            })
          );
        }

        return {
          ...item,
          source_product_id: resolvedSourceProductId,
          sourcing_inventory_id: resolvedSourcingId,
          internal_sku: resolvedInternalSku,
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

    if (linkUpdates.length) await Promise.all(linkUpdates);
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
