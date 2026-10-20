import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";
import { resolveInventorySku, uniqueInventoryBySku } from "@/lib/inventory/match-by-sku";
import { buildInternalSku, getSeriesCode, getSourceProductKey, getSourceSiteCode } from "@/lib/inventory/internal-sku";

export const runtime = "nodejs";

const EXCHANGE_RATE: Record<string, number> = { JPY: 10, CNY: 230, KRW: 1 };
const HIDDEN_MARKER = "[[HIDDEN]]";

function pricingFromPurchase(unitPrice: number, currency: string, componentCountRaw: unknown) {
  const purchase = Math.max(0, Number(unitPrice || 0));
  const componentCount = Math.max(0, Math.trunc(Number(componentCountRaw || 0)));
  const boxCost = currency === "KRW"
    ? Math.round(purchase)
    : purchase > 0
      ? Math.round(purchase * (EXCHANGE_RATE[currency] ?? EXCHANGE_RATE.CNY) * 1.2 + 5000)
      : 0;
  const minimumMarginPrice = boxCost > 0 ? (currency === "KRW" ? Math.ceil(boxCost / 0.69) : Math.round(boxCost * 1.1 * 1.07 + 10000)) : 0;
  return {
    boxCost,
    componentCount,
    minimumMarginPrice,
    unitCostPrice: componentCount > 0 ? Math.ceil(boxCost / componentCount) : 0,
    unitSalePrice: componentCount > 0 ? Math.ceil(minimumMarginPrice / componentCount) : 0,
  };
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error
    ? e.message
    : e && typeof e === "object" && "message" in e
      ? String((e as any).message || fallback)
      : fallback;
}

function resolvedSku(row: any) {
  const existing = String(row?.internal_sku || "").trim();
  if (existing) return existing;
  const sourceUrl = String(row?.source_url || "").trim();
  const siteCode = String(row?.source_site_code || "").trim() || (sourceUrl ? getSourceSiteCode(sourceUrl) : "");
  const productId = String(row?.source_product_id || "").trim() || (sourceUrl ? getSourceProductKey(sourceUrl) : "");
  if (!siteCode || !productId || productId === "UNKNOWN") return null;
  return buildInternalSku({
    sourceSiteCode: siteCode,
    seriesCode: getSeriesCode(row?.series_name),
    productId,
    optionSeq: Number(row?.option_seq ?? 0),
  });
}

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const [
      { data: orders, error },
      { data: sourcingRows, error: sourcingError },
      { data: ledgers, error: ledgerError },
    ] = await Promise.all([
      sb.from("purchase_orders")
        .select("id,order_number,ordered_at,shop_name,currency,source_site,paid_amount,local_shipping,raw_data,purchase_items(*)")
        .eq("order_status", "입고완료")
        .order("ordered_at", { ascending: false }),
      sb.from("inventory_items")
        .select("id,item_name,item_type,series_name,image_url,lineup_image_url,source_url,memo,currency,purchase_price,total_price,component_count,unit_sale_price,internal_sku,source_product_id,source_site_code,option_seq"),
      sb.from("purchase_sale_inventory").select("*"),
    ]);

    if (error) throw error;
    if (sourcingError) throw sourcingError;
    if (ledgerError) throw ledgerError;

    const sourcingBySku = uniqueInventoryBySku(sourcingRows ?? []);
    const sourcingById = new Map<string, any>();
    const byProductId = new Map<string, any[]>();
    const byUrl = new Map<string, any[]>();

    for (const raw of sourcingRows ?? []) {
      const row = { ...raw, resolved_internal_sku: resolvedSku(raw) };
      sourcingById.set(String(row.id), row);
      const productId = String(row.source_product_id || "").trim() || extractSourceProductId(row.source_url) || "";
      if (productId) byProductId.set(productId, [...(byProductId.get(productId) || []), row]);
      const url = String(row.source_url || "").trim();
      if (url) byUrl.set(url, [...(byUrl.get(url) || []), row]);
    }

    const ledgerByItemId = new Map((ledgers ?? []).map((r: any) => [String(r.purchase_item_id), r]));
    const completedRepairs: PromiseLike<any>[] = [];

    const items = (orders ?? []).flatMap((order: any) =>
      (order.purchase_items ?? []).map((item: any) => {
        const productId = String(item.source_product_id || "").trim() || extractSourceProductId(item.product_url) || "";
        const fixedSku = String(item.internal_sku || "").trim();
        // A stored SKU always wins. Never silently fall back to an unrelated source.
        let sourcing = fixedSku ? (sourcingBySku.get(fixedSku) || null) : (item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null);
        const productCandidates = productId ? (byProductId.get(productId) || []) : [];
        const urlCandidates = byUrl.get(String(item.product_url || "").trim()) || [];

        if (!fixedSku && !sourcing) {
          if (productCandidates.length === 1) sourcing = productCandidates[0];
          else if (urlCandidates.length === 1) sourcing = urlCandidates[0];
          else {
            const candidates = productCandidates.length ? productCandidates : urlCandidates;
            const optionText = String(item.option_text || "").trim();
            const optionNumber = Number((optionText.match(/(?:옵션|option)?\s*#?\s*(\d+)/i) || [])[1] || NaN);
            if (Number.isFinite(optionNumber)) {
              sourcing = candidates.find((r: any) => Number(r.option_seq) === optionNumber) || null;
            }
          }
        }

        const domesticMeta = (order.raw_data?.domestic_items || []).find(
          (meta: any) =>
            String(meta.product_name || "") === String(item.product_name || "") &&
            String(meta.option_text || "") === String(item.option_text || ""),
        );
        const ledger: any = ledgerByItemId.get(String(item.id));
        const isDomestic = String(order.source_site || "") === "Domestic" || String(order.currency || "").toUpperCase() === "KRW";
        const storedReceived = Math.max(0, Number(item.received_quantity ?? 0));
        const boxQuantity = isDomestic && storedReceived === 0
          ? Math.max(0, Number(item.quantity ?? domesticMeta?.quantity ?? 0))
          : storedReceived;
        const purchaseCurrency = String(order.currency || "CNY").toUpperCase();
        const actualPurchaseUnitPrice = Number(item.unit_price || 0);
        const pricing = pricingFromPurchase(
          actualPurchaseUnitPrice,
          purchaseCurrency,
          item.component_count ?? domesticMeta?.component_count ?? sourcing?.component_count,
        );
        // For a uniquely matched SKU, sourcing owns the canonical image.
        // Unmatched/duplicate SKU and no-SKU items keep their currently stored image.
        const imageUrl = fixedSku && sourcing?.image_url
          ? sourcing.image_url
          : item.image_url || domesticMeta?.image_url || (!fixedSku ? sourcing?.image_url : null) || null;
        const defaultViewStatus = imageUrl ? "display" : "hidden";

        // 기존에 이미 완료 처리된 항목도 판매박스=입고박스, 재고=0으로 실제 DB를 보정한다.
        if (
          ledger?.stock_status === "soldout" &&
          (Number(ledger.sold_quantity || 0) !== boxQuantity || Number(ledger.remaining_quantity || 0) !== 0)
        ) {
          ledger.sold_quantity = boxQuantity;
          ledger.remaining_quantity = 0;
          completedRepairs.push(
            sb.from("purchase_sale_inventory")
              .update({ sold_quantity: boxQuantity, remaining_quantity: 0 })
              .eq("purchase_item_id", item.id)
              .then(({ error: repairError }) => {
                if (repairError) throw repairError;
              }),
          );
        }

        return {
          id: item.id,
          order_id: order.id,
          order_number: order.order_number,
          ordered_at: order.ordered_at,
          shop_name: order.shop_name,
          product_name: item.product_name,
          display_name: item.display_name_ko || sourcing?.item_name || item.product_name,
          internal_sku: fixedSku || sourcing?.resolved_internal_sku || null,
          option_text: item.option_text,
          product_url: item.product_url,
          purchase_quantity: boxQuantity,
          actual_purchase_unit_price: actualPurchaseUnitPrice,
          can_fill_purchase_price: item.unit_price == null || Number(item.unit_price) === 0,
          actual_purchase_currency: purchaseCurrency,
          order_paid_amount: Number(order.paid_amount || 0),
          order_local_shipping: Number(order.local_shipping || 0),
          sourcing_inventory_id: sourcing?.id || (fixedSku ? item.sourcing_inventory_id : null) || null,
          image_url: imageUrl,
          lineup_image_url: sourcing?.lineup_image_url || domesticMeta?.lineup_image_url || null,
          series_name: sourcing?.series_name || domesticMeta?.series_name || null,
          item_type: sourcing?.item_type || domesticMeta?.item_type || null,
          memo: sourcing?.memo || domesticMeta?.memo || null,
          sourcing_currency: sourcing?.currency || null,
          sourcing_purchase_price: Number(sourcing?.purchase_price || 0),
          component_count: pricing.componentCount,
          box_cost_price: pricing.boxCost,
          minimum_margin_price: pricing.minimumMarginPrice,
          unit_cost_price: pricing.unitCostPrice,
          recommended_unit_sale_price: pricing.unitSalePrice,
          sale_price: ledger?.sale_price ?? null,
          remaining_quantity: ledger ? Number(ledger.remaining_quantity || 0) : boxQuantity,
          sold_quantity: ledger ? Number(ledger.sold_quantity || 0) : 0,
          stock_status: ledger?.stock_status || "active",
          view_status: ledger?.stock_status === "soldout"
            ? "completed"
            : String(ledger?.sale_memo || "").startsWith(HIDDEN_MARKER)
              ? "hidden"
              : ledger
                ? "display"
                : defaultViewStatus,
          sale_memo: String(ledger?.sale_memo || "").replace(HIDDEN_MARKER, ""),
          public_comment: String(ledger?.public_comment || "").replace(/[\r\n\t]+/g, " ").trim(),
          sold_out_at: ledger?.sold_out_at || null,
        };
      }),
    );

    if (completedRepairs.length) await Promise.all(completedRepairs);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: errorMessage(e, "판매재고 조회 실패") },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.purchase_item_id) {
      return NextResponse.json({ ok: false, message: "상품 ID가 없습니다." }, { status: 400 });
    }

    const sb = createServiceRoleClient();
    // Missing import prices are stored as either NULL or 0. Fill once only.
    if (body.action === "fill_missing_purchase_price") {
      const value = body.unit_price;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return NextResponse.json({ ok: false, message: "0보다 큰 매입가를 입력해 주세요." }, { status: 400 });
      }
      const { data: item, error: readError } = await sb.from("purchase_items")
        .select("id,quantity,unit_price").eq("id", body.purchase_item_id).maybeSingle();
      if (readError) throw readError;
      if (!item) return NextResponse.json({ ok: false, message: "상품을 찾을 수 없습니다." }, { status: 404 });
      if (item.unit_price != null && Number(item.unit_price) !== 0) {
        return NextResponse.json({ ok: false, message: "이미 매입가가 있는 상품은 수정할 수 없습니다." }, { status: 409 });
      }
      const lineTotal = value * Number(item.quantity ?? 0);
      if (!Number.isFinite(lineTotal)) return NextResponse.json({ ok: false, message: "매입가가 너무 큽니다." }, { status: 400 });
      // The conditional write also prevents concurrent requests from overwriting a filled price.
      const { data: updated, error: updateError } = await sb.from("purchase_items")
        .update({ unit_price: value, line_total: lineTotal })
        .eq("id", body.purchase_item_id).or("unit_price.is.null,unit_price.eq.0")
        .select("id,unit_price").maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return NextResponse.json({ ok: false, message: "다른 작업에서 이미 매입가를 입력했습니다. 새로고침해 주세요." }, { status: 409 });
      return NextResponse.json({ ok: true, unit_price: updated.unit_price });
    }
    const hasImage = Object.prototype.hasOwnProperty.call(body, "image_url");
    const imageUrl = hasImage ? (String(body.image_url || "").trim() || null) : undefined;
    const hasDisplayName = Object.prototype.hasOwnProperty.call(body, "display_name");
    const displayName = hasDisplayName ? (String(body.display_name || "").trim() || null) : undefined;
    const hasComponentCount = Object.prototype.hasOwnProperty.call(body, "component_count");
    const componentCount = hasComponentCount
      ? Math.max(0, Math.trunc(Number(body.component_count || 0)))
      : undefined;

    if (hasDisplayName) {
      const { error } = await sb.from("purchase_items")
        .update({ display_name_ko: displayName })
        .eq("id", body.purchase_item_id);
      if (error) throw error;
    }

    if (hasImage) {
      // Image changes must only affect the explicitly selected purchase item.
      // Never update all items sharing a name or overwrite sourcing images.
      const { error } = await sb.from("purchase_items")
        .update({ image_url: imageUrl })
        .eq("id", body.purchase_item_id);
      if (error) throw error;
    }

    if (hasComponentCount && body.sourcing_inventory_id) {
      const pricing = pricingFromPurchase(
        Number(body.actual_purchase_unit_price || 0),
        String(body.actual_purchase_currency || "CNY"),
        componentCount,
      );
      const { error } = await sb.from("inventory_items")
        .update({ component_count: componentCount || null, unit_sale_price: pricing.unitSalePrice || null })
        .eq("id", body.sourcing_inventory_id);
      if (error) throw error;
    }

    const received = Math.max(0, Math.trunc(Number(body.purchase_quantity ?? 0)));
    const viewStatus = ["display", "hidden", "completed"].includes(String(body.view_status))
      ? String(body.view_status)
      : body.stock_status === "soldout"
        ? "completed"
        : "display";

    // 완료로 저장하는 순간 판매박스를 입고박스와 동일하게 맞추고 재고를 0으로 만든다.
    const requestedSold = Math.max(0, Math.trunc(Number(body.sold_quantity ?? 0)));
    const sold = viewStatus === "completed" ? received : requestedSold;
    const remaining = viewStatus === "completed" ? 0 : Math.max(0, received - sold);
    const status = viewStatus === "completed" ? "soldout" : "active";
    const cleanMemo = String(body.sale_memo || "").replace(HIDDEN_MARKER, "").trim();
    const cleanPublicComment = String(body.public_comment || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 100);
    const storedMemo = viewStatus === "hidden" ? `${HIDDEN_MARKER}${cleanMemo}` : (cleanMemo || null);
    const payload = {
      purchase_item_id: body.purchase_item_id,
      sale_price: body.sale_price === "" || body.sale_price == null ? null : Number(body.sale_price),
      remaining_quantity: remaining,
      sold_quantity: sold,
      stock_status: status,
      sale_memo: storedMemo,
      public_comment: cleanPublicComment || null,
      sold_out_at: status === "soldout" ? (body.sold_out_at || new Date().toISOString()) : null,
    };

    const { error: quantityError } = await sb.from("purchase_items")
      .update({ received_quantity: received })
      .eq("id", body.purchase_item_id);
    if (quantityError) throw quantityError;

    const { data, error } = await sb.from("purchase_sale_inventory")
      .upsert(payload, { onConflict: "purchase_item_id" })
      .select()
      .single();
    if (error) throw error;

    const responseData = {
      ...data,
      purchase_quantity: received,
      sold_quantity: sold,
      remaining_quantity: remaining,
      view_status: viewStatus,
      sale_memo: cleanMemo,
      public_comment: cleanPublicComment,
    };
    const pricing = pricingFromPurchase(
      Number(body.actual_purchase_unit_price || 0),
      String(body.actual_purchase_currency || "CNY"),
      componentCount ?? body.component_count,
    );

    return NextResponse.json({
      ok: true,
      item: {
        ...responseData,
        ...(hasImage ? { image_url: imageUrl } : {}),
        ...(hasDisplayName ? { display_name: displayName } : {}),
        ...(hasComponentCount
          ? {
              component_count: pricing.componentCount,
              box_cost_price: pricing.boxCost,
              minimum_margin_price: pricing.minimumMarginPrice,
              unit_cost_price: pricing.unitCostPrice,
              recommended_unit_sale_price: pricing.unitSalePrice,
            }
          : {}),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: errorMessage(e, "판매재고 저장 실패") },
      { status: 500 },
    );
  }
}
