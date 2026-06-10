import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DomesticOrderMatchRow = {
  order_id: string;
  customer_order_no: string | null;
  recipient_name: string | null;
};

function safeText(value: unknown) {
  return String(value ?? "").trim();
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
    if (!map.has(key)) map.set(key, order);
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일이 없어." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    const parsed = rows
      .map((row) => ({
        order_key: safeText(row["고객주문번호"] || row["주문번호"] || row["order_id"]),
        normalized_order_key: normalizeOrderKey(row["고객주문번호"] || row["주문번호"] || row["order_id"]),
        tracking_number: cleanTrackingNumber(row["운송장번호"]),
      }))
      .filter((row) => row.order_key && row.tracking_number);

    if (!parsed.length) {
      return NextResponse.json(
        { error: "매칭 가능한 운송장 데이터가 없어." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const orderKeys = Array.from(
      new Set(parsed.flatMap((row) => [row.order_key, row.normalized_order_key]).filter(Boolean))
    );

    const orderMap = new Map<string, DomesticOrderMatchRow>();

    const { data: byOrderId, error: orderIdError } = await supabase
      .from("domestic_order")
      .select("order_id, customer_order_no, recipient_name")
      .in("order_id", orderKeys);

    if (orderIdError) {
      return NextResponse.json(
        { error: "기존 주문 조회 실패", detail: orderIdError.message },
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
      addOrderToMap(orderMap, row as DomesticOrderMatchRow);
    }

    const needFallback = parsed.some(
      (row) => row.order_key && !orderMap.get(row.order_key) && !orderMap.get(row.normalized_order_key)
    );

    if (needFallback) {
      const { data: allOrders, error: allOrdersError } = await supabase
        .from("domestic_order")
        .select("order_id, customer_order_no, recipient_name");

      if (allOrdersError) {
        return NextResponse.json(
          { error: "전체 주문 조회 실패", detail: allOrdersError.message },
          { status: 500 }
        );
      }

      for (const row of allOrders || []) {
        addOrderToMap(orderMap, row as DomesticOrderMatchRow);
      }
    }

    const matched = parsed
      .map((row) => {
        const matchedOrder = orderMap.get(row.order_key) || orderMap.get(row.normalized_order_key);
        return {
          ...row,
          order_id: matchedOrder?.order_id || "",
        };
      })
      .filter((row) => row.order_id);

    const unmatched = parsed.filter((row) => {
      const matchedOrder = orderMap.get(row.order_key) || orderMap.get(row.normalized_order_key);
      return !matchedOrder;
    });

    let updated = 0;
    const failed: Array<{ order_key: string; order_id: string; error: string }> = [];

    for (const row of matched) {
      const { data: updatedRows, error } = await supabase
        .from("domestic_shipping")
        .update({
          // 재접수/재등록 시 기존 운송장이 있어도 새 운송장으로 덮어씀
          tracking_number: row.tracking_number,
          // 운송장 입력 엑셀은 배송상태 완료가 아니라 운송장 입력 상태
          shipping_status: "uploaded",
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", row.order_id)
        .select("order_id");

      if (error) {
        failed.push({
          order_key: row.order_key,
          order_id: row.order_id,
          error: error.message,
        });
        continue;
      }

      if (!updatedRows?.length) {
        failed.push({
          order_key: row.order_key,
          order_id: row.order_id,
          error: "domestic_shipping 업데이트 대상이 0건입니다.",
        });
        continue;
      }

      updated += 1;
    }

    return NextResponse.json({
      ok: failed.length === 0,
      total: parsed.length,
      matched_count: matched.length,
      unmatched_count: unmatched.length,
      updated,
      failed_count: failed.length,
      unmatched,
      failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "운송장 엑셀 처리 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
