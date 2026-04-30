import { NextResponse } from "next/server";

import { parseEbayOrdersCsv, type ParsedOrder } from "@/lib/import/ebay-orders";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExistingOrderRow = {
  order_number: string;
  source_order_numbers: string[] | null;
  username: string | null;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeUsername(value: unknown) {
  return cleanText(value).toLowerCase();
}

function last5(value: unknown) {
  const matches = cleanText(value).match(/\d{5}/g) || [];
  return matches.length ? matches[matches.length - 1] : "";
}

function duplicateKey(username: unknown, orderNumber: unknown) {
  const user = normalizeUsername(username);
  const suffix = last5(orderNumber);
  if (!user || !suffix) return "";
  return `${user}|${suffix}`;
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const EGS_COUNTRIES = new Set(["US", "HU"]);

const KPACKET_COUNTRIES = new Set([
  "NZ", "MY", "VN", "BR", "SG", "GB", "AU", "ID", "JP", "CN",
  "CA", "TH", "TW", "FR", "PH", "HK", "RU", "DE", "ES",
  "AR", "AT", "BY", "BE", "KH", "CL", "EG", "FI", "HN", "IN",
  "IE", "IL", "IT", "KZ", "KG", "MX", "MN", "NP", "NL", "NO",
  "PK", "PE", "PL", "SA", "ZA", "SE", "CH", "TR", "UA", "AE", "UZ",
]);

function shippingMethod(orderOrCountryCode: ParsedOrder | any) {
  const countryCode =
    typeof orderOrCountryCode === "string"
      ? cleanText(orderOrCountryCode).toUpperCase()
      : cleanText(orderOrCountryCode?.country_code).toUpperCase();

  if (EGS_COUNTRIES.has(countryCode)) return "egs";
  if (KPACKET_COUNTRIES.has(countryCode)) return "k-packet";
  return "check";
}

function countryNameFromCode(countryCode: string) {
  const map: Record<string, string> = {
    US: "United States",
    HU: "Hungary",
    CA: "Canada",
    JP: "Japan",
    GB: "United Kingdom",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    ES: "Spain",
    IT: "Italy",
    NL: "Netherlands",
    SG: "Singapore",
    MY: "Malaysia",
    VN: "Vietnam",
    BR: "Brazil",
    TH: "Thailand",
    TW: "Taiwan",
    HK: "Hong Kong",
    CN: "China",
    RU: "Russia",
    PH: "Philippines",
    NZ: "New Zealand",
  };

  return map[countryCode] || countryCode;
}

function itemText(order: any) {
  return (order.items || [])
    .map((item: any) => {
      const title = cleanText(item.item_title);
      const option = cleanText(item.option_text);
      const quantity = numberValue(item.quantity) || 1;

      return [
        title,
        option ? `(${option})` : "",
        quantity > 1 ? `x${quantity}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join(" | ");
}

function makeExportData(order: any) {
  const countryCode = cleanText(order.country_code).toUpperCase();
  const address = [order.address1, order.address2]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  const taxCode = cleanText(order.tax_code);
  const quantity = numberValue(order.quantity_total) || 1;
  const price = numberValue(order.export_price) || numberValue(order.subtotal) || 15;
  const countryName = countryNameFromCode(countryCode);

  return {
    "★상품구분": "K-Packet",
    "★수취인명": cleanText(order.recipient_name),
    "수취인EMAIL": cleanText(order.buyer_email),
    "★14전화번호": cleanText(order.phone),
    "★16국가코드": countryCode,
    "★16국가명": countryName,
    "★15우편번호": cleanText(order.postal_code),
    "★13상세주소": address,
    "★12시/군/구": cleanText(order.city),
    "★11주/도/시": cleanText(order.state) || cleanText(order.city),
    "★총중량": "100",
    "★내용품": "photocard",
    "★개수": quantity,
    "★순중량(g)[ = 품목 1종의 개당중량 * 개수 ](수출우편물 정보관세청 제공 동의시 필수)": "15",
    "★가격": price,
    "단위": "USD",
    "HSCODE(숫자만 10자리)": "4909000000",
    "EMS : EEMS 프리미엄 : PK-Packet : K등기소형 :R": "R",
    "EMS 비서류 : em,     EMS 서류 : ee, K-Packet : rl, 소형포장물 : re": "rl",
    "고객주문번호( 숫자,영문 30자이내)": cleanText(order.order_no),
    "수출우편물 정보 관세청 제공 여부(Y/N)": "Y",
    "상태": "done",
    "물품": itemText(order),
    "생성 일시": new Date().toISOString(),
    "가로(cm)": "25",
    "세로(cm)": "20",
    "높이(cm)": "1",
    "★IOSS/EORI/TAX NUMBER식별 번호":
      taxCode && taxCode !== "-" ? `${taxCode} PAID` : "",
    "★브라질세금식별번호(* 브라질행 EMS, K-Packet의 경우 필수 입력)":
      countryCode === "BR" && taxCode !== "-" ? taxCode : "",
  };
}

function previewRow(order: any, selected: boolean) {
  return {
    ...order,
    order_number: cleanText(order.order_no),
    username: cleanText(order.buyer_username),
    name: cleanText(order.recipient_name),
    country_code: cleanText(order.country_code).toUpperCase(),
    quantity: numberValue(order.quantity_total) || 1,
    shipping_method: shippingMethod(order),
    item_list: itemText(order),
    selected,
  };
}

async function buildExistingSets(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data: existingRows, error } = await supabase
    .from("ebay_order")
    .select("order_number, source_order_numbers, username");

  if (error) throw error;

  const existingKeys = new Set<string>();
  const existingOrderNumbers = new Set<string>();

  ((existingRows || []) as ExistingOrderRow[]).forEach((row) => {
    existingOrderNumbers.add(row.order_number);

    const candidates = [
      row.order_number,
      ...(Array.isArray(row.source_order_numbers) ? row.source_order_numbers : []),
    ];

    candidates.forEach((orderNumber) => {
      const key = duplicateKey(row.username, orderNumber);
      if (key) existingKeys.add(key);
    });
  });

  return { existingKeys, existingOrderNumbers };
}

export async function POST(req: Request) {
  try {
    const supabase = createServiceRoleClient();
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "CSV 파일이 필요합니다." }, { status: 400 });
      }

      const text = await file.text();
      const parsedOrders = parseEbayOrdersCsv(text);

      if (!parsedOrders.length) {
        return NextResponse.json(
          { error: "CSV에서 주문을 찾지 못했습니다." },
          { status: 400 }
        );
      }

      const { existingKeys, existingOrderNumbers } = await buildExistingSets(supabase);

      const seenCsvKeys = new Set<string>();
      const fresh: any[] = [];
      const duplicated: any[] = [];

      parsedOrders.forEach((order) => {
        const orderNumber = cleanText(order.order_no);
        const username = cleanText(order.buyer_username);
        const key = duplicateKey(username, orderNumber);

        if (!key) {
          duplicated.push({
            ...previewRow(order, false),
            reason: "username 또는 주문번호 없음",
            disabled: true,
          });
          return;
        }

        if (existingOrderNumbers.has(orderNumber) || existingKeys.has(key)) {
          duplicated.push({
            ...previewRow(order, false),
            reason: "기존 DB 중복",
            disabled: true,
          });
          return;
        }

        if (seenCsvKeys.has(key)) {
          duplicated.push({
            ...previewRow(order, false),
            reason: "CSV 내부 중복",
            disabled: true,
          });
          return;
        }

        seenCsvKeys.add(key);
        fresh.push(previewRow(order, true));
      });

      return NextResponse.json({
        ok: true,
        fresh,
        duplicated,
        fresh_count: fresh.length,
        duplicated_count: duplicated.length,
      });
    }

    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        saved: 0,
        skipped_count: 0,
        skipped: [],
        message: "저장할 주문이 없습니다.",
      });
    }

    const { existingKeys, existingOrderNumbers } = await buildExistingSets(supabase);

    const skipped: Array<{ order_number: string; username: string; reason: string }> = [];
    const freshOrders: any[] = [];

    rows.forEach((order: any) => {
      if (!order.selected) return;
    
      const orderNumber = cleanText(order.order_no || order.order_number);
      const username = cleanText(order.buyer_username || order.username);
      const key = duplicateKey(username, orderNumber);

      if (!key) {
        skipped.push({
          order_number: orderNumber,
          username,
          reason: "username 또는 주문번호 없음",
        });
        return;
      }

      if (existingOrderNumbers.has(orderNumber) || existingKeys.has(key)) {
        skipped.push({
          order_number: orderNumber,
          username,
          reason: "저장 직전 기존 DB 중복",
        });
        return;
      }

      freshOrders.push({
        ...order,
        order_no: orderNumber,
        buyer_username: username,
        recipient_name: order.recipient_name || order.name,
        country_code: order.country_code,
        quantity_total: order.quantity_total || order.quantity,
      });

      existingOrderNumbers.add(orderNumber);
      existingKeys.add(key);
    });

    if (!freshOrders.length) {
      return NextResponse.json({
        ok: true,
        saved: 0,
        skipped_count: skipped.length,
        skipped,
        message: "저장할 신규 주문이 없습니다.",
      });
    }

    const orderPayload = freshOrders.map((order) => {
      const countryCode = cleanText(order.country_code).toUpperCase();
      const method = shippingMethod(order);

      return {
        sale_date: order.order_date || null,
        order_number: cleanText(order.order_no),
        source_order_numbers: [cleanText(order.order_no)],
        username: cleanText(order.buyer_username),
        name: cleanText(order.recipient_name),
        country: countryNameFromCode(countryCode),
        country_code: countryCode,
        quantity: numberValue(order.quantity_total) || 1,
        shipping_method: method,
        order_status: "accepted",
      };
    });

    const shippingPayload = freshOrders.map((order) => {
      const method = shippingMethod(order);

      return {
        order_number: cleanText(order.order_no),
        username: cleanText(order.buyer_username),
        shipping_method: method,
        shipping_label_status: "start",
        tracking_number: null,
        receipt_status: null,
        export_data: makeExportData(order),
      };
    });

    const itemPayload = freshOrders.map((order) => ({
      order_number: cleanText(order.order_no),
      username: cleanText(order.buyer_username),
      quantity: numberValue(order.quantity_total) || 1,
      item_list: itemText(order),
      stockout_item_indexes: [],
    }));

    const { error: orderInsertError } = await supabase
      .from("ebay_order")
      .insert(orderPayload);

    if (orderInsertError) {
      return NextResponse.json(
        { error: "주문 저장 실패", detail: orderInsertError.message },
        { status: 500 }
      );
    }

    const { error: shippingInsertError } = await supabase
      .from("ebay_shipping")
      .insert(shippingPayload);

    if (shippingInsertError) {
      return NextResponse.json(
        { error: "배송정보 저장 실패", detail: shippingInsertError.message },
        { status: 500 }
      );
    }

    const { error: itemInsertError } = await supabase
      .from("ebay_order_item")
      .insert(itemPayload);

    if (itemInsertError) {
      return NextResponse.json(
        { error: "상품정보 저장 실패", detail: itemInsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      saved: freshOrders.length,
      skipped_count: skipped.length,
      skipped,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "CSV 업로드 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
