import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCarrier(value: unknown) {
  const v = normalize(value);

  if (v === "k-packet" || v === "egs") return v;

  return "check";
}

export async function POST(req: Request) {
  try {
    const supabase = createServiceRoleClient();
    const body = await req.json();

    const rows = Array.isArray(body.rows) ? body.rows : [];

    let updated_count = 0;
    let inserted_count = 0;
    const failed: { order_number: string; error: string }[] = [];

    for (const row of rows) {
      if (!row?.selected) continue;

      const dbOrderNumber = normalize(row.db_order_number);
      const originalOrderNumber = normalize(row.original_order_number);
      const orderNumber = dbOrderNumber || originalOrderNumber;

      const trackingNumber = normalize(row.tracking_number);
      const nextStatus = normalize(row.next_shipping_label_status) || "uploaded";
      const carrier = normalizeCarrier(row.carrier);

      const username = normalize(row.username);
      const recipientName = normalize(row.recipient_name);
      const countryCode = normalize(row.country_code).toUpperCase();

      if (!orderNumber) {
        failed.push({
          order_number: originalOrderNumber || "(empty)",
          error: "주문번호가 없습니다.",
        });
        continue;
      }

      if (!trackingNumber) {
        failed.push({
          order_number: orderNumber,
          error: "운송장번호가 없습니다.",
        });
        continue;
      }

      const orderStatus = nextStatus === "done" ? "done" : "check";

      const { data: existingOrder, error: existingError } = await supabase
        .from("ebay_order")
        .select("order_number")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (existingError) {
        failed.push({
          order_number: orderNumber,
          error: existingError.message,
        });
        continue;
      }

      if (existingOrder) {
        const { error: shippingError } = await supabase
          .from("ebay_shipping")
          .update({
            tracking_number: trackingNumber,
            shipping_label_status: nextStatus,
            shipping_method: carrier,
          })
          .eq("order_number", orderNumber);

        if (shippingError) {
          failed.push({
            order_number: orderNumber,
            error: shippingError.message,
          });
          continue;
        }

        if (nextStatus === "done") {
          const { error: orderUpdateError } = await supabase
            .from("ebay_order")
            .update({
              order_status: "done",
              shipping_method: carrier,
            })
            .eq("order_number", orderNumber);

          if (orderUpdateError) {
            failed.push({
              order_number: orderNumber,
              error: orderUpdateError.message,
            });
            continue;
          }
        } else {
          await supabase
            .from("ebay_order")
            .update({
              shipping_method: carrier,
            })
            .eq("order_number", orderNumber);
        }

        updated_count += 1;
        continue;
      }

      const { error: insertOrderError } = await supabase
        .from("ebay_order")
        .insert({
          order_number: orderNumber,
          source_order_numbers: [orderNumber],
          username: username || null,
          name: recipientName || null,
          country: null,
          country_code: countryCode || null,
          quantity: 1,
          shipping_method: carrier,
          order_status: orderStatus,
        });

      if (insertOrderError) {
        failed.push({
          order_number: orderNumber,
          error: insertOrderError.message,
        });
        continue;
      }

      const { error: insertShippingError } = await supabase
        .from("ebay_shipping")
        .insert({
          order_number: orderNumber,
          username: username || null,
          shipping_method: carrier,
          shipping_label_status: nextStatus,
          tracking_number: trackingNumber,
          receipt_status: null,
          export_data: {},
        });

      if (insertShippingError) {
        failed.push({
          order_number: orderNumber,
          error: insertShippingError.message,
        });
        continue;
      }

      const { error: insertItemError } = await supabase
        .from("ebay_order_item")
        .insert({
          order_number: orderNumber,
          username: username || null,
          quantity: 1,
          item_list: "",
          stockout_item_indexes: [],
        });

      if (insertItemError) {
        failed.push({
          order_number: orderNumber,
          error: insertItemError.message,
        });
        continue;
      }

      inserted_count += 1;
    }



    if (updated_count > 0 || inserted_count > 0) {
  await supabase.from("admin_activity_log").insert({
    activity_type: "tracking_upload",
  });
}

    return NextResponse.json({
      ok: true,
      updated_count,
      inserted_count,
      failed_count: failed.length,
      failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "운송장 업데이트 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
