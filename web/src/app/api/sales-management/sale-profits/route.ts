import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculatePricing, calculateDomesticSalePricing } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Link = { wise_stock_id: number | string; purchase_item_id: string | null; random_box_id: string | null; quantity: number };
type CostTarget = { name: string; unit_cost: number | null; kind: "purchase" | "random_box" };
const BATCH = 300;

const finitePositive = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};
const firstCount = (...candidates: unknown[]) => {
  for (const value of candidates) {
    const n = Number(value);
    if (value != null && value !== "" && Number.isSafeInteger(n) && n > 0) return n;
  }
  return 1;
};
const isUsablePrice = (value: unknown) => value != null && value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;

async function getAllLinks(sb: ReturnType<typeof createServiceRoleClient>): Promise<Link[]> {
  const all: Link[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from("wise_sale_inventory_links")
      .select("wise_stock_id,purchase_item_id,random_box_id,quantity")
      .order("wise_stock_id", { ascending: true }).range(offset, offset + 999);
    if (error) throw error;
    const rows = (data || []) as Link[];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}
async function fetchInBatches(sb: ReturnType<typeof createServiceRoleClient>, table: string, columns: string, idColumn: string, ids: string[]) {
  const rows: any[] = [];
  for (let index = 0; index < ids.length; index += BATCH) {
    const { data, error } = await sb.from(table).select(columns).in(idColumn, ids.slice(index, index + BATCH));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const links = await getAllLinks(sb);
    const purchaseIds = [...new Set(links.map(row => row.purchase_item_id).filter((id): id is string => Boolean(id)))];
    const randomBoxIds = [...new Set(links.map(row => row.random_box_id).filter((id): id is string => Boolean(id)))];

    const [purchaseItems, ledgers, randomBoxes] = await Promise.all([
      fetchInBatches(sb, "purchase_items", "id,purchase_order_id,product_name,display_name_ko,option_text,unit_price,component_count,sourcing_inventory_id", "id", purchaseIds),
      fetchInBatches(sb, "purchase_sale_inventory", "purchase_item_id,display_name,purchase_price_override,component_count_override", "purchase_item_id", purchaseIds),
      fetchInBatches(sb, "sale_random_boxes", "id,title,total_cost_krw,component_count", "id", randomBoxIds)
    ]);
    const orderIds = [...new Set(purchaseItems.map(row => String(row.purchase_order_id || "")).filter(Boolean))];
    const sourcingIds = [...new Set(purchaseItems.map(row => String(row.sourcing_inventory_id || "")).filter(Boolean))];
    const [orders, sourcing] = await Promise.all([
      fetchInBatches(sb, "purchase_orders", "id,currency,source_site,raw_data", "id", orderIds),
      fetchInBatches(sb, "inventory_items", "id,component_count", "id", sourcingIds)
    ]);

    const orderById = new Map(orders.map(row => [String(row.id), row]));
    const ledgerById = new Map(ledgers.map(row => [String(row.purchase_item_id), row]));
    const sourcingById = new Map(sourcing.map(row => [String(row.id), row]));
    const targetById = new Map<string, CostTarget>();

    for (const item of purchaseItems) {
      const ledger = ledgerById.get(String(item.id));
      const order = orderById.get(String(item.purchase_order_id));
      const fromSource = sourcingById.get(String(item.sourcing_inventory_id));
      const domesticMeta = (Array.isArray(order?.raw_data?.domestic_items) ? order.raw_data.domestic_items : [])
        .find((m: any) => String(m?.product_name || "") === String(item.product_name || "") && String(m?.option_text || "") === String(item.option_text || ""));
      const count = firstCount(ledger?.component_count_override, item.component_count, domesticMeta?.component_count, fromSource?.component_count);
      const unitPrice = finitePositive(ledger?.purchase_price_override ?? item.unit_price);
      const currency = String(order?.currency || "").toUpperCase().trim();
      let cost: number | null = null;
      if (unitPrice != null && ["KRW", "JPY", "CNY"].includes(currency)) {
        const boxCost = currency === "KRW"
          ? calculateDomesticSalePricing(unitPrice, count).costPrice
          : calculatePricing(currency, unitPrice, count).costPrice;
        if (isUsablePrice(boxCost)) cost = Math.ceil(boxCost / count);
      }
      targetById.set("purchase:" + item.id, {
        name: String(ledger?.display_name || item.display_name_ko || item.product_name || "매입상품"),
        kind: "purchase", unit_cost: cost
      });
    }

    for (const box of randomBoxes) {
      const count = firstCount(box.component_count);
      const totalCost = finitePositive(box.total_cost_krw);
      targetById.set("random_box:" + box.id, {
        name: String(box.title || "랜덤박스"), kind: "random_box",
        unit_cost: totalCost == null ? null : Math.ceil(totalCost / count)
      });
    }

    const grouped = new Map<string, {
      wise_stock_id: string; name: string[]; total_cost: number; unknown_cost: boolean;
      parts: Array<{ target_id: string; target_type: "purchase" | "random_box"; name: string; quantity: number; unit_cost: number | null }>
    }>();
    for (const row of links) {
      const stockId = String(row.wise_stock_id);
      const key = row.purchase_item_id ? "purchase:" + row.purchase_item_id : "random_box:" + row.random_box_id;
      const target = targetById.get(key);
      const quantity = firstCount(row.quantity);
      const kind = row.purchase_item_id ? "purchase" : "random_box";
      const name = target?.name || "연결된 재고를 찾을 수 없음";
      const group = grouped.get(stockId) || { wise_stock_id: stockId, name: [], total_cost: 0, unknown_cost: false, parts: [] };
      group.name.push(name);
      if (target?.unit_cost == null) group.unknown_cost = true;
      else group.total_cost += target.unit_cost * quantity;
      group.parts.push({
        target_id: String(row.purchase_item_id || row.random_box_id),
        target_type: kind, name, quantity, unit_cost: target?.unit_cost ?? null
      });
      grouped.set(stockId, group);
    }
    const matches = [...grouped.values()].map(group => ({
      wise_stock_id: group.wise_stock_id,
      target_id: group.parts.length === 1 ? group.parts[0].target_id : null,
      target_type: group.parts.length === 1 ? group.parts[0].target_type : "multiple",
      name: group.name.join(" + "),
      unit_cost: group.unknown_cost ? null : group.total_cost,
      parts: group.parts
    }));
    return NextResponse.json({
      ok: true, mapped_count: matches.length, link_count: links.length, matches
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "연결된 재고 원가 조회에 실패했어."
    }, { status: 500 });
  }
}
