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

export async function PATCH(req: Request) {
  try {
    const { rows } = await req.json();

    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows required" }, { status: 400 });
    }

    const selectedRows = rows
      .filter((row: any) => row?.selected !== false)
      .map((row: any) => ({
        order_id: safeText(row.matched_order_id || row.order_id),
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
      const shippingStatus = complete ? "done" : "uploaded";

      const { error: shippingError } = await supabase
        .from("domestic_shipping")
        .update({
          // 이미 운송장이 있어도 엑셀 운송장으로 덮어씀
          tracking_number: row.tracking_number,
          // 엑셀 입력 직후 기본값은 운송장 입력(uploaded), 완료계열이면 배송완료(done)
          shipping_status: shippingStatus,
          updated_at: now,
        })
        .eq("order_id", row.order_id);

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

      if (complete) {
        const { error: orderError } = await supabase
          .from("domestic_order")
          .update({
            order_status: "done",
            updated_at: now,
          })
          .eq("order_id", row.order_id);

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
