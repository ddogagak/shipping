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
  source_order_nos?: string[];
  sales_record_no?: string;
  order_date?: string;

  buyer_username?: string;
  buyer_email?: string;
  phone?: string;

  recipient_name?: string;
  country?: string;
  country_code?: string;

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

  shipping_method?: string;
  shipping_export?: Record<string, string>;

  itemText?: string;
  items?: ImportItem[];
};

const KPACKET_COUNTRIES = new Set([
  "NZ", "MY", "VN", "BR", "SG", "GB", "AU", "ID", "JP", "CN", "CA", "TH", "TW", "FR", "PH", "HK", "RU", "DE", "ES",
  "AR", "AT", "BY", "BE", "KH", "CL", "EG", "FI", "HN", "IN", "IE", "IL", "IT", "KZ", "KG", "MX", "MN", "NP", "NL", "NO", "PK", "PE", "PL", "SA", "ZA", "SE", "CH", "TR", "UA", "AE", "UZ"
]);

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const v = text(value);
  return v ? v : null;
}

function intValue(value: unknown): number {
  const n = parseInt(String(value ?? "0").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(value?: string): string | null {
  const raw = text(value);
  if (!raw) return null;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

function getShippingMethod(order: ImportOrder): "k-packet" | "egs" | "check" {
  const countryCode = text(order.country_code).toUpperCase();

  if (countryCode === "US") return "egs";
  if (KPACKET_COUNTRIES.has(countryCode)) return "k-packet";

  return "check";
}

function getSourceOrderNumbers(order: ImportOrder): string[] {
  if (Array.isArray(order.source_order_nos) && order.source_order_nos.length) {
    return order.source_order_nos.map(text).filter(Boolean);
  }

  return text(order.order_no)
    .split("/")
    .map(text)
    .filter(Boolean);
}

function getItemList(order: ImportOrder): string {
  const items = Array.isArray(order.items) ? order.items : [];

  const names = items
    .map((item) => {
      return [
        text(item.title || item.item_title),
        text(item.option_text),
      ]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean);

  if (names.length) return names.join("|");

  return text(order.itemText);
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

  const validOrders = orders.filter((order) => text(order.order_no));

  if (!validOrders.length) {
    return NextResponse.json(
      { error: "저장 가능한 order_no가 없습니다." },
      { status: 400 }
    );
  }

  const ebayOrderRows = validOrders.map((order) => {
    const saleDate = normalizeDate(order.order_date);
    const shippingMethod = getShippingMethod(order);

    return {
      sale_date: saleDate,
      order_number: text(order.order_no),
      source_order_numbers: getSourceOrderNumbers(order),

      username: nullableText(order.buyer_username),
      name: nullableText(order.recipient_name),
      country: nullableText(order.country),
      country_code: nullableText(order.country_code),

      quantity: intValue(order.total_quantity ?? order.quantity_total ?? order.count),

      shipping_method: shippingMethod,
    };
  });

  const ebayShippingRows = validOrders.map((order) => {
    const saleDate = normalizeDate(order.order_date);
    const shippingMethod = getShippingMethod(order);
    const exportData =
      order.shipping_export && typeof order.shipping_export === "object"
        ? order.shipping_export
        : {};

    return {
      sale_date: saleDate,
      order_number: text(order.order_no),
      username: nullableText(order.buyer_username),

      shipping_method: shippingMethod,
      export_data: exportData,

      receipt_status: "not_submitted",
    };
  });

  const ebayItemRows = validOrders.map((order) => {
    const saleDate = normalizeDate(order.order_date);

    return {
      sale_date: saleDate,
      order_number: text(order.order_no),
      username: nullableText(order.buyer_username),

      quantity: intValue(order.total_quantity ?? order.quantity_total ?? order.count),
      item_list: nullableText(getItemList(order)),
    };
  });

  const { error: orderError } = await supabase
    .from("ebay_order")
    .upsert(ebayOrderRows, { onConflict: "order_number" });

  if (orderError) {
    return NextResponse.json(
      { error: "ebay_order 저장 실패", detail: orderError.message },
      { status: 500 }
    );
  }

  const { error: shippingError } = await supabase
    .from("ebay_shipping")
    .upsert(ebayShippingRows, { onConflict: "order_number" });

  if (shippingError) {
    return NextResponse.json(
      { error: "ebay_shipping 저장 실패", detail: shippingError.message },
      { status: 500 }
    );
  }

  const { error: itemError } = await supabase
    .from("ebay_order_item")
    .upsert(ebayItemRows, { onConflict: "order_number" });

  if (itemError) {
    return NextResponse.json(
      { error: "ebay_order_item 저장 실패", detail: itemError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    saved_orders: ebayOrderRows.length,
    saved_shipping: ebayShippingRows.length,
    saved_items: ebayItemRows.length,
  });
}
