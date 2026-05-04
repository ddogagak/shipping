import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Platform = "wise" | "x" | "bunjang";

type ParsedRow = {
  selected: boolean;
  platform: Platform;
  recipientName: string;
  nickname: string;
  postalCode: string;
  phone: string;
  address: string;
  customerOrderNo: string;
  itemName: string;
  contentName: string;
  boxCount: string;
  boxType: string;
  baseFee: string;
  orderCount: string;
  firstOrderDate: string;
  itemSummary: string;
  itemTotalPrice: string;
  sourceOrderDates: string[];
  items: { item_text: string; price: number }[];
  shippingType: string;
};

const PLATFORM_PREFIX: Record<Platform, string> = {
  wise: "W",
  x: "X",
  bunjang: "B",
};

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePlatform(value: unknown): Platform {
  const v = safeText(value).toLowerCase();
  if (v === "x") return "x";
  if (v === "bunjang") return "bunjang";
  return "wise";
}

function withApostrophe(value: string) {
  const clean = safeText(value).replace(/^'+/, "");
  if (!clean) return "";
  return `'${clean}`;
}

function removeApostrophe(value: string) {
  return safeText(value).replace(/^'+/, "");
}

function parseNameAndNickname(line: string) {
  const text = safeText(line);
  const match = text.match(/^(.+?)\((.+?)\)$/);

  if (!match) {
    return { recipientName: text, nickname: text };
  }

  return {
    recipientName: safeText(match[1]),
    nickname: safeText(match[2]),
  };
}

function extractOrderDate(block: string) {
  const match = block.match(/\d{4}\.\s*\d{2}\.\s*\d{2}\s*\/\s*\d{2}:\d{2}/);
  return match ? match[0].replace(/\s+/g, " ") : "";
}

function splitOrderBlocks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const datePattern = /\d{4}\.\s*\d{2}\.\s*\d{2}\s*\/\s*\d{2}:\d{2}/g;
  const matches = [...normalized.matchAll(datePattern)];

  if (!matches.length) return [normalized];

  return matches
    .map((match, index) => {
      const start = match.index || 0;
      const end =
        index + 1 < matches.length
          ? matches[index + 1].index || normalized.length
          : normalized.length;

      return normalized.slice(start, end).trim();
    })
    .filter(Boolean);
}

function parsePrice(value: string) {
  return Number(value.replace(/[^0-9]/g, "")) || 0;
}

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function parseItems(block: string) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items: { item_text: string; price: number }[] = [];
  let total = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line.startsWith("#")) continue;

    const priceLine = lines[i + 1] || "";
    const price = parsePrice(priceLine);

    items.push({ item_text: line, price });
    total += price;
  }

  return {
    items,
    itemSummary: items.map((item) => item.item_text).join(" / "),
    itemTotalPrice: total ? formatWon(total) : "",
    total,
  };
}

function firstDate(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function normalizeBunjangDate(value: string) {
  const text = safeText(value);
  const match = text.match(/(\d{2})년\s*(\d{2})월\s*(\d{2})일\s*(\d{2}):(\d{2})/);
  if (!match) return "";
  return `20${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}`;
}

function splitBunjangBlocks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  return normalized
    .split(/(?=상품\s*준비\s*중)/g)
    .map((block) => block.trim())
    .filter((block) => block.includes("배송지정보") && block.includes("거래정보"));
}

function pickNextLine(lines: string[], label: string) {
  const index = lines.findIndex((line) => line === label || line.includes(label));
  return index >= 0 ? safeText(lines[index + 1]) : "";
}

function parseBunjangShippingType(block: string) {
  const method = block.match(/거래방법\s*\n([^\n]+)/)?.[1] || "";
  const shippingFeeText = block.match(/배송비\s*\n\s*([+\-]?\s*[\d,]+원)/)?.[1] || "";
  const shippingFee = parsePrice(shippingFeeText);

  if (method.includes("GS반값택배")) return "GS반값택배";
  if (method.includes("일반택배") && shippingFee > 0 && shippingFee <= 2900) return "준등기";
  return "일반택배";
}

function parseBunjangAddress(lines: string[], shippingType: string) {
  const start = lines.findIndex((line) => line.includes("배송지정보"));
  if (start < 0) {
    return { recipientName: "", postalCode: "", phone: "", address: "" };
  }

  const section: string[] = [];

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      line.includes("거래 요청사항") ||
      line.includes("거래정보") ||
      line.includes("주문번호")
    ) {
      break;
    }
    if (line) section.push(line);
  }

  const recipientName = section[0] || "";
  const phone = section.find((line) => /^01\d-\d{3,4}-\d{4}$/.test(line)) || "";

  if (shippingType === "GS반값택배") {
    const storeName =
      section.find((line) => /^GS\d*/.test(line) || line.includes("GS25")) || "";

    return {
      recipientName,
      postalCode: "",
      phone,
      address: storeName,
    };
  }

  const addressLine =
    section.find((line) => /^\(\d{5}\)/.test(line)) ||
    section.find((line) => /\d{5}/.test(line) && /시|도|구|군|로|길/.test(line)) ||
    "";

  const match = addressLine.match(/^\((\d{5})\)\s*(.+)$/);

  return {
    recipientName,
    postalCode: match ? match[1] : "",
    phone,
    address: match ? match[2] : addressLine,
  };
}

function parseBunjangItems(block: string) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const productPriceText =
    block.match(/판매정보\s*\n상품금액\s*\n\s*([\d,]+원)/)?.[1] || "";
  const price = parsePrice(productPriceText);

  const start = lines.findIndex((line) => line.includes("상품 준비 중"));
  const end = lines.findIndex((line) => line.includes("배송 예약하기"));
  const candidateLines = start >= 0 && end > start ? lines.slice(start + 2, end) : [];

  const productName = candidateLines.find((line) => !/^[\d,]+원$/.test(line)) || "";

  return {
    items: productName ? [{ item_text: productName, price }] : [],
    itemSummary: productName,
    itemTotalPrice: price ? formatWon(price) : "",
    total: price,
  };
}

function parseBunjangText(text: string): ParsedRow[] {
  const blocks = splitBunjangBlocks(text);

  return blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const shippingType = parseBunjangShippingType(block);
    const addressInfo = parseBunjangAddress(lines, shippingType);
    const parsedItems = parseBunjangItems(block);

    const nickname = pickNextLine(lines, "구매자");
    const orderDateRaw = block.match(/\d{2}년\s*\d{2}월\s*\d{2}일\s*\d{2}:\d{2}/)?.[0] || "";
    const orderDate = normalizeBunjangDate(orderDateRaw);

    return {
      selected: true,
      platform: "bunjang",
      recipientName: addressInfo.recipientName,
      nickname,
      postalCode: withApostrophe(addressInfo.postalCode),
      phone: withApostrophe(addressInfo.phone),
      address: addressInfo.address,
      customerOrderNo: `B${nickname}`,
      itemName: "피규어",
      contentName: `스와숍-${nickname}`,
      boxCount: "1",
      boxType: "1",
      baseFee: "",
      orderCount: "1",
      firstOrderDate: orderDate,
      itemSummary: parsedItems.itemSummary,
      itemTotalPrice: parsedItems.itemTotalPrice,
      sourceOrderDates: orderDate ? [orderDate] : [],
      items: parsedItems.items,
      shippingType,
    };
  });
}

function parseDomesticText(text: string, platform: Platform): ParsedRow[] {
  if (platform === "bunjang") {
    return parseBunjangText(text);
  }

  const blocks = splitOrderBlocks(text);
  const prefix = PLATFORM_PREFIX[platform];
  const map = new Map<string, ParsedRow>();

  blocks.forEach((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const orderDate = extractOrderDate(block);

    const shippingInfoIndex = lines.findIndex((line) => line.includes("배송 정보"));
    const nameLine = shippingInfoIndex >= 0 ? lines[shippingInfoIndex + 1] || "" : "";

    const addressLine =
      lines.find((line) => /^\[\d{5}\]/.test(line)) ||
      lines.find((line) => /\d{5}/.test(line) && /시|도|구|군|로|길/.test(line)) ||
      "";

    const addressMatch = addressLine.match(/^\[(\d{5})\]\s*(.+)$/);
    const postalCode = addressMatch ? addressMatch[1] : "";
    const address = addressMatch ? addressMatch[2] : addressLine;

    const phoneLabelIndex = lines.findIndex((line) => line.includes("연락처"));
    const phoneLine = phoneLabelIndex >= 0 ? lines[phoneLabelIndex + 1] || "" : "";
    const phone = phoneLine.replace(/\(.*?\)/g, "").trim();

    const { recipientName, nickname } = parseNameAndNickname(nameLine);
    const parsedItems = parseItems(block);

    const key = `${recipientName}|${nickname}|${postalCode}|${phone}|${address}`;
    const existing = map.get(key);

    if (existing) {
      const nextTotal = parsePrice(existing.itemTotalPrice) + parsedItems.total;

      existing.orderCount = String(Number(existing.orderCount || 0) + 1);
      existing.firstOrderDate = firstDate(existing.firstOrderDate, orderDate);
      existing.sourceOrderDates = [...existing.sourceOrderDates, orderDate].filter(Boolean);
      existing.itemSummary = [existing.itemSummary, parsedItems.itemSummary]
        .filter(Boolean)
        .join(" / ");
      existing.itemTotalPrice = nextTotal ? formatWon(nextTotal) : "";
      existing.items.push(...parsedItems.items);
      return;
    }

    map.set(key, {
      selected: true,
      platform,
      recipientName,
      nickname,
      postalCode: withApostrophe(postalCode),
      phone: withApostrophe(phone),
      address,
      customerOrderNo: `${prefix}${nickname}`,
      itemName: "피규어",
      contentName: `도파민베이커리-${nickname}`,
      boxCount: "1",
      boxType: "1",
      baseFee: "",
      orderCount: "1",
      firstOrderDate: orderDate,
      itemSummary: parsedItems.itemSummary,
      itemTotalPrice: parsedItems.itemTotalPrice,
      sourceOrderDates: orderDate ? [orderDate] : [],
      items: parsedItems.items,
      shippingType: "일반택배",
    });
  });

  return Array.from(map.values());
}

function numberFromWon(value: string) {
  return Number(safeText(value).replace(/[^0-9]/g, "")) || 0;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const supabase = createServiceRoleClient();

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const platform = normalizePlatform(form.get("platform"));
      const text = safeText(form.get("text"));

      const parsed = parseDomesticText(text, platform);
      const orderIds = parsed.map((row) => row.customerOrderNo).filter(Boolean);

      const { data: existing, error } = orderIds.length
        ? await supabase
            .from("domestic_order")
            .select("order_id")
            .in("order_id", orderIds)
        : { data: [], error: null };

      if (error) {
        return NextResponse.json(
          { error: "기존 국내 주문 조회 실패", detail: error.message },
          { status: 500 }
        );
      }

      const existingSet = new Set((existing || []).map((row: any) => row.order_id));
      const fresh = parsed.filter((row) => !existingSet.has(row.customerOrderNo));
      const duplicated = parsed
        .filter((row) => existingSet.has(row.customerOrderNo))
        .map((row) => ({
          ...row,
          selected: false,
          disabled: true,
          reason: "기존 DB 중복",
        }));

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
    const selectedRows = rows.filter((row: ParsedRow) => row.selected);

    if (!selectedRows.length) {
      return NextResponse.json({ ok: true, saved: 0, skipped_count: 0, skipped: [] });
    }

    const orderIds = selectedRows.map((row: ParsedRow) => row.customerOrderNo);

    const { data: existing, error: existingError } = await supabase
      .from("domestic_order")
      .select("order_id")
      .in("order_id", orderIds);

    if (existingError) {
      return NextResponse.json(
        { error: "저장 전 중복 조회 실패", detail: existingError.message },
        { status: 500 }
      );
    }

    const existingSet = new Set((existing || []).map((row: any) => row.order_id));
    const freshRows = selectedRows.filter(
      (row: ParsedRow) => !existingSet.has(row.customerOrderNo)
    );

    const skipped = selectedRows
      .filter((row: ParsedRow) => existingSet.has(row.customerOrderNo))
      .map((row: ParsedRow) => ({ order_id: row.customerOrderNo, reason: "저장 직전 기존 DB 중복" }));

    if (!freshRows.length) {
      return NextResponse.json({ ok: true, saved: 0, skipped_count: skipped.length, skipped });
    }

    const orderPayload = freshRows.map((row: ParsedRow) => ({
      order_id: row.customerOrderNo,
      platform: row.platform,
      source_order_dates: row.sourceOrderDates || [],
      first_order_date: row.firstOrderDate || null,
      nickname: row.nickname || null,
      recipient_name: row.recipientName || null,
      phone: removeApostrophe(row.phone) || null,
      postal_code: removeApostrophe(row.postalCode) || null,
      address: row.address || null,
      order_count: Number(row.orderCount) || 1,
      item_total_price: numberFromWon(row.itemTotalPrice),
      item_summary: row.itemSummary || null,
      order_status: "accepted",
    }));

    const shippingPayload = freshRows.map((row: ParsedRow) => ({
      order_id: row.customerOrderNo,
      carrier: "우체국택배",
      shipping_type: row.shippingType || "일반택배",
      tracking_number: null,
      shipping_status: "start",
    }));

    const itemPayload = freshRows.flatMap((row: ParsedRow) =>
      (row.items || []).map((item) => ({
        order_id: row.customerOrderNo,
        item_text: item.item_text,
        price: item.price || 0,
      }))
    );

    const { error: orderInsertError } = await supabase
      .from("domestic_order")
      .insert(orderPayload);

    if (orderInsertError) {
      return NextResponse.json(
        { error: "국내 주문 저장 실패", detail: orderInsertError.message },
        { status: 500 }
      );
    }

    const { error: shippingInsertError } = await supabase
      .from("domestic_shipping")
      .insert(shippingPayload);

    if (shippingInsertError) {
      return NextResponse.json(
        { error: "국내 배송정보 저장 실패", detail: shippingInsertError.message },
        { status: 500 }
      );
    }

    if (itemPayload.length) {
      const { error: itemInsertError } = await supabase
        .from("domestic_order_item")
        .insert(itemPayload);

      if (itemInsertError) {
        return NextResponse.json(
          { error: "국내 상품정보 저장 실패", detail: itemInsertError.message },
          { status: 500 }
        );
      }
    }

    await supabase.from("admin_activity_log").insert({
      activity_type: "domestic_upload",
    });

    return NextResponse.json({
      ok: true,
      saved: freshRows.length,
      skipped_count: skipped.length,
      skipped,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "국내 주문 업로드 처리 중 오류", detail: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
