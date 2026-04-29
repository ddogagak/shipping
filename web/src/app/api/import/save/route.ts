import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ParsedOrder } from "@/lib/import/ebay-orders";

function normalizeDate(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function POST(req: Request) {
  const body = await req.json();
  const orders = (body?.orders || []) as ParsedOrder[];

  if (!Array.isArray(orders) || !orders.length) {
    return NextResponse.json({ error: "저장할 주문 데이터가 없습니다." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  for (const order of orders) {
    const orderPayload = {
      order_no: order.order_no,
      sales_record_no: order.sales_record_no || null,
      order_date: normalizeDate(order.order_date),
      buyer_username: order.buyer_username || null,
      buyer_email: order.buyer_email || null,
      recipient_name: order.recipient_name || null,
      phone: order.phone || null,
      address1: order.address1 || null,
      address2: order.address2 || null,
      city: order.city || null,
      state: order.state || null,
      postal_code: order.postal_code || null,
      country_code: order.country_code || null,
      tax_code: order.tax_code || null,
      subtotal: order.subtotal,
      shipping_fee: order.shipping_fee,
      tax_amount: order.tax_amount,
      order_total: order.order_total,
      quantity_total: order.quantity_total,
      export_price: order.export_price,
      process_status: order.process_status,
      shipping_status: order.shipping_status
    };

    const { data: upserted, error: upsertError } = await supabase
      .from("orders")
      .upsert(orderPayload, { onConflict: "order_no" })
      .select("id")
      .single();

    if (upsertError || !upserted?.id) {
      return NextResponse.json({ error: `주문 저장 실패: ${order.order_no}` }, { status: 500 });
    }

    const orderId = upserted.id;

    const { error: deleteError } = await supabase.from("order_items").delete().eq("order_id", orderId);
    if (deleteError) {
      return NextResponse.json({ error: `기존 item 삭제 실패: ${order.order_no}` }, { status: 500 });
    }

    if (order.items.length) {
      const itemPayload = order.items.map((item) => ({
        order_id: orderId,
        item_id: item.item_id || null,
        item_title: item.item_title || null,
        option_text: item.option_text || null,
        quantity: item.quantity || 0,
        item_price: item.item_price || 0,
        item_total: item.item_total || 0,
        transaction_id: item.transaction_id || null
      }));

      const { error: insertError } = await supabase.from("order_items").insert(itemPayload);
      if (insertError) {
        return NextResponse.json({ error: `item 저장 실패: ${order.order_no}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, saved: orders.length });
}
