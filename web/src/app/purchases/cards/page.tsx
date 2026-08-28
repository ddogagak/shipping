import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";
import PurchaseCardsClient from "./PurchaseCardsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PurchaseCardsPage() {
  const supabase = createServiceRoleClient();
  const { data: orders, error } = await supabase.from("purchase_orders").select("*, purchase_items(*)").eq("order_status", "입고완료").order("ordered_at", { ascending: false });
  if (error) return <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}><h1>입고완료 매입 카드</h1><p>{error.message}</p><Link href="/purchases">매입관리로 돌아가기</Link></main>;

  const { data: sourcingRows } = await supabase.from("inventory_items").select("id, item_name, item_type, series_name, image_url, lineup_image_url, source_url, memo, internal_sku, source_product_id");
  const sourcingById = new Map<string, any>();
  const sourcingByProductId = new Map<string, any>();
  const duplicateProductIds = new Set<string>();
  for (const row of sourcingRows ?? []) {
    sourcingById.set(String(row.id), row);
    const productId = String(row.source_product_id || "").trim() || extractSourceProductId(row.source_url) || "";
    if (productId) {
      if (sourcingByProductId.has(productId)) duplicateProductIds.add(productId);
      else sourcingByProductId.set(productId, row);
    }
  }

  const items = (orders ?? []).flatMap((order: any) => (order.purchase_items ?? []).map((item: any) => {
    const productId = String(item.source_product_id || "") || extractSourceProductId(item.product_url) || "";
    const sourcing = (item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null) || (productId && !duplicateProductIds.has(productId) ? sourcingByProductId.get(productId) : null);
    return {
      id:item.id, order_id:order.id, order_number:order.order_number, ordered_at:order.ordered_at, shop_name:order.shop_name,
      product_name:item.product_name, display_name:item.display_name_ko || sourcing?.item_name || item.product_name,
      internal_sku:item.internal_sku || sourcing?.internal_sku || null,
      option_text:item.option_text, product_url:item.product_url, quantity:item.quantity, unit_price:item.unit_price,
      image_url:item.image_url || sourcing?.image_url || null, lineup_image_url:sourcing?.lineup_image_url || null,
      series_name:sourcing?.series_name || null, item_type:sourcing?.item_type || null, memo:sourcing?.memo || null,
    };
  }));
  return <PurchaseCardsClient initialItems={items} />;
}
