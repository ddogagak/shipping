import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IncomingRow = {
  id?: string;
  selected?: boolean;
  order_key?: string;
  phone?: string;
  tracking_number?: string;
  final_product_status?: string;
};

type DomesticOrderMatchRow = {
  order_id: string;
  customer_order_no: string | null;
  recipient_name: string | null;
  phone: string | null;
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

function normalizePhone(value: unknown) {
  return safeText(value).replace(/\D/g, "");
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

function addOrderToMap(
  map: Map<string, DomesticOrderMatchRow>,
  order: DomesticOrderMatchRow
) {
  const keys = [
    order.order_id,
    order.customer_order_no,
    normalizeOrderKey(order.order_id),
    normalizeOrderKey(order.customer_order_no),
  ]
    .map((value) => safeText(value))
    .filter(Boolean);

  keys.forEach((key) => {
    if (!map.has(key)) {
      map.set(key, order);
    }
  });
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
      normalized_order_key: normalizeOrderKey(row.order_key),
      phone: safeText(row.phone),
      normalized_phone: normalizePhone(row.phone),
      tracking_number: cleanTrackingNumber(row.tracking_number),
      final_product_status: safeText(row.final_product_status),
    }));

    const orderKeys = Array.from(
      new Set(
        normalizedRows
          .flatMap((row) => [row.order_key, row.normalized_order_key])
          .filter(Boolean)
      )
    );

    const phoneKeys = Array.from(
      new Set(normalizedRows.map((row) => row.normalized_phone).filter(Boolean))
    );

    const supabase = createServiceRoleClient();

    const orderMap = new Map<string, DomesticOrderMatchRow>();
    const phoneMap = new Map<string, DomesticOrderMatchRow[]>();

    const addPhoneMatch = (order: DomesticOrderMatchRow) => {
      const phone = normalizePhone(order.phone);
      if (!phone) return;

      const list = phoneMap.get(phone) || [];
      if (!list.some((item) => item.order_id === order.order_id)) {
        list.push(order);
      }
      phoneMap.set(phone, list);
    };

    if (phoneKeys.length) {
      const { data: phoneOrders, error: phoneOrdersError } = await supabase
        .from("domestic_order")
        .select("order_id, customer_order_no, recipient_name, phone")
        .not("phone", "is", null);

      if (phoneOrdersError) {
        return NextResponse.json(
          { error: "전화번호 조회 실패", detail: phoneOrdersError.message },
          { status: 500 }
        );
      }

      for (const order of phoneOrders || []) {
        const typedOrder = order as DomesticOrderMatchRow;
        if (phoneKeys.includes(normalizePhone(typedOrder.phone))) {
          addPhoneMatch(typedOrder);
        }
      }
    }

    if (orderKeys.length) {
      const { data: byOrderId, error: orderIdError } = await supabase
        .from("domestic_order")
        .select("order_id, customer_order_no, recipient_name, phone")
        .in("order_id", orderKeys);

      if (orderIdError) {
        return NextResponse.json(
          { error: "주문번호 조회 실패", detail: orderIdError.message },
          { status: 500 }
        );
      }

      const { data: byCustomerOrderNo, error: customerOrderNoError } = await supabase
        .from("domestic_order")
        .select("order_id, customer_order_no, recipient_name, phone")
        .in("customer_order_no", orderKeys);

      if (customerOrderNoError) {
        return NextResponse.json(
          { error: "고객주문번호 조회 실패", detail: customerOrderNoError.message },
          { status: 500 }
        );
      }

      for (const row of [...(byOrderId || []), ...(byCustomerOrderNo || [])]) {
        const typedRow = row as DomesticOrderMatchRow;
        addOrderToMap(orderMap, typedRow);
        addPhoneMatch(typedRow);
      }

      const stillUnmatchedKeys = normalizedRows
        .filter((row) => {
          const phoneMatches = row.normalized_phone
            ? phoneMap.get(row.normalized_phone) || []
            : [];

          return (
            phoneMatches.length === 0 &&
            row.order_key &&
            !orderMap.get(row.order_key) &&
            !orderMap.get(row.normalized_order_key)
          );
        })
        .map((row) => row.normalized_order_key)
        .filter(Boolean);

      if (stillUnmatchedKeys.length) {
        const { data: allOrders, error: allOrdersError } = await supabase
          .from("domestic_order")
          .select("order_id, customer_order_no, recipient_name, phone");

        if (allOrdersError) {
          return NextResponse.json(
            { error: "전체 주문번호 조회 실패", detail: allOrdersError.message },
            { status: 500 }
          );
        }

        for (const row of allOrders || []) {
          const typedRow = row as DomesticOrderMatchRow;
          addOrderToMap(orderMap, typedRow);
          addPhoneMatch(typedRow);
        }
      }
    }

    const previewRows = normalizedRows.map((row) => {
      const phoneMatches = row.normalized_phone
        ? phoneMap.get(row.normalized_phone) || []
        : [];

      const matchedByPhone =
        phoneMatches.length === 1 ? phoneMatches[0] : undefined;

      const matchedByOrderNo =
        orderMap.get(row.order_key) ||
        orderMap.get(row.normalized_order_key);

      const matched = matchedByPhone || matchedByOrderNo;
      const complete = isCompleteStatus(row.final_product_status);
      let matchStatus = "not_found";

      if (!row.tracking_number) {
        matchStatus = "missing_tracking";
      } else if (phoneMatches.length > 1) {
        matchStatus = "duplicate_phone";
      } else if (matchedByPhone) {
        matchStatus = "matched_by_phone";
      } else if (matched?.order_id === row.order_key) {
        matchStatus = "matched_by_order_id";
      } else if (matched?.customer_order_no === row.order_key) {
        matchStatus = "matched_by_customer_order_no";
      } else if (matched) {
        matchStatus = "matched_by_normalized_order_no";
      }

      return {
        ...row,
        selected: Boolean(matched && row.tracking_number && phoneMatches.length <= 1),
        matched_order_id: matched?.order_id || "",
        customer_order_no: matched?.customer_order_no || "",
        recipient_name: matched?.recipient_name || "",
        match_status: matchStatus,
        duplicate_phone_count: phoneMatches.length > 1 ? phoneMatches.length : 0,
        next_shipping_status: complete ? "done" : "uploaded",
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
