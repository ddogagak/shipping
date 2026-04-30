import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type OrderStatus =
  | "ready"
  | "pending"
  | "refund"
  | "contact"
  | "cancelled"
  | "completed";

type OrderStatusRequestBody = {
  order_number?: string;
  order_status?: string;
};

const ALLOWED_ORDER_STATUSES = new Set<OrderStatus>([
  "ready",
  "pending",
  "refund",
  "contact",
  "cancelled",
  "completed",
]);

function normalizeOrderStatus(value: unknown): OrderStatus | null {
  const status = String(value ?? "").trim();

  if (ALLOWED_ORDER_STATUSES.has(status as OrderStatus)) {
    return status as OrderStatus;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as OrderStatusRequestBody;

    const orderNumber = String(body.order_number ?? "").trim();
    const orderStatus = normalizeOrderStatus(body.order_status);

    if (!orderNumber) {
      return NextResponse.json(
        { error: "order_number가 없습니다." },
        { status: 400 }
      );
    }

    if (!orderStatus) {
      return NextResponse.json(
        { error: "order_status가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("ebay_order")
      .update({
        order_status: orderStatus,
      })
      .eq("order_number", orderNumber);

    if (error) {
      return NextResponse.json(
        {
          error: "주문상태 저장 실패",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      order_number: orderNumber,
      order_status: orderStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "주문상태 저장 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
