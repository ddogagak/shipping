import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function baseOrderNo(value: string) {
  return String(value || "").trim().replace(/-C\d+$/i, "");
}

function combineCount(value: string) {
  const match = String(value || "").trim().match(/-C(\d+)$/i);
  return match ? Number(match[1] || 1) : 1;
}

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
  const now = new Date().toISOString();

  const action = String(body.action || "").trim();

  const orderIds = Array.isArray(body.order_ids)
    ? body.order_ids.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
    : [];

  if (action === "update_row") {
    const orderId = String(body.order_id || "").trim();

    if (!orderId) {
      return NextResponse.json({ error: "order_id가 없습니다." }, { status: 400 });
    }

    const nextShippingStatus = body.shipping_status || "start";
    const nextOrderStatus =
      nextShippingStatus === "done"
        ? "done"
        : body.order_status || "accepted";

    const trackingNumber =
      body.tracking_number === undefined || body.tracking_number === null
        ? null
        : String(body.tracking_number).trim() || null;

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

  if (action === "combine_shipping") {
    if (orderIds.length < 2) {
      return NextResponse.json(
        { error: "합배송할 주문이 2건 이상 필요합니다." },
        { status: 400 }
      );
    }

    const combined = body.combined && typeof body.combined === "object" ? body.combined : {};

    const { data: orders, error: fetchError } = await supabase
      .from("domestic_order")
      .select(`
        order_id,
        customer_order_no,
        source_order_dates,
        first_order_date,
        nickname,
        order_count,
        item_summary,
        item_total_price,
        memo,
        order_status,
        created_at,
        domestic_shipping (
          carrier,
          shipping_type,
          tracking_number,
          shipping_status
        )
      `)
      .in("order_id", orderIds);

    if (fetchError) {
      return NextResponse.json(
        { error: "합배송 대상 조회 실패", detail: fetchError.message },
        { status: 500 }
      );
    }

    const activeOrders = (orders || []).filter((order: any) => {
      const shippingRows = Array.isArray(order.domestic_shipping)
        ? order.domestic_shipping
        : order.domestic_shipping
          ? [order.domestic_shipping]
          : [];

      const shippingDone = shippingRows.some(
        (s: any) => s?.shipping_status === "done"
      );

      return order.order_status !== "done" && !shippingDone;
    });

    if (activeOrders.length < 2) {
      return NextResponse.json(
        { error: "합배송 가능한 주문이 2건 이상 필요합니다." },
        { status: 400 }
      );
    }

    const sorted = [...activeOrders].sort((a: any, b: any) =>
      String(a.first_order_date || a.created_at || "").localeCompare(
        String(b.first_order_date || b.created_at || "")
      )
    );

    const base = sorted[0];
    const mergeTargets = sorted.slice(1);
    const mergeTargetIds = mergeTargets.map((order: any) => order.order_id);

    const orderNos = sorted.map((order: any) =>
      String(order.customer_order_no || order.order_id || "").trim()
    );

    const baseNo =
      String(combined.customer_order_no_base || "").trim() ||
      baseOrderNo(orderNos[0] || base.order_id);

    const totalCombineCount = orderNos.reduce(
      (sum: number, no: string) => sum + combineCount(no),
      0
    );

    const finalCustomerOrderNo =
      String(combined.customer_order_no || "").trim() ||
      `${baseNo}-C${totalCombineCount}`;

    const combinedDates = Array.from(
      new Set(
        sorted.flatMap((order: any) => {
          if (Array.isArray(order.source_order_dates) && order.source_order_dates.length) {
            return order.source_order_dates;
          }
          return [order.first_order_date].filter(Boolean);
        })
      )
    ).sort();

    const shippingRows = sorted.flatMap((order: any) => {
      if (Array.isArray(order.domestic_shipping)) return order.domestic_shipping;
      if (order.domestic_shipping) return [order.domestic_shipping];
      return [];
    });

    const trackingNumbers = shippingRows
      .map((s: any) => String(s?.tracking_number || "").trim())
      .filter(Boolean);

    const uniqueTrackingNumbers = Array.from(new Set(trackingNumbers));

    const selectedTrackingNumber =
      String(combined.tracking_number ?? "").trim() ||
      trackingNumbers[trackingNumbers.length - 1] ||
      "";

    const selectedShippingType =
      String(combined.shipping_type ?? "").trim() ||
      String(shippingRows.find((s: any) => s?.shipping_type)?.shipping_type || "").trim() ||
      "일반택배";

    const itemSummary =
      String(combined.item_summary ?? "").trim() ||
      sorted
        .map((order: any) => String(order.item_summary || "").trim())
        .filter(Boolean)
        .join(" / ");

    const memo =
      String(combined.memo ?? "").trim() ||
      [
        String(base.memo || "").trim(),
        `합배송: ${orderNos.join(" + ")}`,
        uniqueTrackingNumbers.length > 1
          ? `운송장 충돌: ${uniqueTrackingNumbers.join(" / ")} → 마지막 운송장 사용`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

    const { error: updateError } = await supabase
      .from("domestic_order")
      .update({
        customer_order_no: finalCustomerOrderNo,
        source_order_dates: combinedDates,
        first_order_date:
          String(combined.first_order_date ?? "").trim() ||
          combinedDates[0] ||
          base.first_order_date,
        order_count:
          Number(combined.order_count || 0) ||
          sorted.reduce((sum: number, order: any) => sum + Number(order.order_count || 1), 0),
        item_summary: itemSummary,
        item_total_price:
          Number(combined.item_total_price || 0) ||
          sorted.reduce(
            (sum: number, order: any) => sum + Number(order.item_total_price || 0),
            0
          ),
        memo,
        updated_at: now,
      })
      .eq("order_id", base.order_id);

    if (updateError) {
      return NextResponse.json(
        { error: "대표 주문 합배송 업데이트 실패", detail: updateError.message },
        { status: 500 }
      );
    }

    const { error: shippingUpdateError } = await supabase
      .from("domestic_shipping")
      .update({
        shipping_type: selectedShippingType,
        tracking_number: selectedTrackingNumber || null,
        shipping_status: selectedTrackingNumber ? "registered" : "start",
        updated_at: now,
      })
      .eq("order_id", base.order_id);

    if (shippingUpdateError) {
      return NextResponse.json(
        { error: "대표 주문 배송정보 업데이트 실패", detail: shippingUpdateError.message },
        { status: 500 }
      );
    }

    if (mergeTargetIds.length) {
      const { error: shippingDeleteError } = await supabase
        .from("domestic_shipping")
        .delete()
        .in("order_id", mergeTargetIds);

      if (shippingDeleteError) {
        return NextResponse.json(
          { error: "합배송 대상 배송정보 삭제 실패", detail: shippingDeleteError.message },
          { status: 500 }
        );
      }

      const { error: orderDeleteError } = await supabase
        .from("domestic_order")
        .delete()
        .in("order_id", mergeTargetIds);

      if (orderDeleteError) {
        return NextResponse.json(
          { error: "합배송 대상 주문 삭제 실패", detail: orderDeleteError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        uniqueTrackingNumbers.length > 1
          ? `합배송 완료: ${finalCustomerOrderNo} / 운송장 충돌로 마지막 운송장 사용`
          : `합배송 완료: ${finalCustomerOrderNo}`,
      customer_order_no: finalCustomerOrderNo,
      base_order_id: base.order_id,
      removed_order_ids: mergeTargetIds,
      tracking_number: selectedTrackingNumber || null,
      tracking_conflict: uniqueTrackingNumbers.length > 1,
      tracking_numbers: uniqueTrackingNumbers,
    });
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
