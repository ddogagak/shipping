import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const DEFAULT_EXCLUDED = ["야생", "용자", "소장", "양도", "양고"];
const SHIPPING_KEYWORDS = ["배송비", "배송료", "택배비", "送料", "shipping fee", "shipping cost", "delivery fee", "postage"];
const DEFAULT_KEYWORDS = [...DEFAULT_EXCLUDED, ...SHIPPING_KEYWORDS];

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
function itemKey(value: unknown) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
function blank(key: string) {
  return { key, sales: 0, order_count: 0, item_count: 0, order_ids: new Set<string>(), items: new Map<string, any>(), buyers: new Map<string, any>() };
}
function addItem(group: Map<string, any>, item: any, orderId: string) {
  const itemName = String(item.item_name || "").trim() || "(상품명 없음)";
  const key = itemKey(itemName);
  const row = group.get(key) || { item_name: itemName, quantity: 0, sales: 0, order_ids: new Set<string>() };
  row.quantity += 1;
  row.sales += money(item.item_price);
  row.order_ids.add(orderId);
  group.set(key, row);
}
function addBuyer(map: Map<string, any>, buyerName: string, item: any, orderId: string) {
  const buyer = map.get(buyerName) || { buyer_nickname: buyerName, sales: 0, item_count: 0, order_ids: new Set<string>(), items: new Map<string, any>() };
  buyer.sales += money(item.item_price);
  buyer.item_count += 1;
  buyer.order_ids.add(orderId);
  addItem(buyer.items, item, orderId);
  map.set(buyerName, buyer);
}
function addPeriod(map: Map<string, any>, key: string, order: any, items: any[]) {
  const bucket = map.get(key) || blank(key);
  const buyerName = String(order.buyer_nickname || "").trim() || "(닉네임 없음)";
  for (const item of items) {
    bucket.sales += money(item.item_price);
    bucket.item_count += 1;
    bucket.order_ids.add(String(order.id));
    addItem(bucket.items, item, String(order.id));
    addBuyer(bucket.buyers, buyerName, item, String(order.id));
  }
  bucket.order_count = bucket.order_ids.size;
  map.set(key, bucket);
}
function serializeItems(items: Map<string, any>) {
  return Array.from(items.values()).map((item: any) => ({
    item_name: item.item_name,
    quantity: item.quantity,
    sales: item.sales,
    order_ids: Array.from(item.order_ids)
  })).sort((a: any, b: any) => b.sales - a.sales);
}
function serializeBuyers(buyers: Map<string, any>) {
  return Array.from(buyers.values()).map((buyer: any) => ({
    buyer_nickname: buyer.buyer_nickname,
    sales: buyer.sales,
    order_count: buyer.order_ids.size,
    item_count: buyer.item_count,
    items: serializeItems(buyer.items)
  })).sort((a: any, b: any) => b.sales - a.sales);
}
function serialize(map: Map<string, any>) {
  return Array.from(map.values()).map(bucket => ({
    key: bucket.key,
    sales: bucket.sales,
    order_count: bucket.order_ids.size,
    item_count: bucket.item_count,
    items: serializeItems(bucket.items),
    buyers: serializeBuyers(bucket.buyers)
  })).sort((a, b) => b.key.localeCompare(a.key));
}

async function buildReport(keywordInput: unknown) {
  const excludedKeywords = Array.isArray(keywordInput)
    ? Array.from(new Set(keywordInput.map(value => String(value || "").normalize("NFKC").trim().slice(0, 80)).filter(Boolean))).slice(0, 100)
    : DEFAULT_KEYWORDS;
  const terms = excludedKeywords.map(term => term.toLowerCase());
  const itemRows = await readAll("domestic_wise_item_photo", "wise_order_id,buyer_nickname,ordered_at,item_name,item_price,imported_at");
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
    for (const item of items) addBuyer(allTimeBuyers, buyerName, item, String(order.id));
  }

  return {
    ok: true,
    monthly: serialize(monthly),
    quarterly: serialize(quarterly),
    all_time_buyers: serializeBuyers(allTimeBuyers),
    excluded_item_count: excludedItemCount,
    included_order_count: includedOrderCount,
    included_item_count: includedItemCount,
    imported_order_count: orders.size,
    last_imported_at: lastImportedAt || null,
    excluded_keywords: excludedKeywords,
    default_excluded_keywords: DEFAULT_KEYWORDS
  };
}
export async function GET() {
  try {
    return NextResponse.json(await buildReport(undefined));
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "매출 자료를 불러오지 못했습니다." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = Array.isArray(body?.excluded_keywords) ? body.excluded_keywords : body?.custom_keywords;
    return NextResponse.json(await buildReport(input));
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "매출 자료를 불러오지 못했습니다." }, { status: 500 });
  }
}
