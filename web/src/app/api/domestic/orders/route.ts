import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("domestic_order")
    .select(`
      order_id,
      platform,
      source_order_dates,
      first_order_date,
      nickname,
      recipient_name,
      phone,
      postal_code,
      address,
      order_count,
      item_total_price,
      order_status,
      created_at,
      domestic_shipping (
        carrier,
        shipping_type,
        tracking_number,
        shipping_status,
        excel_exported_at
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "국내 주문 조회 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, orders: data || [] });
}

export async function PATCH(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();

  const orderIds = Array.isArray(body.order_ids)
    ? body.order_ids.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
    : [];

  const action = String(body.action || "").trim();

  if (!orderIds.length) {
    return NextResponse.json(
      { error: "선택된 주문이 없습니다." },
      { status: 400 }
    );
  }

  if (action === "checked") {
    const { error } = await supabase
      .from("domestic_order")
      .update({ order_status: "checked", updated_at: new Date().toISOString() })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "재고확인 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "order_done") {
    const { error } = await supabase
      .from("domestic_order")
      .update({ order_status: "done", updated_at: new Date().toISOString() })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "주문완료 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "shipping_done") {
    const now = new Date().toISOString();

    const { error: shippingError } = await supabase
      .from("domestic_shipping")
      .update({ shipping_status: "done", updated_at: now })
      .in("order_id", orderIds);

    if (shippingError) {
      return NextResponse.json(
        { error: "배송완료 처리 실패", detail: shippingError.message },
        { status: 500 }
      );
    }

    const { error: orderError } = await supabase
      .from("domestic_order")
      .update({ order_status: "done", updated_at: now })
      .in("order_id", orderIds);

    if (orderError) {
      return NextResponse.json(
        { error: "주문완료 동기화 실패", detail: orderError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "excel_exported") {
    const { error } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_status: "excel_exported",
        excel_exported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "엑셀추출 상태 변경 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "알 수 없는 action입니다." },
    { status: 400 }
  );
}
