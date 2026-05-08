import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IncomingRow = {
  id?: string;
  selected?: boolean;
  order_key?: string;
  tracking_number?: string;
  final_product_status?: string;
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

function isCompleteStatus(value: unknown) {
  const status = normalizeStatus(value);
  return status === "배송출발" || status === "배송완료";
}

export async function POST(req: Request) {
  try {
    const { rows } = await req.json();

    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows required" }, { status: 400 });
    }

    const normalizedRows = rows.map((row: IncomingRow, index: number) => ({
      id: safeText(row.id) || String(index),
      selected: Boolean(row.selected),
      order_key: safeText(row.order_key),
      tracking_number: cleanTrackingNumber(row.tracking_number),
      final_product_status: safeText(row.final_product_status),
    }));

    const orderKeys = Array.from(
      new Set(normalizedRows.map((row) => row.order_key).filter(Boolean))
    );

    const supabase = createServiceRoleClient();
    const orderMap = new Map<
      string,
      {
        order_id: string;
        customer_order_no: string | null;
        recipient_name: string | null;
      }
    >();

    if (orderKeys.length) {
      const { data: byOrderId, error: orderIdError } = await supabase
        .from("domestic_order")
        .select("order_id, customer_order_no, recipient_name")
        .in("order_id", orderKeys);

      if (orderIdError) {
        return NextResponse.json(
          { error: "주문번호 조회 실패", detail: orderIdError.message },
          { status: 500 }
        );
      }

      const { data: byCustomerOrderNo, error: customerOrderNoError } = await supabase
        .from("domestic_order")
        .select("order_id, customer_order_no, recipient_name")
        .in("customer_order_no", orderKeys);

      if (customerOrderNoError) {
        return NextResponse.json(
          { error: "고객주문번호 조회 실패", detail: customerOrderNoError.message },
          { status: 500 }
        );
      }

      for (const row of [...(byOrderId || []), ...(byCustomerOrderNo || [])]) {
        const item = {
          order_id: row.order_id,
          customer_order_no: row.customer_order_no,
          recipient_name: row.recipient_name,
        };

        if (row.order_id) orderMap.set(row.order_id, item);
        if (row.customer_order_no) orderMap.set(row.customer_order_no, item);
      }
    }

    const previewRows = normalizedRows.map((row) => {
      const matched = orderMap.get(row.order_key);
      const complete = isCompleteStatus(row.final_product_status);
      let matchStatus = "not_found";

      if (!row.tracking_number) {
        matchStatus = "missing_tracking";
      } else if (matched?.order_id === row.order_key) {
        matchStatus = "matched_by_order_id";
      } else if (matched) {
        matchStatus = "matched_by_customer_order_no";
      }

      return {
        ...row,
        selected: Boolean(matched && row.tracking_number),
        matched_order_id: matched?.order_id || "",
        customer_order_no: matched?.customer_order_no || "",
        recipient_name: matched?.recipient_name || "",
        match_status: matchStatus,
        next_shipping_status: complete ? "done" : "registered",
        next_order_status: complete ? "done" : "",
      };
    });

    const matchedCount = previewRows.filter((row) => row.matched_order_id).length;
    const completeCount = previewRows.filter(
      (row) => row.matched_order_id && isCompleteStatus(row.final_product_status)
    ).length;

    return NextResponse.json({
      ok: true,
      rows: previewRows,
      total: previewRows.length,
      matched_count: matchedCount,
      complete_count: completeCount,
      unmatched_count: previewRows.length - matchedCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "운송장 미리보기 중 오류", detail: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
