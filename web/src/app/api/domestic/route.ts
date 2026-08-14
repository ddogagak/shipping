import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("domestic_order")
    .select(`
      order_id,
      customer_order_no,
      platform,
      source_order_dates,
      first_order_date,
      nickname,
      recipient_name,
      phone,
      postal_code,
      address,
      order_count,
      item_summary,
      item_total_price,
      order_status,
      // [요청상태 추가]
      request_status,
      created_at,
      memo,
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
  const now = new Date().toISOString();

  if (action === "update_row") {
    const orderId = String(body.order_id || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "order_id가 없습니다." },
        { status: 400 }
      );
    }

    const nextShippingStatus = body.shipping_status || "start";
    const nextOrderStatus =
      nextShippingStatus === "done"
        ? "done"
        : body.order_status || "accepted";

    const { error: orderError } = await supabase
      .from("domestic_order")
      .update({
        memo: body.memo ?? null,
        order_status: nextOrderStatus,
        // [요청상태 추가]
        request_status: body.request_status || "none",
        updated_at: now,
      })
      .eq("order_id", orderId);

    if (orderError) {
      return NextResponse.json(
        { error: "국내 주문 행 저장 실패", detail: orderError.message },
        { status: 500 }
      );
    }

    const trackingNumber =
      body.tracking_number === undefined || body.tracking_number === null
        ? null
        : String(body.tracking_number).trim() || null;

    const { error: shippingError } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_status: nextShippingStatus,
        shipping_type: body.shipping_type || "일반택배",
        tracking_number: trackingNumber,
        updated_at: now,
      })
      .eq("order_id", orderId);

    if (shippingError) {
      return NextResponse.json(
        { error: "국내 배송 행 저장 실패", detail: shippingError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (!orderIds.length) {
    return NextResponse.json(
      { error: "선택된 주문이 없습니다." },
      { status: 400 }
    );
  }

  if (action === "checked" || action === "packaged") {
    const nextOrderStatus = action === "packaged" ? "packaged" : "checked";

    const { error } = await supabase
      .from("domestic_order")
      .update({
        order_status: nextOrderStatus,
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "주문상태 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "tracking_uploaded" || action === "registered") {
    const nextShippingStatus =
      action === "registered" ? "registered" : "uploaded";

    const { error } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_status: nextShippingStatus,
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "배송상태 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "order_done") {
    const { error } = await supabase
      .from("domestic_order")
      .update({
        order_status: "done",
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "주문완료 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "shipping_done" || action === "done") {
    const { error: shippingError } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_status: "done",
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (shippingError) {
      return NextResponse.json(
        { error: "배송완료 처리 실패", detail: shippingError.message },
        { status: 500 }
      );
    }

    const { error: orderError } = await supabase
      .from("domestic_order")
      .update({
        order_status: "done",
        updated_at: now,
      })
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
        excel_exported_at: now,
        updated_at: now,
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

export async function DELETE(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();

  const orderIds = Array.isArray(body.order_ids)
    ? body.order_ids.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
    : [];

  if (!orderIds.length) {
    return NextResponse.json(
      { error: "삭제할 주문이 없습니다." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("domestic_order")
    .delete()
    .in("order_id", orderIds);

  if (error) {
    return NextResponse.json(
      { error: "국내 주문 삭제 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, deleted: orderIds.length });
}import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("domestic_order")
    .select(`
      order_id,
      customer_order_no,
      platform,
      source_order_dates,
      first_order_date,
      nickname,
      recipient_name,
      phone,
      postal_code,
      address,
      order_count,
      item_summary,
      item_total_price,
      order_status,
      created_at,
      memo,
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
  const now = new Date().toISOString();

  if (action === "update_row") {
    const orderId = String(body.order_id || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "order_id가 없습니다." },
        { status: 400 }
      );
    }

    const nextShippingStatus = body.shipping_status || "start";
    const nextOrderStatus =
      nextShippingStatus === "done"
        ? "done"
        : body.order_status || "accepted";

    const { error: orderError } = await supabase
      .from("domestic_order")
      .update({
        memo: body.memo ?? null,
        order_status: nextOrderStatus,
        updated_at: now,
      })
      .eq("order_id", orderId);

    if (orderError) {
      return NextResponse.json(
        { error: "국내 주문 행 저장 실패", detail: orderError.message },
        { status: 500 }
      );
    }

    const trackingNumber =
      body.tracking_number === undefined || body.tracking_number === null
        ? null
        : String(body.tracking_number).trim() || null;

    const { error: shippingError } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_status: nextShippingStatus,
        shipping_type: body.shipping_type || "일반택배",
        tracking_number: trackingNumber,
        updated_at: now,
      })
      .eq("order_id", orderId);

    if (shippingError) {
      return NextResponse.json(
        { error: "국내 배송 행 저장 실패", detail: shippingError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (!orderIds.length) {
    return NextResponse.json(
      { error: "선택된 주문이 없습니다." },
      { status: 400 }
    );
  }

  if (action === "checked" || action === "packaged") {
    const nextOrderStatus = action === "packaged" ? "packaged" : "checked";

    const { error } = await supabase
      .from("domestic_order")
      .update({
        order_status: nextOrderStatus,
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "주문상태 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "tracking_uploaded" || action === "registered") {
    const nextShippingStatus =
      action === "registered" ? "registered" : "uploaded";

    const { error } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_status: nextShippingStatus,
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "배송상태 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "order_done") {
    const { error } = await supabase
      .from("domestic_order")
      .update({
        order_status: "done",
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: "주문완료 처리 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "shipping_done" || action === "done") {
    const { error: shippingError } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_status: "done",
        updated_at: now,
      })
      .in("order_id", orderIds);

    if (shippingError) {
      return NextResponse.json(
        { error: "배송완료 처리 실패", detail: shippingError.message },
        { status: 500 }
      );
    }

    const { error: orderError } = await supabase
      .from("domestic_order")
      .update({
        order_status: "done",
        updated_at: now,
      })
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
        excel_exported_at: now,
        updated_at: now,
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

export async function DELETE(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();

  const orderIds = Array.isArray(body.order_ids)
    ? body.order_ids.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
    : [];

  if (!orderIds.length) {
    return NextResponse.json(
      { error: "삭제할 주문이 없습니다." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("domestic_order")
    .delete()
    .in("order_id", orderIds);

  if (error) {
    return NextResponse.json(
      { error: "국내 주문 삭제 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, deleted: orderIds.length });
}
