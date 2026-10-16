import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const EXCLUDED = ["야생", "용자", "소장", "양도", "양고"];

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
  return { key, sales: 0, order_count: 0, purchases: {} as Record<string, number> };
}
function addPurchase(row: any, key: string, target: Map<string, any>) {
  if (!key || String(row.order_status || "").trim() === "취소") return;
  const currency = String(row.currency || "UNKNOWN").toUpperCase();
  const value = money(row.paid_amount) + money(row.local_shipping);
  const bucket = target.get(key) || blank(key);
  bucket.purchases[currency] = (bucket.purchases[currency] || 0) + value;
  target.set(key, bucket);
}

export async function GET() {
  try {
    const [salesRows, purchaseRows] = await Promise.all([
      readAll("domestic_wise_sales_order", "buyer_nickname,ordered_at,total_amount,item_names,imported_at"),
      readAll("purchase_orders", "ordered_at,paid_amount,local_shipping,currency,order_status")
    ]);
    const monthly = new Map<string, any>();
    const quarterly = new Map<string, any>();
    let excludedOrderCount = 0;
    let lastImportedAt = "";
    for (const row of salesRows) {
      const date = kstDate(row.ordered_at);
      if (!date) continue;
      const imported = String(row.imported_at || "");
      if (imported && imported > lastImportedAt) lastImportedAt = imported;
      const haystack = [row.buyer_nickname, ...(Array.isArray(row.item_names) ? row.item_names : [])].join(" ").normalize("NFKC");
      if (EXCLUDED.some(keyword => haystack.includes(keyword))) {
        excludedOrderCount++;
        continue;
      }
      const monthKey = date.slice(0, 7);
      const quarterKey = date.slice(0, 4) + "-Q" + (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1);
      for (const [map, key] of [[monthly, monthKey], [quarterly, quarterKey]] as const) {
        const bucket = map.get(key) || blank(key);
        bucket.sales += money(row.total_amount);
        bucket.order_count += 1;
        map.set(key, bucket);
      }
    }
    for (const row of purchaseRows) {
      const date = kstDate(row.ordered_at);
      if (!date) continue;
      const monthKey = date.slice(0, 7);
      const quarterKey = date.slice(0, 4) + "-Q" + (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1);
      addPurchase(row, monthKey, monthly);
      addPurchase(row, quarterKey, quarterly);
    }
    const sort = (map: Map<string, any>) => Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
    return NextResponse.json({
      ok: true,
      monthly: sort(monthly),
      quarterly: sort(quarterly),
      excluded_order_count: excludedOrderCount,
      sales_order_count: salesRows.length - excludedOrderCount,
      last_imported_at: lastImportedAt || null,
      excluded_keywords: EXCLUDED
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "매출 자료를 불러오지 못했습니다.";
    const migrationRequired = /domestic_wise_sales_order|does not exist|schema cache/i.test(message);
    return NextResponse.json({
      ok: false,
      migration_required: migrationRequired,
      message: migrationRequired
        ? "매출관리 DB 업데이트가 필요합니다. Supabase에서 20261016_domestic_wise_sales_orders.sql을 실행한 뒤 Wise 주문 JSON을 다시 저장해 주세요."
        : message
    }, { status: 500 });
  }
}
