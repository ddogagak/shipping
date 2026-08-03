import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IncomingRow = {
  id?: string;
  selected?: boolean;
  order_key?: string;
  phone?: string;
  product_name?: string;
  tracking_number?: string;
  final_product_status?: string;
};

type ShippingRow = {
  carrier: string | null;
  shipping_type: string | null;
  tracking_number: string | null;
  shipping_status: string | null;
  excel_exported_at: string | null;
};

type DomesticOrderMatchRow = {
  order_id: string;
  customer_order_no: string | null;
  nickname: string | null;
  recipient_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  order_status: string | null;
  first_order_date: string | null;
  domestic_shipping: ShippingRow | ShippingRow[] | null;
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

function hasMaskedPhone(value: unknown) {
  return /[*xX]/.test(safeText(value));
}

function normalizeNickname(value: unknown) {
  return safeText(value).replace(/\s+/g, "").toLowerCase();
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

function shipping(order?: DomesticOrderMatchRow) {
  if (!order) return null;
  if (Array.isArray(order.domestic_shipping)) {
    return order.domestic_shipping[0] || null;
  }
  return order.domestic_shipping || null;
}

function addCandidate(
  map: Map<string, DomesticOrderMatchRow[]>,
  key: string,
  order: DomesticOrderMatchRow
) {
  if (!key) return;
  const list = map.get(key) || [];
  if (!list.some((item) => item.order_id === order.order_id)) {
    list.push(order);
  }
  map.set(key, list);
}

function pickSingle(candidates: DomesticOrderMatchRow[]) {
  if (candidates.length === 1) return candidates[0];

  // 같은 키로 여러 주문이 있을 때 완료되지 않은 주문이 정확히 하나면 그 주문을 사용한다.
  const active = candidates.filter((order) => {
    const s = shipping(order);
    return order.order_status !== "done" && s?.shipping_status !== "done";
  });

  return active.length === 1 ? active[0] : undefined;
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
      normalized_phone: hasMaskedPhone(row.phone) ? "" : normalizePhone(row.phone),
      product_name: safeText(row.product_name),
      normalized_nickname: normalizeNickname(row.product_name),
      tracking_number: cleanTrackingNumber(row.tracking_number),
      final_product_status: safeText(row.final_product_status),
    }));

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("domestic_order")
      .select(`
        order_id,
        customer_order_no,
        nickname,
        recipient_name,
        phone,
        postal_code,
        address,
        order_status,
        first_order_date,
        domestic_shipping (
          carrier,
          shipping_type,
          tracking_number,
          shipping_status,
          excel_exported_at
        )
      `);

    if (error) {
      return NextResponse.json(
        { error: "국내 주문 조회 실패", detail: error.message },
        { status: 500 }
      );
    }

    const orders = (data || []) as DomesticOrderMatchRow[];
    const orderKeyMap = new Map<string, DomesticOrderMatchRow[]>();
    const phoneMap = new Map<string, DomesticOrderMatchRow[]>();
    const nicknameMap = new Map<string, DomesticOrderMatchRow[]>();

    for (const order of orders) {
      const rawOrderId = safeText(order.order_id);
      const rawCustomerNo = safeText(order.customer_order_no);

      addCandidate(orderKeyMap, rawOrderId, order);
      addCandidate(orderKeyMap, rawCustomerNo, order);
      addCandidate(orderKeyMap, normalizeOrderKey(rawOrderId), order);
      addCandidate(orderKeyMap, normalizeOrderKey(rawCustomerNo), order);
      addCandidate(phoneMap, normalizePhone(order.phone), order);
      addCandidate(nicknameMap, normalizeNickname(order.nickname), order);
    }

    const previewRows = normalizedRows.map((row) => {
      const phoneCandidates = row.normalized_phone
        ? phoneMap.get(row.normalized_phone) || []
        : [];
      const orderCandidates = [
        ...(orderKeyMap.get(row.order_key) || []),
        ...(orderKeyMap.get(row.normalized_order_key) || []),
      ].filter(
        (order, index, list) =>
          list.findIndex((item) => item.order_id === order.order_id) === index
      );
      const nicknameCandidates = row.normalized_nickname
        ? nicknameMap.get(row.normalized_nickname) || []
        : [];

      const matchedByPhone = pickSingle(phoneCandidates);
      const matchedByOrder = pickSingle(orderCandidates);
      const matchedByNickname = pickSingle(nicknameCandidates);
      const matched = matchedByPhone || matchedByOrder || matchedByNickname;
      const currentShipping = shipping(matched);
      const completeFromFile = isCompleteStatus(row.final_product_status);
      const currentOrderStatus = matched?.order_status || "";
      const currentShippingStatus = currentShipping?.shipping_status || "start";
      const existingTrackingNumber = cleanTrackingNumber(
        currentShipping?.tracking_number
      );
      const alreadyDone =
        currentOrderStatus === "done" || currentShippingStatus === "done";

      let matchStatus = "not_found";
      if (!row.tracking_number) {
        matchStatus = "missing_tracking";
      } else if (row.normalized_phone && phoneCandidates.length > 1 && !matchedByPhone) {
        matchStatus = "duplicate_phone";
      } else if (matchedByPhone) {
        matchStatus = "matched_by_phone";
      } else if (matchedByOrder) {
        if (matchedByOrder.order_id === row.order_key) {
          matchStatus = "matched_by_order_id";
        } else if (matchedByOrder.customer_order_no === row.order_key) {
          matchStatus = "matched_by_customer_order_no";
        } else {
          matchStatus = "matched_by_normalized_order_no";
        }
      } else if (
        row.normalized_nickname &&
        nicknameCandidates.length > 1 &&
        !matchedByNickname
      ) {
        matchStatus = "duplicate_nickname";
      } else if (matchedByNickname) {
        matchStatus = "matched_by_nickname";
      }

      const trackingComparison = !matched
        ? "unmatched"
        : !existingTrackingNumber
          ? "new"
          : existingTrackingNumber === row.tracking_number
            ? "same"
            : "changed";

      const nextShippingStatus = alreadyDone
        ? "done"
        : completeFromFile
          ? "done"
          : "uploaded";
      const nextOrderStatus = alreadyDone || completeFromFile
        ? "done"
        : currentOrderStatus;

      const canSave = Boolean(
        matched && row.tracking_number && !alreadyDone
      );

      return {
        ...row,
        selected: canSave,
        matched_order_id: matched?.order_id || "",
        customer_order_no: matched?.customer_order_no || "",
        nickname: matched?.nickname || "",
        recipient_name: matched?.recipient_name || "",
        db_phone: matched?.phone || "",
        postal_code: matched?.postal_code || "",
        address: matched?.address || "",
        first_order_date: matched?.first_order_date || "",
        current_order_status: currentOrderStatus,
        current_shipping_status: currentShippingStatus,
        current_shipping_type: currentShipping?.shipping_type || "",
        existing_tracking_number: existingTrackingNumber,
        match_status: matchStatus,
        tracking_comparison: trackingComparison,
        already_done: alreadyDone,
        can_save: canSave,
        next_shipping_status: nextShippingStatus,
        next_order_status: nextOrderStatus,
        duplicate_phone_count: phoneCandidates.length > 1 ? phoneCandidates.length : 0,
        duplicate_nickname_count:
          nicknameCandidates.length > 1 ? nicknameCandidates.length : 0,
      };
    });

    const matchedCount = previewRows.filter((row) => row.matched_order_id).length;
    const completeCount = previewRows.filter(
      (row) => row.matched_order_id && row.next_shipping_status === "done"
    ).length;

    return NextResponse.json({
      ok: true,
      rows: previewRows,
      total: previewRows.length,
      matched_count: matchedCount,
      complete_count: completeCount,
      unmatched_count: previewRows.length - matchedCount,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "운송장 미리보기 중 오류",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
