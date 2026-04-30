import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ShippingMethod = "k-packet" | "egs" | "check";
type OrderStatus = "accepted" | "check" | "pending" | "refund" | "done";
type ShippingLabelStatus =
  | "start"
  | "csv_exported"
  | "created"
  | "printed"
  | "uploaded"
  | "done";

type UpdateOrderRowBody = {
  order_number?: string;
  shipping_method?: string;
  order_status?: string;
  shipping_label_status?: string;
};

const SHIPPING_METHODS = new Set<ShippingMethod>(["k-packet", "egs", "check"]);

const ORDER_STATUSES = new Set<OrderStatus>([
  "accepted",
  "check",
  "pending",
  "refund",
  "done",
]);

const SHIPPING_LABEL_STATUSES = new Set<ShippingLabelStatus>([
  "start",
  "csv_exported",
  "created",
  "printed",
  "uploaded",
  "done",
]);

function normalizeShippingMethod(value: unknown): ShippingMethod | null {
  const v = String(value ?? "").trim();

  if (SHIPPING_METHODS.has(v as ShippingMethod)) {
    return v as ShippingMethod;
  }

  return null;
}

function normalizeOrderStatus(value: unknown): OrderStatus | null {
  const v = String(value ?? "").trim();

  if (ORDER_STATUSES.has(v as OrderStatus)) {
    return v as OrderStatus;
  }

  return null;
}

function normalizeShippingLabelStatus(
  value: unknown
): ShippingLabelStatus | null {
  const v = String(value ?? "").trim();

  if (SHIPPING_LABEL_STATUSES.has(v as ShippingLabelStatus)) {
    return v as ShippingLabelStatus;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as UpdateOrderRowBody;

    const orderNumber = String(body.order_number ?? "").trim();
    const shippingMethod = normalizeShippingMethod(body.shipping_method);
    const orderStatus = normalizeOrderStatus(body.order_status);
    const shippingLabelStatus = normalizeShippingLabelStatus(
      body.shipping_label_status
    );

    if (!orderNumber) {
      return NextResponse.json(
        { error: "order_number가 없습니다." },
        { status: 400 }
      );
    }

    if (!shippingMethod) {
      return NextResponse.json(
        { error: "shipping_method가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (!orderStatus) {
      return NextResponse.json(
        { error: "order_status가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (!shippingLabelStatus) {
      return NextResponse.json(
        { error: "shipping_label_status가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { error: orderError } = await supabase
      .from("ebay_order")
      .update({
        shipping_method: shippingMethod,
        order_status: orderStatus,
      })
      .eq("order_number", orderNumber);

    if (orderError) {
      return NextResponse.json(
        {
          error: "주문상태 저장 실패",
          detail: orderError.message,
        },
        { status: 500 }
      );
    }

    const { error: shippingError } = await supabase
      .from("ebay_shipping")
      .update({
        shipping_method: shippingMethod,
        shipping_label_status: shippingLabelStatus,
      })
      .eq("order_number", orderNumber);

    if (shippingError) {
      return NextResponse.json(
        {
          error: "라벨상태 저장 실패",
          detail: shippingError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      order_number: orderNumber,
      shipping_method: shippingMethod,
      order_status: orderStatus,
      shipping_label_status: shippingLabelStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "주문 행 저장 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
