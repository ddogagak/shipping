import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

type ImportItem = {
  item_id?: string;
  title?: string;
  item_title?: string;
  option_text?: string;
  quantity?: number;
  item_price?: number;
  item_total?: number;
  transaction_id?: string;
};

type ImportOrder = {
  selected?: boolean;
  order_no?: string;
  sales_record_no?: string;
  order_date?: string;

  buyer_username?: string;
  buyer_email?: string;
  phone?: string;

  recipient_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  country_code?: string;
  address_key?: string;

  tax_code?: string;
  shipping_service?: string;

  subtotal?: number;
  shipping_fee?: number;
  tax_amount?: number;
  refund_amount?: number;
  order_total?: number;

  quantity_total?: number;
  total_quantity?: number;
  count?: number;

  export_price?: number;
  price?: number | string;

  process_status?: string;
  shipping_status?: string;

  memo?: string;
  raw_text?: string;

  content?: string;
  hscode?: string;

  items?: ImportItem[];
};

function normalizeDate(value?: string): string | null {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

function text(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function intValue(value: unknown): number {
  const n = parseInt(String(value ?? "0").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeProcessStatus(value: unknown) {
  const allowed = new Set([
    "ready",
    "pending",
    "refund",
    "contact",
    "cancelled",
    "completed",
  ]);

  const v = String(value || "pending").trim();
  return allowed.has(v) ? v : "pending";
}

function normalizeShippingStatus(value: unknown) {
  const allowed = new Set([
    "not_exported",
    "exported",
    "reserved",
    "accepted",
    "tracking_added",
    "shipped",
    "issue",
  ]);

  const v = String(value || "not_exported").trim();
  return allowed.has(v) ? v : "not_exported";
}

function buildAddressKey(order: ImportOrder) {
  return [
    order.recipient_name || "",
    order.country_code || "",
    order.postal_code || "",
    order.address1 || "",
  ]
    .join("|")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const body = await req.json();
  const orders = (body?.orders || []) as ImportOrder[];

  if (!Array.isArray(orders) || !orders.length) {
    return NextResponse.json(
      { error: "저장할 주문 데이터가 없습니다." },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  let savedOrders = 0;
  let savedItems = 0;

  for (const order of orders) {
    if (!order.order_no) {
      continue;
    }

    const orderPayload = {
      order_no: order.order_no,
      sales_record_no: text(order.sales_record_no),
      order_date: normalizeDate(order.order_date),

      buyer_username: text(order.buyer_username),
      buyer_email: text(order.buyer_email),
      phone: text(order.phone),

      recipient_name: text(order.recipient_name),
      address1: text(
        [order.address1, order.address2].filter(Boolean).join(" ")
      ),
      city: text(order.city),
      state: text(order.state),
      postal_code: text(order.postal_code),
      country: text(order.country),
      country_code: text(order.country_code),

      address_key: text(order.address_key) || buildAddressKey(order),

      tax_code: text(order.tax_code),
      shipping_service: text(order.shipping_service),

      subtotal: numberValue(order.subtotal),
      shipping_fee: numberValue(order.shipping_fee),
      tax_amount: numberValue(order.tax_amount),
      refund_amount: numberValue(order.refund_amount),
      order_total: numberValue(order.order_total),

      total_quantity: intValue(
        order.total_quantity ?? order.quantity_total ?? order.count
      ),

      export_price: numberValue(order.export_price ?? order.price),

      process_status: normalizeProcessStatus(order.process_status),
      shipping_status: normalizeShippingStatus(order.shipping_status),

      memo: text(order.memo),
      raw_text: text(order.raw_text),
    };

    const { data: upserted, error: upsertError } = await supabase
      .from("orders")
      .upsert(orderPayload, { onConflict: "order_no" })
      .select("id")
      .single();

    if (upsertError || !upserted?.id) {
      return NextResponse.json(
        {
          error: `주문 저장 실패: ${order.order_no}`,
          detail: upsertError?.message,
        },
        { status: 500 }
      );
    }

    savedOrders += 1;

    const orderId = upserted.id;

    const { error: deleteError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId);

    if (deleteError) {
      return NextResponse.json(
        {
          error: `기존 item 삭제 실패: ${order.order_no}`,
          detail: deleteError.message,
        },
        { status: 500 }
      );
    }

    const items = Array.isArray(order.items) ? order.items : [];

    if (items.length) {
      const itemPayload = items.map((item) => ({
        order_id: orderId,
        item_id: text(item.item_id),
        title: text(item.title || item.item_title),
        option_text: text(item.option_text),

        quantity: intValue(item.quantity) || 1,
        item_price: numberValue(item.item_price),
        item_total: numberValue(item.item_total),

        content_type: text(order.content),
        hscode: text(order.hscode),
      }));

      const { error: insertError } = await supabase
        .from("order_items")
        .insert(itemPayload);

      if (insertError) {
        return NextResponse.json(
          {
            error: `item 저장 실패: ${order.order_no}`,
            detail: insertError.message,
          },
          { status: 500 }
        );
      }

      savedItems += itemPayload.length;
    }
  }

  return NextResponse.json({
    ok: true,
    saved: savedOrders,
    saved_items: savedItems,
  });
}
