import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function last5(value: string) {
  const m = value.match(/\d{5}(?!.*\d)/);
  return m ? m[0] : "";
}

function normalize(s: any) {
  return String(s ?? "").trim();
}

function nameKey(s: any) {
  return normalize(s).toLowerCase().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const carrier = String(formData.get("carrier"));

    const supabase = createServiceRoleClient();

    const { data: orders } = await supabase
      .from("ebay_order")
      .select("order_number, source_order_numbers, name, country_code");

    const { data: shippings } = await supabase
      .from("ebay_shipping")
      .select("order_number, tracking_number, shipping_label_status");

    const shipMap = new Map(
      (shippings || []).map((s: any) => [s.order_number, s])
    );

    let rows: any[] = [];

    // ------------------ K-PACKET ------------------
    if (carrier === "k-packet") {
      const file = formData.get("file") as File;
      const text = await file.text();

      const lines = text.split("\n").filter(Boolean);
      const headers = lines[0].split(",");

      rows = lines.slice(1).map((line, i) => {
        const cols = line.split(",");
        const record: any = {};
        headers.forEach((h, idx) => (record[h.trim()] = cols[idx]));

        const orderNo = normalize(record["고객주문번호"]);
        const tracking = normalize(record["등기번호"]);
        const name = normalize(record["수취인명"]);
        const country = normalize(record["수취인국가코드"]);

        const key = last5(orderNo);

        return {
          idx: i,
          carrier,
          orderNo,
          key,
          name,
          country,
          tracking,
          local: "",
          status: "",
        };
      });
    }

    // ------------------ EGS ------------------
    if (carrier === "egs") {
      const text = String(formData.get("text") || "");
      const lines = text.split("\n").filter(Boolean);

      const headers = lines[0].split(/\t|\s{2,}/);

      rows = lines.slice(1).map((line, i) => {
        const cols = line.split(/\t|\s{2,}/);
        const record: any = {};
        headers.forEach((h, idx) => (record[h.trim()] = cols[idx]));

        const orderNo = normalize(record["주문번호"]);
        const tracking = normalize(record["린코스송장번호"]);
        const local = normalize(record["현지송장번호"]);
        const name = normalize(record["받는사람"]);
        const country = normalize(record["국가코드"]);
        const result = normalize(record["전송결과"]);

        const key = last5(orderNo);

        return {
          idx: i,
          carrier,
          orderNo,
          key,
          name,
          country,
          tracking,
          local: local ? "Y" : "",
          status: result,
        };
      });
    }

    // ------------------ MATCH ------------------

    const result = rows.map((r) => {
      let candidates = (orders || []).filter((o: any) => {
        const keys = [
          last5(o.order_number),
          ...(o.source_order_numbers || []).map(last5),
        ];
        return keys.includes(r.key);
      });

      // fallback name
      if (!candidates.length) {
        candidates = (orders || []).filter(
          (o: any) => nameKey(o.name) === nameKey(r.name)
        );
      }

      const selected = candidates.length === 1 ? candidates[0] : null;

      let next = "uploaded";
      if (r.carrier === "egs") {
        if (r.local) next = "done";
        else if (r.status === "전송완료") next = "uploaded";
        else next = "printed";
      }

      return {
        ...r,
        match:
          !r.tracking
            ? "missing_tracking"
            : candidates.length === 1
            ? "matched"
            : candidates.length > 1
            ? "duplicate"
            : "not_found",
        db_order: selected?.order_number || "",
        candidates: candidates.map((c: any) => c.order_number),
        next_status: next,
        current:
          selected && shipMap.get(selected.order_number)?.shipping_label_status,
      };
    });

    return NextResponse.json({ ok: true, rows: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
