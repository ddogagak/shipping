import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ResolvedOrder = {
  order_id: string;
  customer_order_no: string | null;
};

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  return safeText(value).replace(/\s/g, "");
}

function cleanTrackingNumber(value: unknown) {
  return safeText(value).replace(/^'+/, "");
}

function normalizeOrderKey(value: unknown) {
  return safeText(value)
    .replace(/\s+/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/-C\d+$/i, "");
}

function isCompleteStatus(value: unknown) {
  const status = normalizeStatus(value);

  return (
    status.includes("배송출발") ||
    status.includes("배송완료") ||
    status.includes("집화처리")
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => safeText(value)).filter(Boolean)));
}

function getCandidateKeys(row: any) {
  const rawValues = [
    row?.matched_order_id,
    row?.db_order_id,
    row?.database_order_id,
    row?.order_id,
    row?.order_number,
    row?.order_key,
    row?.customer_order_no,
  ];

  return unique(
    rawValues.flatMap((value) => {
      const raw = safeText(value);
      const normalized = normalizeOrderKey(value);
      return [raw, normalized];
    })
  );
}

async function resolveExistingShippingOrderId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: any
) {
  const candidateKeys = getCandidateKeys(row);

  if (!candidateKeys.length) {
    return {
      orderId: "",
      triedKeys: [],
      triedOrderIds: [],
    };
  }

  const orderMap = new Map<string, ResolvedOrder>();

  const { data: byOrderId, error: orderIdError } = await supabase
    .from("domestic_order")
    .select("order_id, customer_order_no")
    .in("order_id", candidateKeys);

  if (orderIdError) throw orderIdError;

  const { data: byCustomerOrderNo, error: customerOrderNoError } = await supabase
    .from("domestic_order")
    .select("order_id, customer_order_no")
    .in("customer_order_no", candidateKeys);

  if (customerOrderNoError) throw customerOrderNoError;

  for (const order of [...(byOrderId || []), ...(byCustomerOrderNo || [])] as ResolvedOrder[]) {
    orderMap.set(order.order_id, order);
  }

  // 괄호 제거/공백 제거로 매칭되는 경우를 위해 전체 주문도 한 번 확인
  const needNormalizedFallback = candidateKeys.some((key) => normalizeOrderKey(key) !== key);

  if (needNormalizedFallback) {
    const { data: allOrders, error: allOrdersError } = await supabase
      .from("domestic_order")
      .select("order_id, customer_order_no");

    if (allOrdersError) throw allOrdersError;

    const candidateSet = new Set(candidateKeys);

    for (const order of (allOrders || []) as ResolvedOrder[]) {
      const possibleKeys = [
        order.order_id,
        order.customer_order_no || "",
        normalizeOrderKey(order.order_id),
        normalizeOrderKey(order.customer_order_no),
      ];

      if (possibleKeys.some((key) => candidateSet.has(key))) {
        orderMap.set(order.order_id, order);
      }
    }
  }

  const candidateOrderIds = unique([
    ...candidateKeys,
    ...Array.from(orderMap.keys()),
  ]);

  const { data: shippingRows, error: shippingError } = await supabase
    .from("domestic_shipping")
    .select("order_id")
    .in("order_id", candidateOrderIds);

  if (shippingError) throw shippingError;

  const existingShippingOrderIds = new Set(
    (shippingRows || []).map((shipping) => safeText(shipping.order_id))
  );

  const priority = unique([
    safeText(row?.matched_order_id),
    ...Array.from(orderMap.keys()),
    ...candidateKeys,
  ]);

  const orderId = priority.find((value) => existingShippingOrderIds.has(value)) || "";

  return {
    orderId,
    triedKeys: candidateKeys,
    triedOrderIds: candidateOrderIds,
  };
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
        raw: row,
        tracking_number: cleanTrackingNumber(row.tracking_number),
        final_product_status: safeText(row.final_product_status),
      }))
      .filter((row) => row.tracking_number);

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
      const resolved = await resolveExistingShippingOrderId(supabase, row.raw);

      if (!resolved.orderId) {
        return NextResponse.json(
          {
            error: "운송장 저장 실패",
            detail:
              "미리보기에서는 매칭됐지만 저장 시 domestic_shipping 기존 행을 찾지 못했습니다.",
            tried_keys: resolved.triedKeys,
            tried_order_ids: resolved.triedOrderIds,
          },
          { status: 500 }
        );
      }

      const complete = isCompleteStatus(row.final_product_status);

      // 운송장 새 입력/재접수는 uploaded = 운송장 입력
      // 집화처리/배송출발/배송완료는 done = 배송완료
      const shippingStatus = complete ? "done" : "uploaded";

      // 기존 행만 업데이트. 새로 생성하지 않음.
      // 이미 운송장이 있어도 엑셀 운송장으로 덮어씀.
      const { data: updatedShippingRows, error: shippingError } = await supabase
        .from("domestic_shipping")
        .update({
          tracking_number: row.tracking_number,
          shipping_status: shippingStatus,
          updated_at: now,
        })
        .eq("order_id", resolved.orderId)
        .select("order_id");

      if (shippingError) {
        return NextResponse.json(
          {
            error: "운송장 저장 실패",
            order_id: resolved.orderId,
            detail: shippingError.message,
          },
          { status: 500 }
        );
      }

      if (!updatedShippingRows?.length) {
        return NextResponse.json(
          {
            error: "운송장 저장 실패",
            order_id: resolved.orderId,
            detail: "domestic_shipping 업데이트 대상이 0건입니다.",
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
          .eq("order_id", resolved.orderId)
          .select("order_id");

        if (orderError) {
          return NextResponse.json(
            {
              error: "주문상태 완료 처리 실패",
              order_id: resolved.orderId,
              detail: orderError.message,
            },
            { status: 500 }
          );
        }

        if (!updatedOrderRows?.length) {
          return NextResponse.json(
            {
              error: "주문상태 완료 처리 실패",
              order_id: resolved.orderId,
              detail: "domestic_order 업데이트 대상이 0건입니다.",
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
