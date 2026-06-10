import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  return safeText(value).replace(/\s/g, "");
}

function cleanTrackingNumber(value: unknown) {
  return safeText(value).replace(/^'+/, "");
}

function isCompleteStatus(value: unknown) {
  const status = normalizeStatus(value);

  return (
    status.includes("배송출발") ||
    status.includes("배송완료") ||
    status.includes("집화처리")
  );
}

function getRowOrderId(row: any) {
  return safeText(
    row?.matched_order_id ||
      row?.db_order_id ||
      row?.database_order_id ||
      row?.order_id ||
      row?.order_number
  );
}

export async function PATCH(req: Request) {
  try {
    const { rows } = await req.json();

    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows required" }, { status: 400 });
    }

    const selectedRows = rows
      .filter((row: any) => row?.selected !== false)
      .map((row: any) => ({
        order_id: getRowOrderId(row),
        tracking_number: cleanTrackingNumber(row.tracking_number),
        final_product_status: safeText(row.final_product_status),
      }))
      .filter((row) => row.order_id && row.tracking_number);

    if (!selectedRows.length) {
      return NextResponse.json(
        { error: "저장할 선택 행이 없습니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    let updated = 0;
    let completed = 0;
    let uploaded = 0;

    for (const row of selectedRows) {
      const complete = isCompleteStatus(row.final_product_status);

      // 엑셀 입력 기본값은 uploaded = 운송장 입력
      // 집화처리/배송출발/배송완료는 done = 배송완료
      const shippingStatus = complete ? "done" : "uploaded";

      // 기존 domestic_shipping 행만 업데이트함.
      // 없는 행을 새로 만들지 않음.
      // 이미 운송장이 있어도 엑셀 운송장으로 덮어씀.
      const { data: updatedShippingRows, error: shippingError } = await supabase
        .from("domestic_shipping")
        .update({
          tracking_number: row.tracking_number,
          shipping_status: shippingStatus,
          updated_at: now,
        })
        .eq("order_id", row.order_id)
        .select("order_id");

      if (shippingError) {
        return NextResponse.json(
          {
            error: "운송장 저장 실패",
            order_id: row.order_id,
            detail: shippingError.message,
          },
          { status: 500 }
        );
      }

      if (!updatedShippingRows?.length) {
        return NextResponse.json(
          {
            error: "운송장 저장 실패",
            order_id: row.order_id,
            detail:
              "매칭된 주문은 있지만 domestic_shipping 업데이트 대상이 0건입니다. 전달된 DB 주문ID 또는 domestic_shipping 행을 확인해야 합니다.",
          },
          { status: 500 }
        );
      }

      if (complete) {
        const { data: updatedOrderRows, error: orderError } = await supabase
          .from("domestic_order")
          .update({
            order_status: "done",
            updated_at: now,
          })
          .eq("order_id", row.order_id)
          .select("order_id");

        if (orderError) {
          return NextResponse.json(
            {
              error: "주문상태 완료 처리 실패",
              order_id: row.order_id,
              detail: orderError.message,
            },
            { status: 500 }
          );
        }

        if (!updatedOrderRows?.length) {
          return NextResponse.json(
            {
              error: "주문상태 완료 처리 실패",
              order_id: row.order_id,
              detail:
                "domestic_order 업데이트 대상이 0건입니다. 전달된 DB 주문ID를 확인해야 합니다.",
            },
            { status: 500 }
          );
        }

        completed += 1;
      } else {
        uploaded += 1;
      }

      updated += 1;
    }

    return NextResponse.json({
      ok: true,
      requested: selectedRows.length,
      updated,
      completed,
      uploaded,
      skipped: rows.length - selectedRows.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "운송장 저장 중 오류", detail: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

