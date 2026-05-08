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

  // ✅ 행별 저장은 체크박스 선택 여부와 상관없이 먼저 처리
  if (action === "update_row") {
    const orderId = String(body.order_id || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "order_id가 없습니다." },
        { status: 400 }
      );
    }

    const nextShippingStatus = body.shipping_status || "start";
    const nextOrderStatus = nextShippingStatus === "done" ? "done" : body.order_status || "accepted";

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

  // ✅ 여기부터는 체크박스로 선택한 주문들에 대한 일괄 처리
  if (!orderIds.length) {
    return NextResponse.json(
      { error: "선택된 주문이 없습니다." },
      { status: 400 }
    );
  }


  if (action === "combine_shipping") {
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
      const shippingDone = shippingRows.some((s: any) => s?.shipping_status === "done");
      return order.order_status !== "done" && !shippingDone;
    });

    if (activeOrders.length < 2) {
      return NextResponse.json(
        { error: "합배송 가능한 주문이 2건 이상 필요합니다. 배송완료 주문은 제외됩니다." },
        { status: 400 }
      );
    }

    const nicknames = Array.from(
      new Set(activeOrders.map((order: any) => String(order.nickname || "").trim()).filter(Boolean))
    );

    if (nicknames.length !== 1) {
      return NextResponse.json(
        { error: "닉네임이 같은 주문만 합배송할 수 있습니다." },
        { status: 400 }
      );
    }

    const dateSet = new Set(activeOrders.map((order: any) => order.first_order_date || "날짜없음"));
    if (dateSet.size < 2) {
      return NextResponse.json(
        { error: "주문일이 다른 주문만 합배송 제안 대상입니다." },
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

    const shortOrderNo = (value: unknown) => {
      const clean = String(value || "").trim();
      if (!clean) return "";
      return clean.length > 5 ? clean.slice(-5) : clean;
    };

    const uniqueValues = (values: unknown[]) =>
      Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

    const shippingRows = sorted.flatMap((order: any) => {
      if (Array.isArray(order.domestic_shipping)) return order.domestic_shipping;
      if (order.domestic_shipping) return [order.domestic_shipping];
      return [];
    });

    const existingTrackingNumbers = uniqueValues(shippingRows.map((shipping: any) => shipping?.tracking_number));
    const existingShippingTypes = uniqueValues(shippingRows.map((shipping: any) => shipping?.shipping_type));

    const combinedOrderNoDefault = sorted
      .map((order: any) => shortOrderNo(order.customer_order_no || order.order_id))
      .filter(Boolean)
      .join("-");

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

    const combinedItemSummaryDefault = sorted
      .map((order: any) => String(order.item_summary || "").trim())
      .filter(Boolean)
      .join(" / ");

    const combinedMemoDefault = [
      String(base.memo || "").trim(),
      `합배송: ${sorted.map((order: any) => order.customer_order_no || order.order_id).join(" + ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const selectedTrackingNumber = String(
      combined.tracking_number ?? existingTrackingNumbers[0] ?? ""
    ).trim();
    const selectedShippingType = String(
      combined.shipping_type ?? existingShippingTypes[0] ?? "일반택배"
    ).trim() || "일반택배";

    const { error: updateError } = await supabase
      .from("domestic_order")
      .update({
        customer_order_no:
          String(combined.customer_order_no ?? "").trim() ||
          combinedOrderNoDefault ||
          base.customer_order_no ||
          base.order_id,
        source_order_dates: combinedDates,
        first_order_date:
          String(combined.first_order_date ?? "").trim() || combinedDates[0] || base.first_order_date,
        order_count:
          Number(combined.order_count || 0) ||
          sorted.reduce((sum: number, order: any) => sum + Number(order.order_count || 1), 0),
        item_summary:
          String(combined.item_summary ?? "").trim() || combinedItemSummaryDefault,
        item_total_price:
          Number(combined.item_total_price || 0) ||
          sorted.reduce((sum: number, order: any) => sum + Number(order.item_total_price || 0), 0),
        memo: String(combined.memo ?? "").trim() || combinedMemoDefault,
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
      message: `합배송 완료: ${
        String(combined.customer_order_no ?? "").trim() || combinedOrderNoDefault || base.order_id
      }`,
      base_order_id: base.order_id,
      removed_order_ids: mergeTargetIds,
      tracking_number: selectedTrackingNumber || null,
    });
  }

  if (action === "checked" || action === "packaged") {
    const nextOrderStatus = action === "packaged" ? "packaged" : "checked";
    const { error } = await supabase
      .from("domestic_order")
      .update({ order_status: nextOrderStatus, updated_at: now })
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
    const nextShippingStatus = action === "registered" ? "registered" : "uploaded";
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
      .update({ order_status: "done", updated_at: now })
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
