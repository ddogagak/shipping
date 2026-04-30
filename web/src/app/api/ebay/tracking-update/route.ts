import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Carrier = "k-packet" | "egs";
type ShippingLabelStatus = "printed" | "uploaded" | "done";

type UpdateRow = {
  selected?: boolean;
  carrier?: Carrier;
  db_order_number?: string;
  tracking_number?: string;
  next_shipping_label_status?: ShippingLabelStatus;
};

type UpdateBody = {
  carrier?: Carrier;
  rows?: UpdateRow[];
};

const ALLOWED_STATUSES = new Set<ShippingLabelStatus>(["printed", "uploaded", "done"]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCarrier(value: unknown): Carrier | null {
  const v = clean(value).toLowerCase();
  if (v === "k-packet" || v === "kpacket") return "k-packet";
  if (v === "egs") return "egs";
  return null;
}

function normalizeStatus(value: unknown): ShippingLabelStatus | null {
  const v = clean(value) as ShippingLabelStatus;
  return ALLOWED_STATUSES.has(v) ? v : null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as UpdateBody;
    const carrier = normalizeCarrier(body.carrier);

    if (!carrier) {
      return NextResponse.json({ error: "carrier가 올바르지 않습니다." }, { status: 400 });
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    const targetRows = rows
      .filter((row) => row.selected)
      .map((row) => ({
        order_number: clean(row.db_order_number),
        tracking_number: clean(row.tracking_number),
        shipping_label_status: normalizeStatus(row.next_shipping_label_status),
      }))
      .filter((row) => row.order_number && row.tracking_number && row.shipping_label_status);

    if (!targetRows.length) {
      return NextResponse.json({ error: "업데이트할 행이 없습니다." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const updated: string[] = [];
    const failed: { order_number: string; error: string }[] = [];

    for (const row of targetRows) {
      const { error } = await supabase
        .from("ebay_shipping")
        .update({
          shipping_method: carrier,
          tracking_number: row.tracking_number,
          shipping_label_status: row.shipping_label_status,
        })
        .eq("order_number", row.order_number);

      if (error) {
        failed.push({ order_number: row.order_number, error: error.message });
      } else {
        updated.push(row.order_number);
      }
    }

    return NextResponse.json({
      ok: failed.length === 0,
      updated_count: updated.length,
      failed_count: failed.length,
      updated,
      failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "운송장 업데이트 중 오류", detail: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
