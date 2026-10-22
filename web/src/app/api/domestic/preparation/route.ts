import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export async function POST(req: Request) {
  // 브라우저의 동일 출처 요청만 허용합니다.
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "허용되지 않은 출처" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 }); }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length < 1 || entries.length > 100) {
    return NextResponse.json({ error: "선택 주문은 1~100건이어야 합니다." }, { status: 400 });
  }
  const ids = entries.map((item: any) => String(item?.order_id ?? "").trim());
  if (ids.some((id: string) => !id) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "주문번호가 비었거나 중복되었습니다." }, { status: 400 });
  }

  const db = createServiceRoleClient();
  const { data: orders, error: lookupError } = await db.from("domestic_order")
    .select("order_id,nickname,platform,phone,order_status,domestic_shipping(shipping_status)")
    .in("order_id", ids);
  if (lookupError) {
    return NextResponse.json({ error: "주문 조회 실패", detail: lookupError.message }, { status: 500 });
  }

  const byId = new Map((orders ?? []).map((row: any) => [String(row.order_id), row]));
  const results: Array<{ order_id: string; ok: boolean; saved?: boolean; prepared?: boolean; reason?: string }> = [];
  const now = new Date().toISOString();

  for (const input of entries) {
    const orderId = String(input.order_id).trim();
    const order: any = byId.get(orderId);
    const phone = digits(input.phone);
    const currentPhone = digits(order?.phone);
    const shipping = Array.isArray(order?.domestic_shipping)
      ? order.domestic_shipping[0] : order?.domestic_shipping;

    let reason = "";
    if (!order) reason = "주문을 찾지 못했습니다.";
    else if (String(order.platform || "").toLowerCase() !== "wise") reason = "와이스 주문이 아닙니다.";
    else if (normalize(order.nickname) !== normalize(input.nickname)) reason = "닉네임이 일치하지 않습니다.";
    else if (order.order_status === "done" || shipping?.shipping_status === "done") reason = "완료 주문입니다.";
    else if (!shipping) reason = "배송 상태 기록이 없습니다.";
    else if (!/^050\d{8,9}$/.test(phone)) reason = "확인된 050 안심번호가 아닙니다.";
    else if (currentPhone && currentPhone !== phone) reason = "기존 전화번호가 있어 덮어쓰지 않았습니다.";

    if (reason) {
      results.push({ order_id: orderId, ok: false, reason });
      continue;
    }

    let saved = false;
    if (!currentPhone) {
      // 기존 번호가 빈 경우에만 기록하며, 동시 변경된 값은 덮어쓰지 않습니다.
      const { data: updated, error } = await db.from("domestic_order")
        .update({ phone, updated_at: now })
        .eq("order_id", orderId).eq("platform", "wise")
        .or("phone.is.null,phone.eq.")
        .select("order_id");
      if (error || !updated?.length) {
        results.push({ order_id: orderId, ok: false, reason: error?.message || "전화번호가 이미 변경되었습니다." });
        continue;
      }
      saved = true;
    }

    let prepared = false;
    // 송장 등록 이후 상태를 이전 단계로 되돌리지 않습니다.
    if (shipping.shipping_status === "start") {
      const { data: updated, error } = await db.from("domestic_shipping")
        .update({ shipping_status: "ready", updated_at: now })
        .eq("order_id", orderId).eq("shipping_status", "start")
        .select("order_id");
      if (error || !updated?.length) {
        results.push({ order_id: orderId, ok: false, saved, reason: error?.message || "준비 상태 저장 실패" });
        continue;
      }
      prepared = true;
    }

    results.push({ order_id: orderId, ok: true, saved, prepared });
  }

  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
