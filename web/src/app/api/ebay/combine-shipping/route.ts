import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CombineShippingBody = {
  order_numbers?: string[];
};

type EbayOrderRow = {
  order_number: string;
  source_order_numbers: string[] | null;
  username: string | null;
  name: string | null;
  country: string | null;
  country_code: string | null;
  quantity: number | null;
  shipping_method: string | null;
  order_status: string | null;
};

type EbayShippingRow = {
  order_number: string;
  username: string | null;
  shipping_method: string | null;
  shipping_label_status: string | null;
  tracking_number: string | null;
  receipt_status: string | null;
  export_data: Record<string, unknown> | null;
};

type EbayOrderItemRow = {
  order_number: string;
  username: string | null;
  quantity: number | null;
  item_list: string | null;
  stockout_item_indexes: number[] | null;
};

function cleanOrderNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.map((v) => String(v ?? "").trim()).filter(Boolean))
  );
}

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function splitItemList(value: string | null): string[] {
  if (!value) return [];

  return value
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v >= 1)
    )
  ).sort((a, b) => a - b);
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CombineShippingBody;
    const orderNumbers = cleanOrderNumbers(body.order_numbers);

    if (orderNumbers.length < 2) {
      return NextResponse.json(
        { error: "합배송할 주문은 2건 이상이어야 합니다." },
        { status: 400 }
      );
    }

    const combinedOrderNumber = orderNumbers
      .map((orderNumber) => orderNumber.slice(-5))
      .join("-");

    const supabase = createServiceRoleClient();

    const { data: existingCombined } = await supabase
      .from("ebay_order")
      .select("order_number")
      .eq("order_number", combinedOrderNumber)
      .maybeSingle();

    if (existingCombined) {
      return NextResponse.json(
        { error: `이미 존재하는 합배송 주문번호입니다: ${combinedOrderNumber}` },
        { status: 400 }
      );
    }

    const { data: orderRows, error: orderError } = await supabase
      .from("ebay_order")
      .select(
        "order_number, source_order_numbers, username, name, country, country_code, quantity, shipping_method, order_status"
      )
      .in("order_number", orderNumbers);

    if (orderError) {
      return NextResponse.json(
        { error: "주문 조회 실패", detail: orderError.message },
        { status: 500 }
      );
    }

    const orders = (orderRows || []) as EbayOrderRow[];

    if (orders.length !== orderNumbers.length) {
      return NextResponse.json(
        { error: "일부 주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const orderMap = new Map(orders.map((row) => [row.order_number, row]));
    const orderedOrders = orderNumbers.map((orderNumber) => orderMap.get(orderNumber)!);

    const usernameKey = normalizeUsername(orderedOrders[0].username);

    if (!usernameKey) {
      return NextResponse.json(
        { error: "username이 없는 주문은 합배송할 수 없습니다." },
        { status: 400 }
      );
    }

    const hasDifferentUsername = orderedOrders.some(
      (row) => normalizeUsername(row.username) !== usernameKey
    );

    if (hasDifferentUsername) {
      return NextResponse.json(
        { error: "username이 같은 주문만 합배송할 수 있습니다." },
        { status: 400 }
      );
    }

    const hasDoneOrder = orderedOrders.some((row) => row.order_status === "done");

    if (hasDoneOrder) {
      return NextResponse.json(
        { error: "주문상태가 완료(done)인 주문은 합배송할 수 없습니다." },
        { status: 400 }
      );
    }

    const { data: shippingRows, error: shippingError } = await supabase
      .from("ebay_shipping")
      .select(
        "order_number, username, shipping_method, shipping_label_status, tracking_number, receipt_status, export_data"
      )
      .in("order_number", orderNumbers);

    if (shippingError) {
      return NextResponse.json(
        { error: "배송정보 조회 실패", detail: shippingError.message },
        { status: 500 }
      );
    }

    const shippings = (shippingRows || []) as EbayShippingRow[];
    const shippingMap = new Map(shippings.map((row) => [row.order_number, row]));
    const orderedShippings = orderNumbers
      .map((orderNumber) => shippingMap.get(orderNumber))
      .filter(Boolean) as EbayShippingRow[];

    const hasDoneShipping = orderedShippings.some(
      (row) => row.shipping_label_status === "done"
    );

    if (hasDoneShipping) {
      return NextResponse.json(
        { error: "라벨상태가 배송완료(done)인 주문은 합배송할 수 없습니다." },
        { status: 400 }
      );
    }

    const { data: itemRows, error: itemError } = await supabase
      .from("ebay_order_item")
      .select("order_number, username, quantity, item_list, stockout_item_indexes")
      .in("order_number", orderNumbers);

    if (itemError) {
      return NextResponse.json(
        { error: "상품정보 조회 실패", detail: itemError.message },
        { status: 500 }
      );
    }

    const items = (itemRows || []) as EbayOrderItemRow[];
    const itemMap = new Map(items.map((row) => [row.order_number, row]));

    const mergedItems: string[] = [];
    const mergedStockoutIndexes: number[] = [];
    let offset = 0;

    orderNumbers.forEach((orderNumber) => {
      const itemRow = itemMap.get(orderNumber);
      const itemList = splitItemList(itemRow?.item_list || null);
      const stockoutIndexes = normalizeIndexes(itemRow?.stockout_item_indexes);

      stockoutIndexes.forEach((index) => {
        mergedStockoutIndexes.push(offset + index);
      });

      mergedItems.push(...itemList);
      offset += itemList.length;
    });

    const totalQuantity = orderedOrders.reduce(
      (sum, row) => sum + numberValue(row.quantity),
      0
    );

    const firstOrder = orderedOrders[0];
    const firstShipping = orderedShippings[0];

    const exportData = {
      ...(firstShipping?.export_data || {}),
    };

    const totalPrice = orderedShippings.reduce((sum, row) => {
      return sum + numberValue(row.export_data?.["★가격"]);
    }, 0);

    exportData["고객주문번호( 숫자,영문 30자이내)"] = combinedOrderNumber;
    exportData["★개수"] = totalQuantity;
    exportData["★가격"] = totalPrice;

    const sourceOrderNumbers = orderedOrders.flatMap((row) => {
      if (Array.isArray(row.source_order_numbers) && row.source_order_numbers.length) {
        return row.source_order_numbers;
      }

      return [row.order_number];
    });

    const { error: insertOrderError } = await supabase.from("ebay_order").insert({
      order_number: combinedOrderNumber,
      source_order_numbers: sourceOrderNumbers,
      username: firstOrder.username,
      name: firstOrder.name,
      country: firstOrder.country,
      country_code: firstOrder.country_code,
      quantity: totalQuantity,
      shipping_method: firstOrder.shipping_method || "check",
      order_status: mergedStockoutIndexes.length > 0 ? "pending" : firstOrder.order_status || "accepted",
    });

    if (insertOrderError) {
      return NextResponse.json(
        { error: "합배송 주문 생성 실패", detail: insertOrderError.message },
        { status: 500 }
      );
    }

    const { error: insertShippingError } = await supabase
      .from("ebay_shipping")
      .insert({
        order_number: combinedOrderNumber,
        username: firstOrder.username,
        shipping_method: firstShipping?.shipping_method || firstOrder.shipping_method || "check",
        shipping_label_status: "start",
        tracking_number: null,
        receipt_status: firstShipping?.receipt_status || null,
        export_data: exportData,
      });

    if (insertShippingError) {
      return NextResponse.json(
        { error: "합배송 배송정보 생성 실패", detail: insertShippingError.message },
        { status: 500 }
      );
    }

    const { error: insertItemError } = await supabase
      .from("ebay_order_item")
      .insert({
        order_number: combinedOrderNumber,
        username: firstOrder.username,
        quantity: totalQuantity,
        item_list: mergedItems.join(" | "),
        stockout_item_indexes: mergedStockoutIndexes,
      });

    if (insertItemError) {
      return NextResponse.json(
        { error: "합배송 상품정보 생성 실패", detail: insertItemError.message },
        { status: 500 }
      );
    }

    await supabase.from("ebay_order_item").delete().in("order_number", orderNumbers);
    await supabase.from("ebay_shipping").delete().in("order_number", orderNumbers);
    await supabase.from("ebay_order").delete().in("order_number", orderNumbers);

    return NextResponse.json({
      ok: true,
      order_number: combinedOrderNumber,
      source_order_numbers: sourceOrderNumbers,
      quantity: totalQuantity,
      item_count: mergedItems.length,
      stockout_item_indexes: mergedStockoutIndexes,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "합배송 처리 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
