import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IncomingRow = {
  id?: string;
  selected?: boolean;
  order_key?: string;
  phone?: string;
  file_recipient_name?: string;
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

function normalizePersonName(value: unknown) {
  return safeText(value)
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .toLowerCase();
}

function normalizeNickname(value: unknown) {
  return safeText(value)
    .normalize("NFKC")
    .replace(/^(스와숍|도파민베이커리)[-_\s]*/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function nicknamePrefix(value: unknown) {
  return Array.from(normalizeNickname(value)).slice(0, 4).join("");
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
      phone: safeText(row.phone),
      file_recipient_name: safeText(row.file_recipient_name),
      normalized_recipient_name: normalizePersonName(row.file_recipient_name),
      product_name: safeText(row.product_name),
      nickname_prefix: nicknamePrefix(row.product_name),
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
    const recipientNameMap = new Map<string, DomesticOrderMatchRow[]>();
    const nicknamePrefixMap = new Map<string, DomesticOrderMatchRow[]>();

    for (const order of orders) {
      addCandidate(
        recipientNameMap,
        normalizePersonName(order.recipient_name),
        order
      );
      addCandidate(
        nicknamePrefixMap,
        nicknamePrefix(order.nickname),
        order
      );
    }

    const previewRows = normalizedRows.map((row) => {
      const recipientCandidates = row.normalized_recipient_name
        ? recipientNameMap.get(row.normalized_recipient_name) || []
        : [];
      const nicknameCandidates = row.nickname_prefix
        ? nicknamePrefixMap.get(row.nickname_prefix) || []
        : [];

      const matchedByRecipient = pickSingle(recipientCandidates);
      const matchedByNicknamePrefix = matchedByRecipient
        ? undefined
        : pickSingle(nicknameCandidates);
      const matched = matchedByRecipient || matchedByNicknamePrefix;

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
      } else if (
        row.normalized_recipient_name &&
        recipientCandidates.length > 1 &&
        !matchedByRecipient
      ) {
        matchStatus = "duplicate_recipient_name";
      } else if (matchedByRecipient) {
        matchStatus = "matched_by_recipient_name";
      } else if (
        row.nickname_prefix &&
        nicknameCandidates.length > 1 &&
        !matchedByNicknamePrefix
      ) {
        matchStatus = "duplicate_nickname_prefix";
      } else if (matchedByNicknamePrefix) {
        matchStatus = "matched_by_nickname_prefix";
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
        duplicate_recipient_name_count:
          recipientCandidates.length > 1 ? recipientCandidates.length : 0,
        duplicate_nickname_prefix_count:
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
