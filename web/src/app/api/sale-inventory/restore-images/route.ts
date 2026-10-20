import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { uniqueInventoryBySku } from "@/lib/inventory/match-by-sku";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allRows(sb: ReturnType<typeof createServiceRoleClient>, table: string, fields: string) {
  const rows: any[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await sb.from(table).select(fields).range(start, start + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function plan() {
  const sb = createServiceRoleClient();
  const [sourceRows, items, receivedOrders] = await Promise.all([
    allRows(sb, "inventory_items", "id,internal_sku,image_url,source_url,source_site_code,source_product_id,option_seq,series_name"),
    allRows(sb, "purchase_items", "id,purchase_order_id,internal_sku,image_url,sourcing_inventory_id"),
    allRows(sb, "purchase_orders", "id,order_status"),
  ]);
  const receivedOrderIds = new Set(receivedOrders.filter((order) => order.order_status === "입고완료").map((order) => String(order.id)));
  const broadcastItems = items.filter((item) => receivedOrderIds.has(String(item.purchase_order_id)));
  const bySku = uniqueInventoryBySku(sourceRows);
  const changes: { purchase_item_id: string; sku: string; previous_image_url: string | null; restored_image_url: string; original_sourcing_inventory_id: string | null; restored_sourcing_inventory_id: string }[] = [];
  let unnumbered = 0, unmatched = 0, unchanged = 0;
  for (const item of broadcastItems) {
    const sku = String(item.internal_sku || "").trim();
    if (!sku) { unnumbered++; continue; }
    const source = bySku.get(sku);
    if (!source || !String(source.image_url || "").trim()) { unmatched++; continue; }
    const newUrl = String(source.image_url).trim();
    const oldUrl = String(item.image_url || "").trim() || null;
    if (oldUrl === newUrl && String(item.sourcing_inventory_id || "") === String(source.id)) { unchanged++; continue; }
    changes.push({ purchase_item_id: item.id, sku, previous_image_url: oldUrl, restored_image_url: newUrl, original_sourcing_inventory_id: item.sourcing_inventory_id || null, restored_sourcing_inventory_id: source.id });
  }
  return { sb, changes, unnumbered, unmatched, unchanged };
}
export async function GET() {
  try {
    const { changes, unnumbered, unmatched, unchanged } = await plan();
    return NextResponse.json({ ok: true, preview: true, counts: { will_restore: changes.length, unnumbered_untouched: unnumbered, unmatched_untouched: unmatched, already_correct: unchanged }, changes });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "복구 대상 확인 실패" }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.confirm !== "RESTORE_SKU_IMAGES") return NextResponse.json({ ok: false, message: "복구 확인이 필요합니다." }, { status: 400 });
    const { sb, changes, unnumbered, unmatched, unchanged } = await plan();
    let restored = 0;
    for (const row of changes) {
      // Append a durable backup before touching an original record. Never alter unnamed items.
      const { error: auditError } = await sb.from("sale_inventory_image_repair_audit").insert({
        purchase_item_id: row.purchase_item_id,
        internal_sku: row.sku,
        previous_image_url: row.previous_image_url,
        restored_image_url: row.restored_image_url,
        original_sourcing_inventory_id: row.original_sourcing_inventory_id,
        restored_sourcing_inventory_id: row.restored_sourcing_inventory_id,
      });
      if (auditError) throw new Error("복구 기록 저장 실패: " + auditError.message + " (DB 마이그레이션 여부 확인)");
      let update = sb.from("purchase_items").update({
        image_url: row.restored_image_url,
        sourcing_inventory_id: row.restored_sourcing_inventory_id,
      }).eq("id", row.purchase_item_id).eq("internal_sku", row.sku);
      update = row.previous_image_url == null ? update.is("image_url", null) : update.eq("image_url", row.previous_image_url);
      const { data, error } = await update.select("id");
      if (error) throw error;
      if (data?.length) restored++;
    }
    return NextResponse.json({ ok: true, restored, skipped_due_to_concurrent_changes: changes.length - restored, unnumbered_untouched: unnumbered, unmatched_untouched: unmatched, already_correct: unchanged });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "복구 실패" }, { status: 500 });
  }
}
