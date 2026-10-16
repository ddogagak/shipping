import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const DEFAULT_EXCLUDED = ["야생", "용자", "소장", "양도", "양고"];
const SHIPPING_KEYWORDS = ["배송비", "배송료", "택배비", "送料", "shipping fee", "shipping cost", "delivery fee", "postage"];
const DEFAULT_KEYWORDS = [...DEFAULT_EXCLUDED, ...SHIPPING_KEYWORDS];
const INITIAL_SETTLED_AMOUNT = 17232999;

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
  return { key, sales: 0, order_count: 0, item_count: 0, order_ids: new Set<string>(), items: new Map<string, any>(), buyers: new Map<string, any>(), sales_rows: [] as any[] };
}
function addItem(group: Map<string, any>, item: any, orderId: string) {
  const itemName = String(item.item_name || "").trim() || "(상품명 없음)";
  const key = itemName.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
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
    const orderId = String(order.id);
    const row = { id: String(item.id), order_id: orderId, item_name: item.item_name, item_price: money(item.item_price), buyer_nickname: buyerName, ordered_at: order.ordered_at };
    bucket.sales += row.item_price;
    bucket.item_count += 1;
    bucket.order_ids.add(orderId);
    bucket.sales_rows.push(row);
    addItem(bucket.items, item, orderId);
    addBuyer(bucket.buyers, buyerName, item, orderId);
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
    buyers: serializeBuyers(bucket.buyers),
    sales_rows: bucket.sales_rows.sort((a: any, b: any) => String(b.ordered_at).localeCompare(String(a.ordered_at)))
  })).sort((a, b) => b.key.localeCompare(a.key));
}

async function readSettings() {
  const db = createServiceRoleClient();
  const [{ data: settings, error }, { data: itemSettings, error: itemError }] = await Promise.all([
    db.from("sales_management_settings").select("id,cumulative_settled_amount,excluded_keywords,updated_at").eq("id", "main").maybeSingle(),
    db.from("sales_management_item_setting").select("wise_stock_id,include_cost,memo,is_deleted,updated_at")
  ]);
  if (error) throw error;
  if (itemError) throw itemError;
  return {
    cumulative_settled_amount: money(settings?.cumulative_settled_amount ?? INITIAL_SETTLED_AMOUNT),
    excluded_keywords: Array.isArray(settings?.excluded_keywords) ? settings.excluded_keywords.map((x: unknown) => String(x)) : DEFAULT_KEYWORDS,
    item_settings: (itemSettings || []).map((row: any) => ({
      id: String(row.wise_stock_id),
      includeCost: row.include_cost !== false,
      memo: String(row.memo || ""),
      deleted: row.is_deleted === true
    })),
    updated_at: settings?.updated_at || null
  };
}

async function buildReport(excludedKeywords: string[]) {
  const terms = excludedKeywords.map(term => term.toLowerCase());
  const itemRows = await readAll("domestic_wise_item_photo", "wise_stock_id,wise_order_id,buyer_nickname,ordered_at,item_name,item_price,imported_at");
  const orders = new Map<string, any>();
  let lastImportedAt = "";
  for (const row of itemRows) {
    const id = String(row.wise_order_id || "");
    if (!id) continue;
    const order = orders.get(id) || { id, buyer_nickname: row.buyer_nickname || "", ordered_at: row.ordered_at, items: [] };
    order.items.push({ id: String(row.wise_stock_id), item_name: String(row.item_name || ""), item_price: money(row.item_price) });
    orders.set(id, order);
    const imported = String(row.imported_at || "");
    if (imported > lastImportedAt) lastImportedAt = imported;
  }

  const monthly = new Map<string, any>();
  const quarterly = new Map<string, any>();
  const allTimeSalesRows: any[] = [];
  let excludedItemCount = 0;
  let includedOrderCount = 0;
  let includedItemCount = 0;
  let wiseGrossTotal = 0;
  for (const order of orders.values()) {
    wiseGrossTotal += order.items.reduce((sum: number, item: any) => sum + money(item.item_price), 0);
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
    for (const item of items) {
      allTimeSalesRows.push({ id: String(item.id), order_id: String(order.id), item_name: item.item_name, item_price: money(item.item_price), buyer_nickname: buyerName, ordered_at: order.ordered_at });
    }
  }
  return {
    ok: true,
    monthly: serialize(monthly),
    quarterly: serialize(quarterly),
    all_time_sales_rows: allTimeSalesRows.sort((a, b) => String(b.ordered_at).localeCompare(String(a.ordered_at))),
    excluded_item_count: excludedItemCount,
    included_order_count: includedOrderCount,
    included_item_count: includedItemCount,
    imported_order_count: orders.size,
    last_imported_at: lastImportedAt || null,
    wise_gross_total: wiseGrossTotal
  };
}
function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "매출관리 자료를 처리하지 못했습니다.";
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function GET() {
  try {
    const settings = await readSettings();
    const report = await buildReport(settings.excluded_keywords);
    return NextResponse.json({ ...report, settings });
  } catch (error) {
    return responseError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body, "excluded_keywords")) {
      if (!Array.isArray(body.excluded_keywords)) return NextResponse.json({ ok: false, message: "제외 키워드 목록이 올바르지 않습니다." }, { status: 400 });
      patch.excluded_keywords = Array.from(new Set(body.excluded_keywords.map((x: unknown) => String(x || "").normalize("NFKC").trim().slice(0, 80)).filter(Boolean))).slice(0, 100);
    }
    if (Object.prototype.hasOwnProperty.call(body, "cumulative_settled_amount")) {
      const amount = Number(body.cumulative_settled_amount);
      if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ ok: false, message: "누적 정산금액은 0 이상의 숫자로 입력해 주세요." }, { status: 400 });
      patch.cumulative_settled_amount = Math.round(amount * 100) / 100;
    }
    if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, message: "저장할 설정이 없습니다." }, { status: 400 });
    const db = createServiceRoleClient();
    const { data, error } = await db.from("sales_management_settings").upsert({ id: "main", ...patch }, { onConflict: "id" }).select("id,cumulative_settled_amount,excluded_keywords,updated_at").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return responseError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.item_settings)) return NextResponse.json({ ok: false, message: "저장할 아이템 설정이 없습니다." }, { status: 400 });
    const rows = body.item_settings.map((row: any) => ({
      wise_stock_id: Number(row.id),
      include_cost: row.includeCost !== false,
      memo: String(row.memo || "").slice(0, 2000),
      is_deleted: row.deleted === true,
      updated_at: new Date().toISOString()
    })).filter((row: any) => Number.isSafeInteger(row.wise_stock_id) && row.wise_stock_id > 0);
    if (rows.length !== body.item_settings.length) return NextResponse.json({ ok: false, message: "아이템 식별자가 올바르지 않습니다." }, { status: 400 });
    if (rows.length) {
      const db = createServiceRoleClient();
      const { error } = await db.from("sales_management_item_setting").upsert(rows, { onConflict: "wise_stock_id" });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, saved_count: rows.length });
  } catch (error) {
    return responseError(error);
  }
}
