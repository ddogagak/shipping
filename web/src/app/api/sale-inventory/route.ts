import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";

export const runtime = "nodejs";

const EXCHANGE_RATE: Record<string, number> = { JPY: 10, CNY: 230 };

function pricingFromPurchase(unitPrice: number, currency: string, componentCountRaw: unknown) {
  const rate = EXCHANGE_RATE[currency] ?? EXCHANGE_RATE.CNY;
  const purchase = Math.max(0, Number(unitPrice || 0));
  const componentCount = Math.max(0, Math.trunc(Number(componentCountRaw || 0)));
  const boxCost = purchase > 0 ? Math.round(purchase * rate * 1.2 + 5000) : 0;
  const minimumMarginPrice = boxCost > 0 ? Math.round(boxCost * 1.1 * 1.07 + 10000) : 0;
  const unitCostPrice = componentCount > 0 ? Math.ceil(boxCost / componentCount) : 0;
  const unitSalePrice = componentCount > 0 ? Math.ceil(minimumMarginPrice / componentCount) : 0;
  return { boxCost, componentCount, minimumMarginPrice, unitCostPrice, unitSalePrice };
}

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const [{ data: orders, error }, { data: sourcingRows, error: sourcingError }, { data: ledgers, error: ledgerError }] = await Promise.all([
      sb.from("purchase_orders").select("id,order_number,ordered_at,shop_name,currency,paid_amount,local_shipping,purchase_items(*)").eq("order_status", "입고완료").order("ordered_at", { ascending: false }),
      sb.from("inventory_items").select("id,item_name,item_type,series_name,image_url,lineup_image_url,source_url,memo,currency,purchase_price,total_price,component_count,unit_sale_price"),
      sb.from("purchase_sale_inventory").select("*"),
    ]);
    if (error) throw error;
    if (sourcingError) throw sourcingError;
    if (ledgerError) throw ledgerError;

    const sourcingById = new Map<string, any>();
    const sourcingByProductId = new Map<string, any>();
    for (const row of sourcingRows ?? []) {
      sourcingById.set(String(row.id), row);
      const productId = extractSourceProductId(row.source_url);
      if (productId && !sourcingByProductId.has(productId)) sourcingByProductId.set(productId, row);
    }
    const ledgerByItemId = new Map((ledgers ?? []).map((row:any)=>[String(row.purchase_item_id),row]));

    const items = (orders ?? []).flatMap((order:any)=>(order.purchase_items ?? []).map((item:any)=>{
      const productId = String(item.source_product_id || "") || extractSourceProductId(item.product_url) || "";
      const sourcing = (item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null) || (productId ? sourcingByProductId.get(productId) : null);
      const ledger:any = ledgerByItemId.get(String(item.id));
      const boxQuantity = Math.max(0, Number(item.received_quantity ?? item.quantity ?? 0));
      const purchaseCurrency = String(order.currency || "CNY").toUpperCase();
      const actualPurchaseUnitPrice = Number(item.unit_price || 0);
      const pricing = pricingFromPurchase(actualPurchaseUnitPrice, purchaseCurrency, sourcing?.component_count);

      return {
        id:item.id, order_id:order.id, order_number:order.order_number, ordered_at:order.ordered_at, shop_name:order.shop_name,
        product_name:item.product_name, display_name:item.display_name_ko || sourcing?.item_name || item.product_name,
        option_text:item.option_text, product_url:item.product_url, purchase_quantity:boxQuantity,
        actual_purchase_unit_price:actualPurchaseUnitPrice,
        actual_purchase_currency:purchaseCurrency,
        order_paid_amount:Number(order.paid_amount || 0),
        order_local_shipping:Number(order.local_shipping || 0),
        sourcing_inventory_id:sourcing?.id || null,
        image_url:item.image_url || sourcing?.image_url || null,
        lineup_image_url:sourcing?.lineup_image_url || null,
        series_name:sourcing?.series_name || null, item_type:sourcing?.item_type || null, memo:sourcing?.memo || null,
        sourcing_currency:sourcing?.currency || null,
        sourcing_purchase_price:Number(sourcing?.purchase_price || 0),
        component_count:pricing.componentCount,
        box_cost_price:pricing.boxCost,
        minimum_margin_price:pricing.minimumMarginPrice,
        unit_cost_price:pricing.unitCostPrice,
        recommended_unit_sale_price:pricing.unitSalePrice,
        sale_price:ledger?.sale_price ?? null,
        remaining_quantity:ledger ? Number(ledger.remaining_quantity || 0) : boxQuantity,
        sold_quantity:ledger ? Number(ledger.sold_quantity || 0) : 0,
        stock_status:ledger?.stock_status || "active",
        sale_memo:ledger?.sale_memo || "",
        sold_out_at:ledger?.sold_out_at || null,
      };
    }));
    return NextResponse.json({ok:true,items});
  } catch(e) {
    return NextResponse.json({ok:false,message:e instanceof Error?e.message:"판매재고 조회 실패"},{status:500});
  }
}

export async function PATCH(req:Request) {
  try {
    const body=await req.json();
    if(!body.purchase_item_id) return NextResponse.json({ok:false,message:"상품 ID가 없습니다."},{status:400});
    const sb=createServiceRoleClient();

    const hasImage = Object.prototype.hasOwnProperty.call(body, "image_url");
    const imageUrl = hasImage ? (String(body.image_url || "").trim() || null) : undefined;
    const hasDisplayName = Object.prototype.hasOwnProperty.call(body, "display_name");
    const displayName = hasDisplayName ? (String(body.display_name || "").trim() || null) : undefined;
    const hasComponentCount = Object.prototype.hasOwnProperty.call(body, "component_count");
    const componentCount = hasComponentCount ? Math.max(0, Math.trunc(Number(body.component_count || 0))) : undefined;

    if (hasImage) {
      const productName = String(body.product_name || "").trim();
      const optionText = String(body.option_text || "").trim();
      if (productName) {
        let matchingQuery = sb.from("purchase_items").update({ image_url: imageUrl }).eq("product_name", productName);
        matchingQuery = optionText ? matchingQuery.eq("option_text", optionText) : matchingQuery.or("option_text.is.null,option_text.eq.");
        const { error: matchingImageError } = await matchingQuery;
        if (matchingImageError) throw matchingImageError;
      } else {
        const { error: currentImageError } = await sb.from("purchase_items").update({ image_url: imageUrl }).eq("id", body.purchase_item_id);
        if (currentImageError) throw currentImageError;
      }
    }

    if (hasDisplayName) {
      const { error: titleError } = await sb.from("purchase_items").update({ display_name_ko: displayName }).eq("id", body.purchase_item_id);
      if (titleError) throw titleError;
    }

    if (body.sourcing_inventory_id && (hasImage || hasDisplayName || hasComponentCount)) {
      const sourcingUpdate:any = {};
      if (hasImage) sourcingUpdate.image_url = imageUrl;
      if (hasDisplayName) sourcingUpdate.item_name = displayName;
      if (hasComponentCount) sourcingUpdate.component_count = componentCount || null;
      const { error: sourcingError } = await sb.from("inventory_items").update(sourcingUpdate).eq("id", body.sourcing_inventory_id);
      if (sourcingError) throw sourcingError;
    }

    const remaining=Math.max(0,Math.trunc(Number(body.remaining_quantity ?? 0)));
    const sold=Math.max(0,Math.trunc(Number(body.sold_quantity ?? 0)));
    const status=body.stock_status === "soldout" || remaining === 0 ? "soldout" : "active";
    const payload={
      purchase_item_id:body.purchase_item_id,
      sale_price:body.sale_price === "" || body.sale_price == null ? null : Number(body.sale_price),
      remaining_quantity:remaining,
      sold_quantity:sold,
      stock_status:status,
      sale_memo:String(body.sale_memo || "").trim() || null,
      sold_out_at:status === "soldout" ? (body.sold_out_at || new Date().toISOString()) : null,
    };
    const {data,error}=await sb.from("purchase_sale_inventory").upsert(payload,{onConflict:"purchase_item_id"}).select().single();
    if(error) throw error;

    const pricing = pricingFromPurchase(Number(body.actual_purchase_unit_price || 0), String(body.actual_purchase_currency || "CNY"), componentCount ?? body.component_count);
    return NextResponse.json({ok:true,item:{...data,...(hasImage?{image_url:imageUrl}:{}),...(hasDisplayName?{display_name:displayName}:{}),...(hasComponentCount?{component_count:pricing.componentCount,box_cost_price:pricing.boxCost,minimum_margin_price:pricing.minimumMarginPrice,unit_cost_price:pricing.unitCostPrice,recommended_unit_sale_price:pricing.unitSalePrice}:{})}});
  } catch(e) {
    return NextResponse.json({ok:false,message:e instanceof Error?e.message:"판매재고 저장 실패"},{status:500});
  }
}
