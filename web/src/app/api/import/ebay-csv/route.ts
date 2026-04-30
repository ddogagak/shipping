import { NextResponse } from "next/server";

import { parseEbayOrdersCsv, type ParsedOrder } from "@/lib/import/ebay-orders";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExistingOrderRow = {
  order_number: string;
  source_order_numbers: string[] | null;
  username: string | null;
};

type DuplicateOrder = {
  order_number: string;
  username: string;
  name?: string;
  country_code?: string;
  quantity?: number;
  reason: string;
};

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function last5(value: unknown) {
  const matches = String(value ?? "").trim().match(/\d{5}/g) || [];
  return matches.length ? matches[matches.length - 1] : "";
}

function duplicateKey(username: unknown, orderNumber: unknown) {
  const user = normalizeUsername(username);
  const suffix = last5(orderNumber);
  if (!user || !suffix) return "";
  return `${user}|${suffix}`;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function countryNameFromCode(countryCode: string) {
  const map: Record<string, string> = {
    US: "United States",
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

function itemText(order: ParsedOrder) {
  return order.items
    .map((item) => {
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

function makeExportData(order: ParsedOrder) {
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
    "★순중량(g)[ = 품목 1종의 개당중량 * 개수 ](수출우편물 정보관세청 제공 동의시 필수)":
      "15",
    "★가격": price,
    단위: "USD",
    "HSCODE(숫자만 10자리)": "4909000000",
    "EMS : EEMS 프리미엄 : PK-Packet : K등기소형 :R": "R",
    "EMS 비서류 : em,     EMS 서류 : ee, K-Packet : rl, 소형포장물 : re":
      "rl",
    "고객주문번호( 숫자,영문 30자이내)": cleanText(order.order_no),
    "수출우편물 정보 관세청 제공 여부(Y/N)": "Y",
    상태: "done",
    물품: itemText(order),
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

function shippingMethod(order: ParsedOrder) {
  return order.process_status === "ready" ? "k-packet" : "check";
}

function previewOrder(order: ParsedOrder) {
  return {
    selected: true,
    order_number: cleanText(order.order_no),
    username: cleanText(order.buyer_username),
    name: cleanText(order.recipient_name),
    country_code: cleanText(order.country_code).toUpperCase(),
    quantity: numberValue(order.quantity_total) || 1,
    order_date: order.order_date || null,
    item_list: itemText(order),
    shipping_method: shippingMethod(order),
    order_status: "accepted",
    parsed_order: order,
  };
}

function duplicateOrder(order: ParsedOrder, reason: string): DuplicateOrder {
  return {
    order_number: cleanText(order.order_no),
    username: cleanText(order.buyer_username),
    name: cleanText(order.recipient_name),
    country_code: cleanText(order.country_code).toUpperCase(),
    quantity: numberValue(order.quantity_total) || 1,
    reason,
  };
}

function buildExistingKeys(existingRows: ExistingOrderRow[]) {
  const existingKeys = new Set<string>();
  const existingOrderNumbers = new Set<string>();

  existingRows.forEach((row) => {
    existingOrderNumbers.add(cleanText(row.order_number));

    const candidates = [
      row.order_number,
      ...(Array.isArray(row.source_order_numbers)
        ? row.source_order_numbers
        : []),
    ];

    candidates.forEach((orderNumber) => {
      const key = duplicateKey(row.username, orderNumber);
      if (key) existingKeys.add(key);
    });
  });

  return { existingKeys, existingOrderNumbers };
}

async function getExistingRows() {
  const supabase = createServiceRoleClient();

  const { data: existingRows, error: existingError } = await supabase
    .from("ebay_order")
    .select("order_number, source_order_numbers, username");

  if (existingError) {
    throw new Error(existingError.message);
  }

  return (existingRows || []) as ExistingOrderRow[];
}

async function previewParsedOrders(parsedOrders: ParsedOrder[]) {
  const existingRows = await getExistingRows();
  const { existingKeys, existingOrderNumbers } = buildExistingKeys(existingRows);

  const seenCsvKeys = new Set<string>();
  const seenCsvOrderNumbers = new Set<string>();
  const fresh: ReturnType<typeof previewOrder>[] = [];
  const duplicated: DuplicateOrder[] = [];

  parsedOrders.forEach((order) => {
    const orderNumber = cleanText(order.order_no);
    const key = duplicateKey(order.buyer_username, order.order_no);

    if (!key) {
      duplicated.push(duplicateOrder(order, "username 또는 주문번호 없음"));
      return;
    }

    if (existingOrderNumbers.has(orderNumber)) {
      duplicated.push(duplicateOrder(order, "기존 DB 주문번호 중복"));
      return;
    }

    if (existingKeys.has(key)) {
      duplicated.push(duplicateOrder(order, "기존 DB username + 주문번호 뒤5자리 중복"));
      return;
    }

    if (seenCsvOrderNumbers.has(orderNumber)) {
      duplicated.push(duplicateOrder(order, "CSV 내부 주문번호 중복"));
      return;
    }

    if (seenCsvKeys.has(key)) {
      duplicated.push(duplicateOrder(order, "CSV 내부 username + 주문번호 뒤5자리 중복"));
      return;
    }

    seenCsvKeys.add(key);
    seenCsvOrderNumbers.add(orderNumber);
    fresh.push(previewOrder(order));
  });

  return { fresh, duplicated };
}

async function saveOrders(orders: ParsedOrder[]) {
  const { fresh, duplicated } = await previewParsedOrders(orders);

  if (!fresh.length) {
    return {
      saved: 0,
      skipped_count: duplicated.length,
      skipped: duplicated,
    };
  }

  const freshOrders = fresh.map((row) => row.parsed_order as ParsedOrder);
  const supabase = createServiceRoleClient();

  const orderPayload = freshOrders.map((order) => ({
    sale_date: order.order_date || null,
    order_number: cleanText(order.order_no),
    source_order_numbers: [cleanText(order.order_no)],
    username: cleanText(order.buyer_username),
    name: cleanText(order.recipient_name),
    country: countryNameFromCode(cleanText(order.country_code).toUpperCase()),
    country_code: cleanText(order.country_code).toUpperCase(),
    quantity: numberValue(order.quantity_total) || 1,
    shipping_method: shippingMethod(order),
    order_status: "accepted",
  }));

  const shippingPayload = freshOrders.map((order) => ({
    order_number: cleanText(order.order_no),
    username: cleanText(order.buyer_username),
    shipping_method: shippingMethod(order),
    shipping_label_status: "start",
    tracking_number: null,
    receipt_status: null,
    export_data: makeExportData(order),
  }));

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
    throw new Error(orderInsertError.message);
  }

  const { error: shippingInsertError } = await supabase
    .from("ebay_shipping")
    .insert(shippingPayload);

  if (shippingInsertError) {
    throw new Error(shippingInsertError.message);
  }

  const { error: itemInsertError } = await supabase
    .from("ebay_order_item")
    .insert(itemPayload);

  if (itemInsertError) {
    throw new Error(itemInsertError.message);
  }

  return {
    saved: freshOrders.length,
    skipped_count: duplicated.length,
    skipped: duplicated,
  };
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const mode = cleanText(body.mode);

      if (mode !== "save") {
        return NextResponse.json({ error: "지원하지 않는 JSON mode입니다." }, { status: 400 });
      }

      const orders = Array.isArray(body.orders) ? (body.orders as ParsedOrder[]) : [];

      if (!orders.length) {
        return NextResponse.json({ error: "저장할 주문이 없습니다." }, { status: 400 });
      }

      const result = await saveOrders(orders);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV 파일이 필요합니다." }, { status: 400 });
    }

    const text = await file.text();
    const parsedOrders = parseEbayOrdersCsv(text);

    if (!parsedOrders.length) {
      return NextResponse.json({ error: "CSV에서 주문을 찾지 못했습니다." }, { status: 400 });
    }

    const { fresh, duplicated } = await previewParsedOrders(parsedOrders);

    return NextResponse.json({
      ok: true,
      fresh,
      duplicated,
      fresh_count: fresh.length,
      duplicated_count: duplicated.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "CSV 업로드 처리 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
