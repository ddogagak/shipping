import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";
import { resolveInventorySku } from "@/lib/inventory/match-by-sku";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceRow = {
  id: string; internal_sku: string | null; image_url: string | null;
  source_url: string | null; source_site_code: string | null;
  source_product_id: string | null; option_seq: number | null;
  series_name: string | null; item_name: string | null;
};
type PurchaseRow = {
  id: string; purchase_order_id: string; internal_sku: string | null;
  image_url: string | null; sourcing_inventory_id: string | null;
  source_product_id: string | null; product_url: string | null; product_name: string | null;
};
type Change = {
  purchase_item_id: string; name: string; sku: string;
  previous_image_url: string | null; restored_image_url: string;
  original_sourcing_inventory_id: string | null; restored_sourcing_inventory_id: string;
  inferred_sku: boolean;
};

async function allRows(sb: ReturnType<typeof createServiceRoleClient>, table: string, fields: string) {
  const rows: any[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await sb.from(table).select(fields).order("id", { ascending: true }).range(start, start + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function comparableUrl(raw: unknown) {
  try {
    const parsed = new URL(String(raw || "").trim());
    return (parsed.hostname + parsed.pathname).toLowerCase().replace(/\/+$/, "");
  } catch { return ""; }
}

function verifiedLinkedSku(item: PurchaseRow, source: SourceRow): boolean {
  // A source link alone can be stale. Require an independent URL or product-ID agreement.
  const itemUrl = comparableUrl(item.product_url);
  const sourceUrl = comparableUrl(source.source_url);
  if (itemUrl && sourceUrl && itemUrl === sourceUrl) return true;
  const itemProductId = String(item.source_product_id || "").trim() || extractSourceProductId(item.product_url) || "";
  const sourceProductId = String(source.source_product_id || "").trim() || extractSourceProductId(source.source_url) || "";
  return Boolean(itemProductId && sourceProductId && itemProductId === sourceProductId);
}

function addReason(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] || 0) + 1;
}
async function plan() {
  const sb = createServiceRoleClient();
  const [sourceRows, items, receivedOrders] = await Promise.all([
    allRows(sb, "inventory_items", "id,internal_sku,image_url,source_url,source_site_code,source_product_id,option_seq,series_name,item_name"),
    allRows(sb, "purchase_items", "id,purchase_order_id,internal_sku,image_url,sourcing_inventory_id,source_product_id,product_url,product_name"),
    allRows(sb, "purchase_orders", "id,order_status"),
  ]);
  const sourceById = new Map<string, SourceRow>();
  const sourceBySku = new Map<string, SourceRow[]>();
  for (const row of sourceRows as SourceRow[]) {
    sourceById.set(String(row.id), row);
    const sku = resolveInventorySku(row);
    if (sku) sourceBySku.set(sku, [...(sourceBySku.get(sku) || []), row]);
  }
  const received = new Set(receivedOrders.filter((order) => order.order_status === "입고완료").map((order) => String(order.id)));
  const changes: Change[] = [];
  const skipped: { purchase_item_id: string; name: string; sku: string | null; reason: string; matching_source_count: number }[] = [];
  const counts: Record<string, number> = {
    will_restore: 0, inferred_sku_will_be_saved: 0, already_correct: 0,
    unnumbered_untouched: 0, visible_sku_unverified: 0,
    duplicate_sku: 0, no_matching_sku: 0, missing_source_image: 0,
    not_received_untouched: 0,
  };
  for (const item of items as PurchaseRow[]) {
    if (!received.has(String(item.purchase_order_id))) {
      addReason(counts, "not_received_untouched");
      continue;
    }
    const storedSku = String(item.internal_sku || "").trim();
    const linked = item.sourcing_inventory_id ? sourceById.get(String(item.sourcing_inventory_id)) : undefined;
    const visibleSku = linked ? resolveInventorySku(linked) : "";
    const inferred = !storedSku && Boolean(visibleSku && linked && verifiedLinkedSku(item, linked));
    const sku = storedSku || (inferred ? visibleSku : "");
    const name = String(item.product_name || "");
    function skip(reason: string, matchingSourceCount: number) {
      addReason(counts, reason);
      skipped.push({
        purchase_item_id: item.id, name, sku: storedSku || visibleSku || null,
        reason, matching_source_count: matchingSourceCount,
      });
    }
    if (!sku) {
      skip(visibleSku ? "visible_sku_unverified" : "unnumbered_untouched", visibleSku ? (sourceBySku.get(visibleSku)?.length || 0) : 0);
      continue;
    }
    const candidates = sourceBySku.get(sku) || [];
    if (!candidates.length) { skip("no_matching_sku", 0); continue; }
    if (candidates.length > 1) { skip("duplicate_sku", candidates.length); continue; }
    const source = candidates[0];
    const nextImage = String(source.image_url || "").trim();
    if (!nextImage) { skip("missing_source_image", 1); continue; }
    const oldImage = String(item.image_url || "").trim() || null;
    if (oldImage === nextImage && String(item.sourcing_inventory_id || "") === String(source.id) && !inferred) {
      addReason(counts, "already_correct");
      continue;
    }
    changes.push({
      purchase_item_id: item.id, name, sku, previous_image_url: oldImage,
      restored_image_url: nextImage,
      original_sourcing_inventory_id: item.sourcing_inventory_id || null,
      restored_sourcing_inventory_id: source.id,
      inferred_sku: inferred,
    });
    addReason(counts, "will_restore");
    if (inferred) addReason(counts, "inferred_sku_will_be_saved");
  }
  return { sb, changes, skipped, counts };
}

export async function GET() {
  try {
    const { changes, skipped, counts } = await plan();
    return NextResponse.json({ ok: true, preview: true, counts, changes: changes.slice(0, 300), skipped: skipped.slice(0, 300), truncated: changes.length > 300 || skipped.length > 300 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "복구 대상 확인 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.confirm !== "RESTORE_SKU_IMAGES") {
      return NextResponse.json({ ok: false, message: "복구 확인이 필요합니다." }, { status: 400 });
    }
    const { sb, changes, counts } = await plan();
    let restored = 0;
    let persistedSku = 0;
    for (const row of changes) {
      // Before writing, preserve the old image and sourcing link for this purchase item.
      const { error: auditError } = await sb.from("sale_inventory_image_repair_audit").insert({
        purchase_item_id: row.purchase_item_id,
        internal_sku: row.sku,
        previous_image_url: row.previous_image_url,
        restored_image_url: row.restored_image_url,
        original_sourcing_inventory_id: row.original_sourcing_inventory_id,
        restored_sourcing_inventory_id: row.restored_sourcing_inventory_id,
      });
      if (auditError) throw new Error("복구 기록 저장 실패: " + auditError.message + " (Supabase SQL 마이그레이션 확인)");
      const payload: Record<string, unknown> = {
        image_url: row.restored_image_url,
        sourcing_inventory_id: row.restored_sourcing_inventory_id,
      };
      // A verified displayed SKU is now persisted, so future matches cannot rely on mutable names.
      if (row.inferred_sku) payload.internal_sku = row.sku;
      let update = sb.from("purchase_items")
        .update(payload)
        .eq("id", row.purchase_item_id);
      update = row.inferred_sku ? update.is("internal_sku", null) : update.eq("internal_sku", row.sku);
      update = row.previous_image_url == null ? update.is("image_url", null) : update.eq("image_url", row.previous_image_url);
      if (row.inferred_sku) update = update.eq("sourcing_inventory_id", row.restored_sourcing_inventory_id);
      const { data, error } = await update.select("id");
      if (error) throw error;
      if (data?.length) {
        restored++;
        if (row.inferred_sku) persistedSku++;
      }
    }
    return NextResponse.json({
      ok: true, restored, persisted_sku: persistedSku,
      skipped_due_to_concurrent_changes: changes.length - restored,
      counts,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "복구 실패" }, { status: 500 });
  }
}
