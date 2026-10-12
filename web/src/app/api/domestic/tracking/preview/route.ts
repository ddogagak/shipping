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
  pickup_status?: string;
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

function isPickedUp(value: unknown) {
  const status = normalizeStatus(value).toUpperCase();
  return status === "○" || status === "O" || status === "Y" || status === "YES";
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

function pickSingle(candidates: DomesticOrderMatchRow[], trackingNumber?: string) {
  if (candidates.length === 1) return candidates[0];

  const tracking = cleanTrackingNumber(trackingNumber);
  if (tracking) {
    const sameTracking = candidates.filter(
      (order) => cleanTrackingNumber(shipping(order)?.tracking_number) === tracking
    );
    if (sameTracking.length === 1) return sameTracking[0];
  }

  // Only eligible (not completed) orders reach this function.
  // Never resolve ambiguous candidates by guessing.
  return undefined;
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
      pickup_status: safeText(row.pickup_status),
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
      // Exclude completed orders BEFORE constructing either match index.
      // Completion of the order OR delivery is enough to exclude it.
      if (
        normalizeStatus(order.order_status).toLowerCase() === "done" ||
        normalizeStatus(shipping(order)?.shipping_status).toLowerCase() === "done"
      ) continue;

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

      const matchedByNicknamePrefix = pickSingle(nicknameCandidates, row.tracking_number);
      const matchedByRecipient = matchedByNicknamePrefix
        ? undefined
        : pickSingle(recipientCandidates, row.tracking_number);
      const matched = matchedByNicknamePrefix || matchedByRecipient;

      const currentShipping = shipping(matched);
      const completeFromFile = isPickedUp(row.pickup_status);
      const currentOrderStatus = matched?.order_status || "";
      const currentShippingStatus = currentShipping?.shipping_status || "start";
      const existingTrackingNumber = cleanTrackingNumber(
        currentShipping?.tracking_number
      );
      const shippingAlreadyDone = currentShippingStatus === "done";
      const orderAlreadyDone = currentOrderStatus === "done";
      const sameTracking =
        Boolean(existingTrackingNumber) &&
        existingTrackingNumber === row.tracking_number;
      // Completed orders are excluded from candidate indexes above.
      const alreadyDone = shippingAlreadyDone || orderAlreadyDone;

      let matchStatus = "not_found";
      if (!row.tracking_number) {
        matchStatus = "missing_tracking";
      } else if (
        row.nickname_prefix &&
        nicknameCandidates.length > 1 &&
        !matchedByNicknamePrefix
      ) {
        matchStatus = "duplicate_nickname_prefix";
      } else if (matchedByNicknamePrefix) {
        matchStatus = "matched_by_nickname_prefix";
      } else if (
        row.normalized_recipient_name &&
        recipientCandidates.length > 1 &&
        !matchedByRecipient
      ) {
        matchStatus = "duplicate_recipient_name";
      } else if (matchedByRecipient) {
        matchStatus = "matched_by_recipient_name";
      }

      const trackingComparison = !matched
        ? "unmatched"
        : !existingTrackingNumber
          ? "new"
          : existingTrackingNumber === row.tracking_number
            ? "same"
            : "changed";

      const nextShippingStatus = completeFromFile ? "done" : "uploaded";
      const nextOrderStatus = alreadyDone || completeFromFile
        ? "done"
        : currentOrderStatus;

      const canSave = Boolean(
        matched &&
        row.tracking_number &&
        !shippingAlreadyDone &&
        !orderAlreadyDone
      );

      const candidateOrders = [...nicknameCandidates, ...recipientCandidates]
        .filter((order, index, all) => all.findIndex((item) => item.order_id === order.order_id) === index)
        .slice(0, 8)
        .map((order) => ({
          order_id: order.order_id,
          customer_order_no: order.customer_order_no || "",
          nickname: order.nickname || "",
          recipient_name: order.recipient_name || "",
          phone: order.phone || "",
        }));
      const matchDetail = matched
        ? "매칭됨"
        : !row.tracking_number
          ? "엑셀에 운송장번호가 없음"
          : nicknameCandidates.length > 1
            ? `닉네임 앞 4글자 일치 주문 ${nicknameCandidates.length}건 — 한 건으로 확정 불가`
            : recipientCandidates.length > 1
              ? `수취인 이름 일치 주문 ${recipientCandidates.length}건 — 한 건으로 확정 불가`
              : !row.nickname_prefix && !row.normalized_recipient_name
                ? "엑셀에 매칭할 물품명(닉네임)과 수취인 이름이 없음"
                : `DB에서 일치하는 주문을 찾지 못함 (닉네임 기준: ${row.nickname_prefix || "없음"} / 수취인 기준: ${row.file_recipient_name || "없음"})`;

      return {
        ...row,
        match_detail: matchDetail,
        match_candidates: matched ? [] : candidateOrders,
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
