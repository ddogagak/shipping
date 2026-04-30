import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type StockoutRequestBody = {
  order_number?: string;
  item_index?: number;
  checked?: boolean;
};

function normalizeItemIndex(value: unknown) {
  const n = Number(value);

  if (!Number.isInteger(n) || n < 1) {
    return null;
  }

  return n;
}

function normalizeIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v >= 1)
    )
  ).sort((a, b) => a - b);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StockoutRequestBody;

    const orderNumber = String(body.order_number || "").trim();
    const itemIndex = normalizeItemIndex(body.item_index);
    const checked = Boolean(body.checked);

    if (!orderNumber) {
      return NextResponse.json(
        { error: "order_number가 없습니다." },
        { status: 400 }
      );
    }

    if (!itemIndex) {
      return NextResponse.json(
        { error: "item_index가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { data: itemRow, error: readError } = await supabase
      .from("ebay_order_item")
      .select("order_number, stockout_item_indexes")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (readError) {
      return NextResponse.json(
        { error: "상품 재고없음 상태 조회 실패", detail: readError.message },
        { status: 500 }
      );
    }

    if (!itemRow) {
      return NextResponse.json(
        { error: "해당 주문의 상품목록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const currentIndexes = normalizeIndexes(itemRow.stockout_item_indexes);
    const nextSet = new Set(currentIndexes);

    if (checked) {
      nextSet.add(itemIndex);
    } else {
      nextSet.delete(itemIndex);
    }

    const nextIndexes = Array.from(nextSet).sort((a, b) => a - b);

    const { error: updateItemError } = await supabase
      .from("ebay_order_item")
      .update({
        stockout_item_indexes: nextIndexes,
      })
      .eq("order_number", orderNumber);

    if (updateItemError) {
      return NextResponse.json(
        {
          error: "상품 재고없음 상태 저장 실패",
          detail: updateItemError.message,
        },
        { status: 500 }
      );
    }

    let orderStatus: string | null = null;

    if (checked) {
      const { error: updateOrderError } = await supabase
        .from("ebay_order")
        .update({
          order_status: "pending",
        })
        .eq("order_number", orderNumber);

      if (updateOrderError) {
        return NextResponse.json(
          {
            error: "상품 상태는 저장됐지만 주문상태 변경 실패",
            detail: updateOrderError.message,
          },
          { status: 500 }
        );
      }

      orderStatus = "pending";
    }

    return NextResponse.json({
      ok: true,
      order_number: orderNumber,
      item_index: itemIndex,
      checked,
      stockout_item_indexes: nextIndexes,
      order_status: orderStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "재고없음 처리 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
