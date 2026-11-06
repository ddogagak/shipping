import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculatePricing } from "@/lib/pricing";
import { extractSourceProductId } from "@/lib/purchases/product-id";
import { resolveInventorySku } from "@/lib/inventory/match-by-sku";
import { buildInternalSku, getSeriesCode, getSourceProductKey, getSourceSiteCode } from "@/lib/inventory/internal-sku";

export const runtime = "nodejs";

const HIDDEN_MARKER = "[[HIDDEN]]";

// Read the first reliable, positive number of sellable pieces.
// A missing or zero count means an individual item by default.
function resolveComponentCount(...values: unknown[]): number {
  for (const raw of values) {
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value > 0) return value;
  }
  return 1;
}

function pricingFromPurchase(unitPrice: number, currency: string, componentCountRaw: unknown) {
  const purchase = Math.max(0, Number(unitPrice || 0));
  const componentCount = resolveComponentCount(componentCountRaw);
  const foreignPricing = currency !== "KRW" && purchase > 0
    ? calculatePricing(currency, purchase, componentCount)
    : null;
  const boxCost = currency === "KRW" ? Math.round(purchase) : foreignPricing?.costPrice ?? 0;
  const minimumMarginPrice = boxCost > 0
    ? (currency === "KRW" ? Math.ceil(boxCost / 0.69) : foreignPricing!.minimumMarginPrice)
    : 0;
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
      { data: excluded, error: excludeError },
    ] = await Promise.all([
      sb.from("purchase_orders")
        .select("id,order_number,ordered_at,shop_name,currency,source_site,paid_amount,local_shipping,raw_data,purchase_items(*)")
        .eq("order_status", "입고완료")
        .order("ordered_at", { ascending: false }),
      sb.from("inventory_items")
        .select("id,item_name,item_type,series_name,image_url,lineup_image_url,source_url,memo,currency,purchase_price,total_price,component_count,unit_sale_price,internal_sku,source_product_id,source_site_code,option_seq"),
      sb.from("purchase_sale_inventory").select("*"),
      sb.from("sale_inventory_exclusions").select("purchase_item_id"),
    ]);

    if (error) throw error;
    if (sourcingError) throw sourcingError;
    if (ledgerError) throw ledgerError;
    if (excludeError) throw excludeError;
    const excludedIds = new Set((excluded ?? []).map((row: any) => String(row.purchase_item_id)));

    const sourcingBySku = new Map<string, any[]>();
    for (const row of sourcingRows ?? []) {
      const key = resolveInventorySku(row);
      if (key) sourcingBySku.set(key, [...(sourcingBySku.get(key) || []), row]);
    }
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
      (order.purchase_items ?? []).filter((item: any) => !excludedIds.has(String(item.id))).map((item: any) => {
        const productId = String(item.source_product_id || "").trim() || extractSourceProductId(item.product_url) || "";
        const fixedSku = String(item.internal_sku || "").trim();
        // A stored SKU always wins. Never silently fall back to an unrelated source.
        const skuCandidates = fixedSku ? (sourcingBySku.get(fixedSku) || []) : [];
        let sourcing = fixedSku
          ? (skuCandidates.find((row: any) => String(row.id) === String(item.sourcing_inventory_id) && row.image_url)
            || skuCandidates.find((row: any) => row.image_url)
            || skuCandidates[0]
            || null)
          : (item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null);
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
        const originalBoxQuantity = isDomestic && storedReceived === 0
          ? Math.max(0, Number(item.quantity ?? domesticMeta?.quantity ?? 0))
          : storedReceived;
        const boxQuantity = ledger?.box_quantity_override == null ? originalBoxQuantity : Math.max(0,Number(ledger.box_quantity_override));
        const purchaseCurrency = String(order.currency || "CNY").toUpperCase();
        const actualPurchaseUnitPrice = ledger?.purchase_price_override == null ? Number(item.unit_price || 0) : Number(ledger.purchase_price_override);
        const actualComponentCount = resolveComponentCount(ledger?.component_count_override, item.component_count, domesticMeta?.component_count, sourcing?.component_count);
        const pricing = pricingFromPurchase(actualPurchaseUnitPrice,purchaseCurrency,actualComponentCount);
        // For a uniquely matched SKU, sourcing owns the canonical image.
        // Unmatched/duplicate SKU and no-SKU items keep their currently stored image.
        const imageUrl = ledger?.image_url_override ?? (fixedSku && sourcing?.image_url
          ? sourcing.image_url
          : item.image_url || domesticMeta?.image_url || (!fixedSku ? sourcing?.image_url : null) || null);
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
          display_name: ledger?.display_name ?? sourcing?.item_name ?? item.display_name_ko ?? item.product_name,
          internal_sku: fixedSku || sourcing?.resolved_internal_sku || null,
          option_text: item.option_text,
          product_url: item.product_url,
          purchase_quantity: boxQuantity,
          purchase_record_quantity: Math.max(0, Number(item.quantity ?? 0)),
          purchase_record_received_quantity: storedReceived,
          purchase_record_component_count: Math.max(0, Number(item.component_count ?? 0)),
          actual_purchase_unit_price: actualPurchaseUnitPrice,
          can_fill_purchase_price: actualPurchaseUnitPrice <= 0,
          sale_price_override: ledger?.purchase_price_override ?? null,
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
    // Sale-inventory-only corrections. Never modify purchase_items or sourcing records.
    if (["reconcile_purchase_box_units","update_purchase_price","fill_missing_purchase_price"].includes(String(body.action))) {
      const mode = body.action === "reconcile_purchase_box_units" ? (body.mode === "box" ? "box" : "price") : "price";
      const input = body.next || {};
      const newPrice = Number(body.action === "reconcile_purchase_box_units" ? input.unit_price : body.unit_price);
      if (!Number.isFinite(newPrice) || newPrice <= 0 || newPrice > 10000000000)
        return NextResponse.json({ok:false,message:"0보다 큰 실제 매입가를 입력해줘."},{status:400});
      const {data:purchase,error:purchaseError}=await sb.from("purchase_items")
        .select("id,unit_price,quantity,received_quantity").eq("id",body.purchase_item_id).maybeSingle();
      if(purchaseError)throw purchaseError;
      if(!purchase)return NextResponse.json({ok:false,message:"대상 상품을 찾을 수 없어."},{status:404});
      const {data:existing,error:existingError}=await sb.from("purchase_sale_inventory")
        .select("*").eq("purchase_item_id",body.purchase_item_id).maybeSingle();
      if(existingError)throw existingError;
      const effectivePrice=Number(existing?.purchase_price_override ?? purchase.unit_price ?? 0);
      const expectedPrice=Number(body.action === "reconcile_purchase_box_units" ? body.expected?.unit_price : body.expected_unit_price ?? effectivePrice);
      if(effectivePrice !== expectedPrice)
        return NextResponse.json({ok:false,message:"다른 작업에서 매입가가 바뀌었어. 새로고침해줘."},{status:409});
      const originalQty=Number(purchase.received_quantity ?? purchase.quantity ?? 0);
      const effectiveQty=Number(existing?.box_quantity_override ?? originalQty);
      const nextQty=mode==="box" ? Number(input.quantity):effectiveQty;
      const nextComponent=mode==="box" ? Number(input.component_count) : 0;
      if(mode==="box"&&(!Number.isSafeInteger(nextQty)||nextQty<1||nextQty>1000000||
        !Number.isSafeInteger(nextComponent)||nextComponent<1||nextComponent>1000000))
        return NextResponse.json({ok:false,message:"박스 수와 구성수량은 1 이상의 정수로 입력해줘."},{status:400});
      const oldSold=Math.max(0,Number(existing?.sold_quantity ?? 0));
      const sold=existing?.stock_status==="soldout" ? nextQty : Math.min(oldSold,nextQty);
      const remaining=existing?.stock_status==="soldout" ? 0:Math.max(0,nextQty-sold);
      const changes:Record<string,unknown>={
        purchase_price_override:newPrice,
        ...(mode==="box"?{box_quantity_override:nextQty,component_count_override:nextComponent}:{}),
        sold_quantity:sold,remaining_quantity:remaining
      };
      const result=existing
        ? await sb.from("purchase_sale_inventory").update(changes).eq("purchase_item_id",body.purchase_item_id).select().single()
        : await sb.from("purchase_sale_inventory").insert({
            purchase_item_id:body.purchase_item_id,
            sale_price:null,
            stock_status:"active",
            ...changes
          }).select().single();
      const {data:updated,error:updateError}=result;
      if(updateError)throw updateError;
      return NextResponse.json({ok:true,unit_price:newPrice,item:updated});
    }
    const hasImage = Object.prototype.hasOwnProperty.call(body, "image_url");
    const imageUrl = hasImage ? (String(body.image_url || "").trim() || null) : undefined;
    const hasDisplayName = Object.prototype.hasOwnProperty.call(body, "display_name");
    const displayName = hasDisplayName ? (String(body.display_name || "").trim() || null) : undefined;
    const hasComponentCount = Object.prototype.hasOwnProperty.call(body, "component_count");
    const componentCount = hasComponentCount
      ? resolveComponentCount(body.component_count)
      : undefined;

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
      ...(hasDisplayName ? { display_name: displayName } : {}),
      ...(hasImage ? { image_url_override: imageUrl } : {}),
      ...(hasComponentCount ? { component_count_override: componentCount } : {}),
      box_quantity_override: received,
      sale_price: body.sale_price === "" || body.sale_price == null ? null : Number(body.sale_price),
      remaining_quantity: remaining,
      sold_quantity: sold,
      stock_status: status,
      sale_memo: storedMemo,
      public_comment: cleanPublicComment || null,
      sold_out_at: status === "soldout" ? (body.sold_out_at || new Date().toISOString()) : null,
    };

    // Updating only selected fields preserves sale-only cost/box overrides.
    const { data: currentLedger, error: lookupError } = await sb.from("purchase_sale_inventory")
      .select("purchase_item_id").eq("purchase_item_id",body.purchase_item_id).maybeSingle();
    if (lookupError) throw lookupError;
    const { data, error } = currentLedger
      ? await sb.from("purchase_sale_inventory").update(payload)
          .eq("purchase_item_id",body.purchase_item_id).select().single()
      : await sb.from("purchase_sale_inventory")
          .insert(payload).select().single();
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


export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.purchase_item_id || "").trim();
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) {
      return NextResponse.json({ ok: false, message: "상품 ID가 올바르지 않아." }, { status: 400 });
    }
    const sb = createServiceRoleClient();
    // Permanent removal from *sale inventory display only*. Purchase history
    // and purchase_sale_inventory ledger values are never deleted or overwritten.
    const [{ data: purchase, error: purchaseError }, { data: ledger, error: ledgerError }, { data: linked, error: linkedError }, { data: excluded, error: excludedError }] = await Promise.all([
      sb.from("purchase_items").select("id,purchase_order_id,image_url").eq("id", id).maybeSingle(),
      sb.from("purchase_sale_inventory").select("stock_status,sale_memo,image_url_override").eq("purchase_item_id", id).maybeSingle(),
      sb.from("sale_random_box_members").select("purchase_item_id").eq("purchase_item_id", id).limit(1),
      sb.from("sale_inventory_exclusions").select("purchase_item_id").eq("purchase_item_id", id).maybeSingle(),
    ]);
    if (purchaseError) throw purchaseError;
    if (ledgerError) throw ledgerError;
    if (linkedError) throw linkedError;
    if (excludedError) throw excludedError;
    if (!purchase) return NextResponse.json({ ok: false, message: "해당 상품을 찾지 못했어." }, { status: 404 });
    if (excluded) return NextResponse.json({ ok: true, already_removed: true });
    if (linked?.length) return NextResponse.json({ ok: false, message: "랜덤박스에 연결된 상품은 삭제할 수 없어." }, { status: 409 });
    if (ledger?.stock_status === "soldout") return NextResponse.json({ ok: false, message: "완료된 상품은 삭제할 수 없어." }, { status: 409 });
    const { data: order, error: orderError } = await sb.from("purchase_orders")
      .select("id,order_status").eq("id", purchase.purchase_order_id).maybeSingle();
    if (orderError) throw orderError;
    if (order?.order_status !== "입고완료") return NextResponse.json({ ok: false, message: "입고완료 상품이 아니야." }, { status: 409 });
    // For an item without a ledger, the sale-inventory GET hides it if it has no image.
    const isHidden = ledger
      ? String(ledger.sale_memo || "").startsWith(HIDDEN_MARKER)
      : !purchase.image_url;
    if (!isHidden) return NextResponse.json({ ok: false, message: "숨김 상태인 상품만 삭제할 수 있어. 먼저 숨김으로 저장해줘." }, { status: 409 });
    const { error: insertError } = await sb.from("sale_inventory_exclusions")
      .insert({ purchase_item_id: id, reason: "manual_hidden_remove" });
    if (insertError) throw insertError;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: errorMessage(e, "판매재고 삭제 실패") }, { status: 500 });
  }
}
