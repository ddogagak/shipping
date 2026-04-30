import { NextResponse } from "next/server";
import { parseEbayOrdersCsv } from "@/lib/import/ebay-orders";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// -------------------------
// 공통 함수
// -------------------------
function normalize(s: any) {
  return String(s ?? "").trim();
}

function last5(v: any) {
  return normalize(v).slice(-5);
}

function key(username: any, order: any) {
  const u = normalize(username).toLowerCase();
  const k = last5(order);
  return u && k ? `${u}|${k}` : "";
}

// -------------------------
// 배송방식 규칙 (🔥 복구)
// -------------------------
const KPACKET_COUNTRIES = new Set([
  "NZ","MY","VN","BR","SG","GB","AU","ID","JP","CN",
  "CA","TH","TW","FR","PH","HK","RU","DE","ES"
]);

const EGS_COUNTRIES = new Set([
  "US",
  "HU",
]);

function shippingMethod(countryCodeRaw: any) {
  const countryCode = normalize(countryCodeRaw).toUpperCase();

  if (EGS_COUNTRIES.has(countryCode)) return "egs";
  if (KPACKET_COUNTRIES.has(countryCode)) return "k-packet";

  return "check";
}

// -------------------------
// API
// -------------------------
export async function POST(req: Request) {
  const supabase = createServiceRoleClient();

  // =========================
  // PREVIEW (CSV 업로드)
  // =========================
  if (req.headers.get("content-type")?.includes("multipart")) {
    const form = await req.formData();
    const file = form.get("file") as File;

    const text = await file.text();
    const parsed = parseEbayOrdersCsv(text);

    const { data: existing } = await supabase
      .from("ebay_order")
      .select("order_number, source_order_numbers, username");

    const existingSet = new Set<string>();

    (existing || []).forEach((r: any) => {
      const arr = [r.order_number, ...(r.source_order_numbers || [])];
      arr.forEach((o: any) => {
        existingSet.add(key(r.username, o));
      });
    });

    const seen = new Set<string>();

    const fresh: any[] = [];
    const duplicated: any[] = [];

    parsed.forEach((o) => {
      const k = key(o.buyer_username, o.order_no);

      if (!k) return;

      if (existingSet.has(k)) {
        duplicated.push({
          order_number: o.order_no,
          username: o.buyer_username,
          reason: "기존 DB",
          selected: false,
          disabled: true,
        });
        return;
      }

      if (seen.has(k)) {
        duplicated.push({
          order_number: o.order_no,
          username: o.buyer_username,
          reason: "CSV 중복",
          selected: false,
          disabled: true,
        });
        return;
      }

      seen.add(k);

      fresh.push({
        order_number: o.order_no,
        username: o.buyer_username,
        name: o.recipient_name,
        country_code: o.country_code,
        quantity: o.quantity_total,
        selected: true,
      });
    });

    return NextResponse.json({ fresh, duplicated });
  }

  // =========================
  // SAVE
  // =========================
  const body = await req.json();
  const rows = body.rows || [];

  let saved = 0;

  for (const r of rows) {
    if (!r.selected) continue;

    const method = shippingMethod(r.country_code);

    await supabase.from("ebay_order").insert({
      order_number: r.order_number,
      source_order_numbers: [r.order_number],
      username: r.username,
      name: r.name,
      country_code: r.country_code,
      quantity: r.quantity || 1,
      shipping_method: method,
      order_status: "accepted",
    });

    await supabase.from("ebay_shipping").insert({
      order_number: r.order_number,
      username: r.username,
      shipping_method: method,
      shipping_label_status: "start",
    });

    await supabase.from("ebay_order_item").insert({
      order_number: r.order_number,
      username: r.username,
      quantity: r.quantity || 1,
      item_list: "",
      stockout_item_indexes: [],
    });

    saved++;
  }

  return NextResponse.json({ saved });
}
