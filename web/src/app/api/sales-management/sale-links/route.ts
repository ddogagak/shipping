import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 800;
const MAX_UPDATE = 300;
const KST_MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" });

function monthInKst(iso: string) {
  const parts = KST_MONTH_FORMAT.formatToParts(new Date(iso));
  const y = parts.find(x => x.type === "year")?.value || "";
  const m = parts.find(x => x.type === "month")?.value || "";
  return y + "-" + m;
}
function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "매칭 데이터를 처리하지 못했어.";
}
function stockIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = [...new Set(raw.map(x => String(x ?? "").trim()))];
  if (ids.length < 1 || ids.length > MAX_UPDATE ||
      ids.some(id => !/^\d{1,19}$/.test(id) || BigInt(id) <= 0n || BigInt(id) > 9223372036854775807n)) return [];
  return ids;
}
async function getShows(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("조회 월을 YYYY-MM 형식으로 선택해줘.");
  const [year, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, m - 1, 1) - 2 * 86400000).toISOString();
  const to = new Date(Date.UTC(year, m, 1) + 2 * 86400000).toISOString();
  const sb = createServiceRoleClient();
  const groups = new Map<string, { video_id: string; first_sale: string; last_sale: string; count: number; revenue: number; buyers: Set<string> }>();
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await sb.from("domestic_wise_item_photo")
      .select("video_id,sold_at,item_price,wise_user_id")
      .gte("sold_at", from).lt("sold_at", to)
      .not("video_id", "is", null)
      .order("sold_at", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data || []) {
      const id = String(row.video_id || "").trim();
      const sold = String(row.sold_at || "");
      if (!id || !sold) continue;
      const group = groups.get(id) || {
        video_id: id, first_sale: sold, last_sale: sold, count: 0, revenue: 0, buyers: new Set<string>()
      };
      if (sold < group.first_sale) group.first_sale = sold;
      if (sold > group.last_sale) group.last_sale = sold;
      group.count++;
      group.revenue += Number(row.item_price || 0);
      if (row.wise_user_id) group.buyers.add(String(row.wise_user_id));
      groups.set(id, group);
    }
    if ((data || []).length < PAGE_SIZE) break;
  }
  return NextResponse.json({
    ok: true,
    shows: [...groups.values()].filter(row => monthInKst(row.first_sale) === month)
      .map(({ buyers, ...row }) => ({ ...row, buyer_count: buyers.size }))
      .sort((a, b) => b.first_sale.localeCompare(a.first_sale))
  });
}
async function getSales(videoIds: string[]) {
  if (!videoIds.length || videoIds.length > 80 || videoIds.some(id => !id || id.length > 160)) return fail("조회할 방송을 1~80개 선택해줘.");
  const sb = createServiceRoleClient();
  const sales: any[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await sb.from("domestic_wise_item_photo")
      .select("wise_stock_id,video_id,wise_user_id,buyer_nickname,item_name,item_price,image_url,sold_at")
      .in("video_id", videoIds).order("sold_at", { ascending: true })
      .order("wise_stock_id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    sales.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    if (sales.length > 10000) return fail("한 방송 판매 기록이 10,000건을 초과해. 조회 범위를 확인해줘.", 413);
  }
  const links: any[] = [];
  for (let i = 0; i < sales.length; i += MAX_UPDATE) {
    const ids = sales.slice(i, i + MAX_UPDATE).map(row => String(row.wise_stock_id));
    const { data, error } = await sb.from("wise_sale_inventory_links")
      .select("id,wise_stock_id,purchase_item_id,random_box_id,quantity,updated_at")
      .in("wise_stock_id", ids);
    if (error) throw error;
    links.push(...(data || []));
  }
  const linkMap = new Map<string, any[]>();
  for (const link of links) {
    const key = String(link.wise_stock_id);
    const group = linkMap.get(key) || [];
    group.push(link);
    linkMap.set(key, group);
  }
  return NextResponse.json({
    ok: true, video_ids: videoIds,
    sales: sales.map(row => ({
      id: String(row.wise_stock_id),
      video_id: row.video_id, wise_user_id: row.wise_user_id,
      buyer_nickname: row.buyer_nickname,
      item_name: row.item_name, item_price: Number(row.item_price || 0),
      image_url: row.image_url, sold_at: row.sold_at,
      links: linkMap.get(String(row.wise_stock_id)) || []
    }))
  });
}
async function getInventory() {
  const sb = createServiceRoleClient();
  const [ordersResult, ledgerResult, boxesResult] = await Promise.all([
    sb.from("purchase_orders")
      .select("id,order_number,ordered_at,currency,order_status,purchase_items(id,product_name,display_name_ko,option_text,image_url,series_name,item_type,unit_price,component_count,quantity)")
      .eq("order_status", "입고완료").order("ordered_at", { ascending: false }),
    sb.from("purchase_sale_inventory")
      .select("purchase_item_id,display_name,image_url_override,component_count_override,purchase_price_override,sale_price,stock_status"),
    sb.from("sale_random_boxes")
      .select("id,title,image_url,component_count,purchase_quantity,total_cost_krw,sale_price,view_status,series_tags,created_at")
      .order("created_at", { ascending: false })
  ]);
  if (ordersResult.error) throw ordersResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  if (boxesResult.error) throw boxesResult.error;
  const ledgerMap = new Map((ledgerResult.data || []).map((x: any) => [String(x.purchase_item_id), x]));
  const candidates: any[] = [];
  for (const order of ordersResult.data || []) {
    for (const item of (order.purchase_items || []) as any[]) {
      const ledger: any = ledgerMap.get(String(item.id));
      candidates.push({
        type: "purchase_item", id: String(item.id),
        name: ledger?.display_name || item.display_name_ko || item.product_name,
        option: item.option_text || "",
        image_url: ledger?.image_url_override || item.image_url || null,
        series: item.series_name || "",
        unit_price: Number(ledger?.purchase_price_override ?? item.unit_price ?? 0),
        currency: order.currency || "", component_count: Number(ledger?.component_count_override ?? item.component_count ?? 1),
        sale_price: ledger?.sale_price == null ? null : Number(ledger.sale_price),
        stock_status: ledger?.stock_status || "active", order_number: order.order_number || "",
        purchase_date: order.ordered_at || ""
      });
    }
  }
  for (const box of boxesResult.data || []) {
    candidates.push({
      type: "random_box", id: String(box.id), name: box.title,
      option: "랜덤박스", image_url: box.image_url || null,
      series: (box.series_tags || []).join(", "),
      unit_price: Number(box.total_cost_krw || 0),
      currency: "KRW", component_count: Number(box.component_count || 1),
      sale_price: box.sale_price == null ? null : Number(box.sale_price),
      stock_status: box.view_status || "display", order_number: "",
      purchase_date: box.created_at || ""
    });
  }
  return NextResponse.json({ ok: true, candidates });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "shows";
    if (mode === "shows") return await getShows(url.searchParams.get("month") || "");
    if (mode === "sales") return await getSales([...new Set(url.searchParams.getAll("video_id").map(id => id.trim()).filter(Boolean))]);
    if (mode === "inventory") return await getInventory();
    return fail("조회 종류가 올바르지 않아.");
  } catch (error) {
    return fail(errorText(error), 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = stockIds(body.stock_ids);
    if (!ids.length) return fail("실판매 항목을 1~300개 선택해줘.");
    const action = String(body.action || "");
    if (!["link", "unlink"].includes(action)) return fail("연결 또는 해제 작업을 선택해줘.");

    const sb = createServiceRoleClient();
    const { data: actual, error: actualError } = await sb.from("domestic_wise_item_photo")
      .select("wise_stock_id,video_id").in("wise_stock_id", ids);
    if (actualError) throw actualError;
    if (!actual || actual.length !== ids.length || actual.some(row => !row.video_id)) {
      return fail("선택한 판매기록이 존재하지 않거나 방송 정보가 없어. 새로고침 후 다시 선택해줘.", 409);
    }

    if (action === "unlink") {
      const type = String(body.target_type || "");
      const targetId = String(body.target_id || "");
      if (type || targetId) {
        if (!["purchase_item", "random_box"].includes(type) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
          return fail("해제할 재고 연결이 올바르지 않아.");
        }
      }
      let query = sb.from("wise_sale_inventory_links").delete().in("wise_stock_id", ids);
      if (type) query = query.eq(type === "purchase_item" ? "purchase_item_id" : "random_box_id", targetId);
      const { data, error } = await query.select("id");
      if (error) throw error;
      return NextResponse.json({ ok: true, count: (data || []).length });
    }

    const inputTargets: unknown[] = Array.isArray(body.targets) ? body.targets :
      [{ target_type: body.target_type, target_id: body.target_id, quantity: body.quantity ?? 1 }];
    if (inputTargets.length < 1 || inputTargets.length > 16) return fail("방송판매재고를 1~16개 선택해줘.");
    const targets: Array<{target_type: "purchase_item" | "random_box"; target_id: string; quantity: number}> = [];
    const seen = new Set<string>();
    for (const input of inputTargets) {
      if (!input || typeof input !== "object") return fail("재고 선택 정보가 올바르지 않아.");
      const row = input as Record<string, unknown>;
      const type = String(row.target_type || "");
      const targetId = String(row.target_id || "");
      const quantity = Number(row.quantity);
      if (!["purchase_item", "random_box"].includes(type) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) ||
        !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) {
        return fail("재고 종류·ID 또는 연결 수량(1~9999)을 확인해줘.");
      }
      const key = type + "|" + targetId;
      if (seen.has(key)) return fail("중복 선택된 방송판매재고가 있어.");
      seen.add(key);
      targets.push({target_type: type as "purchase_item" | "random_box", target_id: targetId, quantity});
    }
    if (ids.length * targets.length > 1200) return fail("한 번에 최대 1,200개 연결을 저장할 수 있어.");

    const purchaseIds = targets.filter(t => t.target_type === "purchase_item").map(t => t.target_id);
    const boxIds = targets.filter(t => t.target_type === "random_box").map(t => t.target_id);
    if (purchaseIds.length) {
      const { data: items, error: itemError } = await sb.from("purchase_items")
        .select("id,purchase_order_id").in("id", purchaseIds);
      if (itemError) throw itemError;
      if ((items || []).length !== purchaseIds.length) return fail("선택한 매입상품 중 찾을 수 없는 상품이 있어.", 404);
      const orderIds = [...new Set((items || []).map(item => String(item.purchase_order_id)))];
      const { data: orders, error: orderError } = await sb.from("purchase_orders")
        .select("id,order_status").in("id", orderIds);
      if (orderError) throw orderError;
      if ((orders || []).length !== orderIds.length || (orders || []).some(order => order.order_status !== "입고완료")) {
        return fail("입고완료된 방송판매재고만 연결할 수 있어.", 409);
      }
    }
    if (boxIds.length) {
      const { data: boxes, error: boxError } = await sb.from("sale_random_boxes")
        .select("id").in("id", boxIds);
      if (boxError) throw boxError;
      if ((boxes || []).length !== boxIds.length) return fail("선택한 랜덤박스 중 찾을 수 없는 상품이 있어.", 404);
    }

    const now = new Date().toISOString();
    let saved = 0;
    for (const type of ["purchase_item", "random_box"] as const) {
      const selectedTargets = targets.filter(t => t.target_type === type);
      if (!selectedTargets.length) continue;
      const rows = ids.flatMap(wise_stock_id => selectedTargets.map(t => ({
        wise_stock_id, purchase_item_id: type === "purchase_item" ? t.target_id : null,
        random_box_id: type === "random_box" ? t.target_id : null,
        quantity: t.quantity, updated_at: now
      })));
      const conflict = type === "purchase_item" ? "wise_stock_id,purchase_item_id" : "wise_stock_id,random_box_id";
      for (let start = 0; start < rows.length; start += 200) {
        const { error } = await sb.from("wise_sale_inventory_links")
          .upsert(rows.slice(start, start + 200), { onConflict: conflict });
        if (error) throw error;
      }
      saved += rows.length;
    }
    return NextResponse.json({ ok: true, count: saved });
  } catch (error) {
    return fail(errorText(error), 500);
  }
}
