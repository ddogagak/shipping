import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IncomingRow = {
  id?: string;
  selected?: boolean;
  phone?: string;
  file_recipient_name?: string;
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

function visiblePhoneDigits(value: unknown) {
  return normalizePhone(value);
}

function hasMaskedPhone(value: unknown) {
  return /[*xX]/.test(safeText(value));
}

function normalizeRecipientName(value: unknown) {
  return safeText(value)
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .toLowerCase();
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

function uniqueOrders(orders: DomesticOrderMatchRow[]) {
  return orders.filter(
    (order, index, list) =>
      list.findIndex((item) => item.order_id === order.order_id) === index
  );
}

function pickSingle(candidates: DomesticOrderMatchRow[]) {
  const unique = uniqueOrders(candidates);
  if (unique.length === 1) return unique[0];

  // 같은 번호에 여러 주문이 있더라도 미완료 주문이 정확히 하나면 그 주문을 사용한다.
  const active = unique.filter((order) => {
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
      phone: safeText(row.phone),
      phone_digits: visiblePhoneDigits(row.phone),
      phone_masked: hasMaskedPhone(row.phone),
      file_recipient_name: safeText(row.file_recipient_name),
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

    const previewRows = normalizedRows.map((row) => {
      let phoneCandidates: DomesticOrderMatchRow[] = [];

      if (row.phone_digits) {
        phoneCandidates = orders.filter((order) => {
          const dbPhone = normalizePhone(order.phone);
          if (!dbPhone) return false;

          // 한진 파일처럼 뒷자리가 ****인 경우 보이는 앞자리 숫자만 비교한다.
          if (row.phone_masked) {
            return dbPhone.startsWith(row.phone_digits);
          }

          return dbPhone === row.phone_digits;
        });
      }

      phoneCandidates = uniqueOrders(phoneCandidates);
      const matched = pickSingle(phoneCandidates);
      const currentShipping = shipping(matched);
      const completeFromFile = isCompleteStatus(row.final_product_status);
      const currentOrderStatus = matched?.order_status || "";
      const currentShippingStatus = currentShipping?.shipping_status || "start";
      const existingTrackingNumber = cleanTrackingNumber(
        currentShipping?.tracking_number
      );
      const alreadyDone =
        currentOrderStatus === "done" || currentShippingStatus === "done";

      const fileRecipient = normalizeRecipientName(row.file_recipient_name);
      const dbRecipient = normalizeRecipientName(matched?.recipient_name);
      const recipientNameMismatch = Boolean(
        matched && fileRecipient && dbRecipient && fileRecipient !== dbRecipient
      );

      let matchStatus = "not_found";
      if (!row.tracking_number) {
        matchStatus = "missing_tracking";
      } else if (!row.phone_digits) {
        matchStatus = "missing_phone";
      } else if (phoneCandidates.length > 1 && !matched) {
        matchStatus = row.phone_masked
          ? "duplicate_masked_phone"
          : "duplicate_phone";
      } else if (matched) {
        matchStatus = row.phone_masked
          ? "matched_by_masked_phone"
          : "matched_by_phone";
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

      const canSave = Boolean(matched && row.tracking_number && !alreadyDone);

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
        recipient_name_mismatch: recipientNameMismatch,
        phone_candidate_count: phoneCandidates.length,
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
