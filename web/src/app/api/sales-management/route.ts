import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const DEFAULT_EXCLUDED = ["야생", "용자", "소장", "양도", "양고"];
const SHIPPING_KEYWORDS = ["배송비", "배송료", "택배비", "送料", "shipping fee", "shipping cost", "delivery fee", "postage"];

async function readAll(table: string, columns: string) {
  const db = createServiceRoleClient();
  const result: any[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await db.from(table).select(columns).order("ordered_at", { ascending: false }).range(start, start + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    result.push(...rows);
    if (rows.length < pageSize) break;
  }
  return result;
}

function kstDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function blank(key: string) {
  return { key, sales: 0, order_count: 0, item_count: 0, items: new Map<string, any>(), buyers: new Map<string, any>() };
}
function addPeriod(map: Map<string, any>, key: string, order: any, items: any[]) {
  const bucket = map.get(key) || blank(key);
  const buyerName = String(order.buyer_nickname || "").trim() || "(닉네임 없음)";
  const orderTotal = items.reduce((sum, item) => sum + money(item.item_price), 0);
  bucket.sales += orderTotal;
  bucket.order_count += 1;
  bucket.item_count += items.length;
  const buyer = bucket.buyers.get(buyerName) || { buyer_nickname: buyerName, sales: 0, order_count: 0, item_count: 0, order_ids: new Set<string>() };
  buyer.sales += orderTotal;
  buyer.item_count += items.length;
  buyer.order_ids.add(String(order.id));
  bucket.buyers.set(buyerName, buyer);
  for (const item of items) {
    const itemName = String(item.item_name || "").trim() || "(상품명 없음)";
    const itemKey = itemName.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    const group = bucket.items.get(itemKey) || { item_name: itemName, quantity: 0, sales: 0 };
    group.quantity += 1;
    group.sales += money(item.item_price);
    bucket.items.set(itemKey, group);
  }
  map.set(key, bucket);
}
function serialize(map: Map<string, any>) {
  return Array.from(map.values()).map(bucket => ({
    key: bucket.key,
    sales: bucket.sales,
    order_count: bucket.order_count,
    item_count: bucket.item_count,
    items: Array.from(bucket.items.values()).sort((a: any, b: any) => b.sales - a.sales),
    buyers: Array.from(bucket.buyers.values()).map((buyer: any) => ({
      buyer_nickname: buyer.buyer_nickname,
      sales: buyer.sales,
      order_count: buyer.order_ids.size,
      item_count: buyer.item_count
    })).sort((a: any, b: any) => b.sales - a.sales)
  })).sort((a, b) => b.key.localeCompare(a.key));
}

async function buildReport(customKeywords: unknown) {
  const userKeywords = Array.isArray(customKeywords)
    ? customKeywords.map(value => String(value || "").normalize("NFKC").trim().slice(0, 80)).filter(Boolean).slice(0, 100)
    : [];
  const excludedKeywords = Array.from(new Set([...DEFAULT_EXCLUDED, ...SHIPPING_KEYWORDS, ...userKeywords]));
  const terms = excludedKeywords.map(term => term.toLowerCase());
  const [itemRows, purchaseRows] = await Promise.all([
    readAll("domestic_wise_item_photo", "wise_order_id,buyer_nickname,ordered_at,item_name,item_price,imported_at"),
    readAll("purchase_orders", "ordered_at,paid_amount,local_shipping,currency,order_status")
  ]);
  const orders = new Map<string, any>();
  let lastImportedAt = "";
  for (const row of itemRows) {
    const id = String(row.wise_order_id || "");
    if (!id) continue;
    const order = orders.get(id) || { id, buyer_nickname: row.buyer_nickname || "", ordered_at: row.ordered_at, items: [] };
    order.items.push({ item_name: String(row.item_name || ""), item_price: money(row.item_price) });
    orders.set(id, order);
    const imported = String(row.imported_at || "");
    if (imported > lastImportedAt) lastImportedAt = imported;
  }

  const monthly = new Map<string, any>();
  const quarterly = new Map<string, any>();
  const allTimeBuyers = new Map<string, any>();
  let excludedItemCount = 0;
  let includedOrderCount = 0;
  let includedItemCount = 0;
  for (const order of orders.values()) {
    const date = kstDate(order.ordered_at);
    if (!date) continue;
    const items = order.items.filter((item: any) => {
      const haystack = item.item_name.normalize("NFKC").toLowerCase();
      const excluded = terms.some(term => haystack.includes(term));
      if (excluded) excludedItemCount++;
      return !excluded;
    });
    if (!items.length) continue;
    includedOrderCount++;
    includedItemCount += items.length;
    const monthKey = date.slice(0, 7);
    const quarterKey = date.slice(0, 4) + "-Q" + (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1);
    addPeriod(monthly, monthKey, order, items);
    addPeriod(quarterly, quarterKey, order, items);
    const buyerName = String(order.buyer_nickname || "").trim() || "(닉네임 없음)";
    const buyer = allTimeBuyers.get(buyerName) || { buyer_nickname: buyerName, sales: 0, item_count: 0, order_ids: new Set<string>() };
    buyer.sales += items.reduce((sum: number, item: any) => sum + money(item.item_price), 0);
    buyer.item_count += items.length;
    buyer.order_ids.add(String(order.id));
    allTimeBuyers.set(buyerName, buyer);
  }

  const salesPeriodMaps = [monthly, quarterly];
  for (const row of purchaseRows) {
    if (String(row.order_status || "").trim() === "취소") continue;
    const date = kstDate(row.ordered_at);
    if (!date) continue;
    const monthKey = date.slice(0, 7);
    const quarterKey = date.slice(0, 4) + "-Q" + (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1);
    for (const [map, key] of [[monthly, monthKey], [quarterly, quarterKey]] as const) {
      const bucket = map.get(key) || blank(key);
      const currency = String(row.currency || "UNKNOWN").toUpperCase();
      bucket.purchases = bucket.purchases || {};
      bucket.purchases[currency] = (bucket.purchases[currency] || 0) + money(row.paid_amount) + money(row.local_shipping);
      map.set(key, bucket);
    }
  }

  return {
    ok: true,
    monthly: serialize(monthly).map((p: any) => ({ ...p, purchases: monthly.get(p.key)?.purchases || {} })),
    quarterly: serialize(quarterly).map((p: any) => ({ ...p, purchases: quarterly.get(p.key)?.purchases || {} })),
    all_time_buyers: Array.from(allTimeBuyers.values()).map((buyer: any) => ({
      buyer_nickname: buyer.buyer_nickname,
      sales: buyer.sales,
      order_count: buyer.order_ids.size,
      item_count: buyer.item_count
    })).sort((a: any, b: any) => b.sales - a.sales),
    excluded_item_count: excludedItemCount,
    included_order_count: includedOrderCount,
    included_item_count: includedItemCount,
    imported_order_count: orders.size,
    last_imported_at: lastImportedAt || null,
    excluded_keywords: excludedKeywords
  };
}

export async function GET() {
  try {
    return NextResponse.json(await buildReport([]));
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "매출 자료를 불러오지 못했습니다." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await buildReport(body?.custom_keywords));
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "매출 자료를 불러오지 못했습니다." }, { status: 500 });
  }
}
