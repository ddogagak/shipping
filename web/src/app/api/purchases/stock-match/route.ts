import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { GET as getSaleInventory } from "@/app/api/sale-inventory/route";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function GET(req: Request) {
  try {
    const sb = createServiceRoleClient();
    const [groupsResult, saleResponse] = await Promise.all([
      sb.from("sale_inventory_groups").select("id,title,sale_inventory_group_members(purchase_item_id)").eq("active", true),
      getSaleInventory(new Request(new URL("/api/sale-inventory?read_only=1", req.url))),
    ]);
    if (groupsResult.error) throw groupsResult.error;
    const sale = await saleResponse.json();
    if (!saleResponse.ok || !sale.ok) throw new Error(sale.message || "방송판매재고 조회 실패");
    const rows = (sale.items || []).filter((row: any) => !row.is_random_member);
    const byId = new Map<string, any>(rows.map((row: any) => [String(row.id), row]));
    const grouped = new Set<string>();
    const candidates: any[] = [];
    for (const group of groupsResult.data || []) {
      const memberIds = group.sale_inventory_group_members.map(member => String(member.purchase_item_id));
      memberIds.forEach(id => grouped.add(id));
      const lots = memberIds.map(id => byId.get(id)).filter(Boolean);
      if (!lots.length) continue;
      const first = lots.find(row => row.image_url) || lots[0];
      candidates.push({ id: group.id, target_type: "group", name: group.title, image: first.image_url,
        series: first.series_name, item_type: first.item_type, member_ids: memberIds,
        remaining: lots.reduce((sum, row) => sum + Number(row.remaining_units || 0), 0),
        search: lots.flatMap(row => [row.product_name, row.display_name, row.option_text, row.internal_sku, row.order_number]).filter(Boolean).join(" ") });
    }
    for (const row of rows) {
      if (grouped.has(String(row.id))) continue;
      candidates.push({ id: row.id, target_type: "lot", name: row.display_name || row.product_name, image: row.image_url,
        series: row.series_name, item_type: row.item_type, remaining: Number(row.remaining_units || 0), member_ids: [row.id],
        search: [row.product_name, row.option_text, row.internal_sku, row.order_number].filter(Boolean).join(" ") });
    }
    return NextResponse.json({ ok: true, candidates });
  } catch (e) { return fail(e instanceof Error ? e.message : "기존 재고 조회 실패", 500); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itemId = String(body.purchase_item_id || ""), action = String(body.action || ""), targetType = String(body.target_type || ""), targetId = String(body.target_id || "");
    if (!uuid.test(itemId) || !["link", "unlink"].includes(action) || (action === "link" && (!uuid.test(targetId) || !["group", "lot"].includes(targetType)))) return fail("연결할 매입과 재고를 확인해줘.");
    const sb = createServiceRoleClient();
    // Deliberately pass ONLY relationship identifiers. No money/quantity writes.
    const { data, error } = await sb.rpc("match_purchase_stock", { p_action: action, p_purchase_item_id: itemId, p_target_type: action === "link" ? targetType : null, p_target_id: action === "link" ? targetId : null });
    if (error) return fail(error.message, 409);
    return NextResponse.json({ ok: true, group_id: data });
  } catch (e) { return fail(e instanceof Error ? e.message : "재고 연결 실패", 500); }
}
