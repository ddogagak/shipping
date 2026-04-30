import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Carrier = "k-packet" | "egs";

type OrderRow = {
  order_number: string;
  source_order_numbers: string[] | null;
  username: string | null;
  name: string | null;
  country: string | null;
  country_code: string | null;
  order_status: string | null;
};

type ShippingRow = {
  order_number: string;
  shipping_method: string | null;
  shipping_label_status: string | null;
  tracking_number: string | null;
};

type DbOrder = OrderRow & {
  shipping_method: string | null;
  shipping_label_status: string | null;
  tracking_number: string | null;
};

type ParsedTrackingRow = {
  row_index: number;
  carrier: Carrier;
  original_order_number: string;
  order_suffixes: string[];
  recipient_name: string;
  country_code: string;
  tracking_number: string;
  local_tracking_number: string;
  transmission_result: string;
  next_shipping_label_status: "printed" | "uploaded" | "done";
};

function normalizeCarrier(value: unknown): Carrier | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "k-packet" || v === "kpacket") return "k-packet";
  if (v === "egs" || v === "lincos" || v === "린코스") return "egs";
  return null;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeName(value: unknown) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizeCountry(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function normalizeHeader(value: unknown) {
  return normalizeText(value)
    .replace(/^\uFEFF/, "")
    .replace(/[\s_\-()]/g, "")
    .toLowerCase();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  rows.push(row);

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
}

function makeRecord(headers: string[], row: string[]) {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    record[normalizeHeader(header)] = row[index] ?? "";
  });
  return record;
}

function pick(record: Record<string, string>, names: string[]) {
  for (const name of names) {
    const key = normalizeHeader(name);
    const value = record[key];
    if (value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function orderSuffixes(value: unknown): string[] {
  const text = normalizeText(value);
  const matches = text.match(/\d{5}/g) || [];
  const last = matches[matches.length - 1];
  return last ? [last] : [];
}

function dbOrderSuffixes(order: DbOrder): string[] {
  const values = [order.order_number, ...(order.source_order_numbers || [])];
  return Array.from(new Set(values.flatMap((value) => orderSuffixes(value))));
}

function statusForEgs(localTrackingNumber: string, transmissionResult: string) {
  if (normalizeText(localTrackingNumber)) return "done" as const;
  if (normalizeText(transmissionResult) === "전송완료") return "uploaded" as const;
  return "printed" as const;
}

function parseKPacketRows(csvText: string): ParsedTrackingRow[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0];

  return rows.slice(1).map((row, index) => {
    const record = makeRecord(headers, row);
    const originalOrderNumber = pick(record, ["고객주문번호", "주문번호", "order_number"]);
    const trackingNumber = pick(record, ["등기번호", "운송장번호", "tracking_number"]);
    const recipientName = pick(record, ["수취인명", "받는사람", "recipient_name", "name"]);
    const countryCode = pick(record, ["수취인국가코드", "국가코드", "country_code"]);

    return {
      row_index: index + 1,
      carrier: "k-packet",
      original_order_number: originalOrderNumber,
      order_suffixes: orderSuffixes(originalOrderNumber),
      recipient_name: recipientName,
      country_code: normalizeCountry(countryCode),
      tracking_number: trackingNumber,
      local_tracking_number: "",
      transmission_result: "",
      next_shipping_label_status: "uploaded",
    };
  });
}

function splitPastedLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((v) => v.trim());
  return line.split(/\s{2,}/g).map((v) => v.trim());
}

function parseEgsRows(text: string): ParsedTrackingRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitPastedLine(lines[0]);

  return lines.slice(1).map((line, index) => {
    const row = splitPastedLine(line);
    const record = makeRecord(headers, row);
    const originalOrderNumber = pick(record, ["주문번호", "고객주문번호", "order_number"]);
    const trackingNumber = pick(record, ["린코스송장번호", "송장번호", "운송장번호", "tracking_number"]);
    const localTrackingNumber = pick(record, ["현지송장번호", "local_tracking_number"]);
    const recipientName = pick(record, ["받는사람", "수취인명", "recipient_name", "name"]);
    const countryCode = pick(record, ["수취인국가코드", "국가코드", "country_code"]);
    const transmissionResult = pick(record, ["전송결과", "transmission_result"]);

    return {
      row_index: index + 1,
      carrier: "egs",
      original_order_number: originalOrderNumber,
      order_suffixes: orderSuffixes(originalOrderNumber),
      recipient_name: recipientName,
      country_code: normalizeCountry(countryCode),
      tracking_number: trackingNumber,
      local_tracking_number: localTrackingNumber,
      transmission_result: transmissionResult,
      next_shipping_label_status: statusForEgs(localTrackingNumber, transmissionResult),
    };
  });
}

function findMatch(parsed: ParsedTrackingRow, dbOrders: DbOrder[]) {
  const suffixSet = new Set(parsed.order_suffixes);
  const nameKey = normalizeName(parsed.recipient_name);
  const countryKey = normalizeCountry(parsed.country_code);

  let candidates = dbOrders.filter((order) => {
    const dbSuffixes = dbOrderSuffixes(order);
    return dbSuffixes.some((suffix) => suffixSet.has(suffix));
  });

  if (parsed.carrier === "egs") {
    candidates = candidates.filter((order) => {
      const sameName = normalizeName(order.name) === nameKey;
      const sameCountry = normalizeCountry(order.country_code) === countryKey;
      return sameName && sameCountry;
    });
  }

  if (candidates.length === 1) {
    return { status: "matched_by_order" as const, candidates };
  }

  if (candidates.length > 1) {
    return { status: "duplicate_candidate" as const, candidates };
  }

  if (parsed.carrier === "k-packet" && nameKey) {
    const nameCandidates = dbOrders.filter((order) => normalizeName(order.name) === nameKey);
    if (nameCandidates.length === 1) {
      return { status: "matched_by_name" as const, candidates: nameCandidates };
    }
    if (nameCandidates.length > 1) {
      return { status: "duplicate_candidate" as const, candidates: nameCandidates };
    }
  }

  return { status: "not_found" as const, candidates: [] as DbOrder[] };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const carrier = normalizeCarrier(formData.get("carrier"));

    if (!carrier) {
      return NextResponse.json({ error: "carrier가 올바르지 않습니다." }, { status: 400 });
    }

    let parsedRows: ParsedTrackingRow[] = [];

    if (carrier === "k-packet") {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "K-Packet CSV 파일이 없습니다." }, { status: 400 });
      }
      parsedRows = parseKPacketRows(await file.text());
    } else {
      const text = normalizeText(formData.get("text"));
      if (!text) {
        return NextResponse.json({ error: "EGS/린코스 붙여넣기 내용이 없습니다." }, { status: 400 });
      }
      parsedRows = parseEgsRows(text);
    }

    if (!parsedRows.length) {
      return NextResponse.json({ error: "파싱된 운송장 행이 없습니다." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: orderRows, error: orderError } = await supabase
      .from("ebay_order")
      .select("order_number, source_order_numbers, username, name, country, country_code, order_status");

    if (orderError) {
      return NextResponse.json({ error: "주문 조회 실패", detail: orderError.message }, { status: 500 });
    }

    const { data: shippingRows, error: shippingError } = await supabase
      .from("ebay_shipping")
      .select("order_number, shipping_method, shipping_label_status, tracking_number");

    if (shippingError) {
      return NextResponse.json({ error: "배송정보 조회 실패", detail: shippingError.message }, { status: 500 });
    }

    const shippingMap = new Map(
      ((shippingRows || []) as ShippingRow[]).map((row) => [row.order_number, row])
    );

    const dbOrders: DbOrder[] = ((orderRows || []) as OrderRow[]).map((order) => {
      const shipping = shippingMap.get(order.order_number);
      return {
        ...order,
        shipping_method: shipping?.shipping_method || null,
        shipping_label_status: shipping?.shipping_label_status || null,
        tracking_number: shipping?.tracking_number || null,
      };
    });

    const resultRows = parsedRows.map((row) => {
      const missingTracking = !normalizeText(row.tracking_number);
      const match = findMatch(row, dbOrders);
      const selectedCandidate = match.candidates[0] || null;

      return {
        ...row,
        match_status: missingTracking ? "missing_tracking" : match.status,
        db_order_number: selectedCandidate?.order_number || "",
        db_name: selectedCandidate?.name || "",
        db_country_code: selectedCandidate?.country_code || "",
        current_tracking_number: selectedCandidate?.tracking_number || "",
        current_shipping_label_status: selectedCandidate?.shipping_label_status || "",
        candidate_order_numbers: match.candidates.map((candidate) => candidate.order_number),
        candidate_orders: match.candidates.map((candidate) => ({
          order_number: candidate.order_number,
          name: candidate.name || "",
          country_code: candidate.country_code || "",
          shipping_method: candidate.shipping_method || "",
          shipping_label_status: candidate.shipping_label_status || "",
          tracking_number: candidate.tracking_number || "",
        })),
        selected: !missingTracking && (match.status === "matched_by_order" || match.status === "matched_by_name"),
      };
    });

    return NextResponse.json({
      ok: true,
      carrier,
      total: resultRows.length,
      rows: resultRows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "운송장 미리보기 처리 중 오류", detail: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
