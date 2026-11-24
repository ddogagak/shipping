import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StockType = "purchase_item" | "random_box" | "inventory_group";
type LinkRow = {
  id: number; wise_stock_id: string | number; purchase_item_id: string | null;
  random_box_id: string | null; inventory_group_id: string | null;
  quantity: number; applied_units: number;
  group_allocations: Array<{ lot_id: string; units: number }> | null;
};
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_REMOVE = 300;
const PAGE = 500;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const errorText = (error: unknown) => error instanceof Error ? error.message : "실판매 연결을 불러오지 못했어.";
const valid = (type: string, id: string): type is StockType =>
  ["purchase_item", "random_box", "inventory_group"].includes(type) && UUID.test(id);
const keyOf = (l: LinkRow) => l.inventory_group_id
  ? { target_type: "inventory_group" as StockType, target_id: String(l.inventory_group_id) }
  : l.random_box_id
    ? { target_type: "random_box" as StockType, target_id: String(l.random_box_id) }
    : { target_type: "purchase_item" as StockType, target_id: String(l.purchase_item_id) };

async function allLinks(sb: ReturnType<typeof createServiceRoleClient>, column: string, values: string[]) {
  const result: LinkRow[] = [];
  for (let i = 0; i < values.length; i += 100) {
    for (let start = 0;; start += PAGE) {
      const query = sb.from("wise_sale_inventory_links")
        .select("id,wise_stock_id,purchase_item_id,random_box_id,inventory_group_id,quantity,applied_units,group_allocations")
        .order("id").range(start, start + PAGE - 1);
      const { data, error } = column === "inventory_group_id" || column === "random_box_id"
        ? await query.eq(column, values[i])
        : await query.in(column, values.slice(i, i + 100));
      if (error) throw error;
      result.push(...((data || []) as LinkRow[]));
      if ((data || []).length < PAGE) break;
    }
    if (column === "inventory_group_id" || column === "random_box_id") break;
  }
  return result;
}

async function linksForStock(sb: ReturnType<typeof createServiceRoleClient>, type: StockType, id: string) {
  const results: LinkRow[] = [];
  if (type === "purchase_item") {
    results.push(...await allLinks(sb, "purchase_item_id", [id]));
    // A group sale belongs to a specific purchase lot only if FIFO allocations name it.
    const { data: memberships, error } = await sb.from("sale_inventory_group_members")
      .select("group_id").eq("purchase_item_id", id);
    if (error) throw error;
    const ids = [...new Set((memberships || []).map(x => String(x.group_id)))];
    for (const groupId of ids) {
      const groupLinks = await allLinks(sb, "inventory_group_id", [groupId]);
      results.push(...groupLinks.filter(link =>
        Array.isArray(link.group_allocations) &&
        link.group_allocations.some(allocation => String(allocation.lot_id) === id && Number(allocation.units) > 0)));
    }
  } else if (type === "random_box") {
    results.push(...await allLinks(sb, "random_box_id", [id]));
    const { data: members, error } = await sb.from("sale_random_box_members")
      .select("purchase_item_id").eq("random_box_id", id);
    if (error) throw error;
    const ids = [...new Set((members || []).map(row => String(row.purchase_item_id)))];
    if (ids.length) results.push(...await allLinks(sb, "purchase_item_id", ids));
  } else {
    results.push(...await allLinks(sb, "inventory_group_id", [id]));
    const { data: members, error } = await sb.from("sale_inventory_group_members")
      .select("purchase_item_id").eq("group_id", id);
    if (error) throw error;
    const ids = [...new Set((members || []).map(row => String(row.purchase_item_id)))];
    if (ids.length) results.push(...await allLinks(sb, "purchase_item_id", ids));
  }
  return [...new Map(results.map(x => [x.id, x])).values()];
}

async function stockExists(sb: ReturnType<typeof createServiceRoleClient>, type: StockType, id: string) {
  const table = type === "purchase_item" ? "purchase_items" :
    type === "random_box" ? "sale_random_boxes" : "sale_inventory_groups";
  const { data, error } = await sb.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("target_type") || "";
    const id = url.searchParams.get("target_id") || "";
    if (!valid(type, id)) return fail("상품 연결 조회 대상이 올바르지 않아.");
    const sb = createServiceRoleClient();
    if (!await stockExists(sb, type, id)) return fail("방송판매재고 상품을 찾지 못했어.", 404);

    const links = await linksForStock(sb, type, id);
    const sales = new Map<string, any>();
    const ids = [...new Set(links.map(l => String(l.wise_stock_id)))];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await sb.from("domestic_wise_item_photo")
        .select("wise_stock_id,item_name,item_price,buyer_nickname,sold_at,video_id,image_url,actual_sale_units")
        .in("wise_stock_id", ids.slice(i, i + 150));
      if (error) throw error;
      for (const sale of data || []) sales.set(String(sale.wise_stock_id), sale);
    }
    return NextResponse.json({
      ok: true,
      links: links.map(link => {
        const target = keyOf(link), sale = sales.get(String(link.wise_stock_id));
        const allocated = type === "purchase_item" && link.inventory_group_id
          ? (link.group_allocations || []).filter(a => String(a.lot_id) === id)
              .reduce((sum, a) => sum + Number(a.units || 0), 0)
          : Number(link.quantity);
        return {
          id: link.id, wise_stock_id: String(link.wise_stock_id),
          target_type: target.target_type, target_id: target.target_id,
          quantity: Number(link.quantity), allocated_units: allocated,
          applied_units: Number(link.applied_units), item_name: sale?.item_name || "판매정보 없음",
          item_price: Number(sale?.item_price || 0), buyer_nickname: sale?.buyer_nickname || "",
          sold_at: sale?.sold_at || null, video_id: sale?.video_id || null,
          image_url: sale?.image_url || null,
          group_allocation: Boolean(link.inventory_group_id && type === "purchase_item"),
        };
      }).sort((a, b) => String(b.sold_at || "").localeCompare(String(a.sold_at || "")) ||
        Number(b.id) - Number(a.id))
    });
  } catch (error) {
    return fail(errorText(error), 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = String(body.target_type || ""), id = String(body.target_id || "");
    const linkIds: number[] = body.link_ids;
    if (!valid(type, id) || !Array.isArray(linkIds) || linkIds.length < 1 ||
      linkIds.length > MAX_REMOVE || linkIds.some(v => !Number.isSafeInteger(v) || v <= 0) ||
      new Set(linkIds).size !== linkIds.length) return fail("해제할 실제 연결을 선택해줘.");

    const sb = createServiceRoleClient();
    const permitted = await linksForStock(sb, type, id);
    const permittedById = new Map(permitted.map(row => [row.id, row]));
    if (linkIds.some(linkId => !permittedById.has(linkId))) {
      return fail("선택한 연결이 다른 상품으로 변경됐어. 연결 목록을 새로고침해줘.", 409);
    }
    // Group by the *actual* target, not the visible random-box/member card.
    // Each existing RPC restores applied inventory and prevents auto-relink.
    const groups = new Map<string, {target_type: StockType; target_id: string; ids: string[]}>();
    for (const linkId of linkIds) {
      const link = permittedById.get(linkId)!;
      const target = keyOf(link), key = target.target_type + "|" + target.target_id;
      const group = groups.get(key) || {...target, ids: []};
      group.ids.push(String(link.wise_stock_id));
      groups.set(key, group);
    }
    let removed = 0, restored = 0;
    for (const group of groups.values()) {
      const { data, error } = await sb.rpc("wise_save_inventory_links", {
        p_action: "unlink", p_ids: [...new Set(group.ids)],
        p_targets: [{target_type:group.target_type,target_id:group.target_id}],
        p_mode: "link_only", p_remember: false
      });
      if (error) return fail("일부 연결 해제 후 오류가 발생했어. 새로고침해줘: " + error.message, 409);
      removed += Number(data?.count || 0);
      restored -= Number(data?.deducted_units || 0);
    }
    if (removed !== linkIds.length) return fail("변경된 연결이 있어. 목록을 다시 열어서 확인해줘.", 409);
    return NextResponse.json({ok:true,removed,restored});
  } catch (error) {
    return fail(errorText(error), 500);
  }
}
