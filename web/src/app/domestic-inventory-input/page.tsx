function parseAmazonOrders(rawText: string): PreviewItem[] {
  if (!rawText.trim()) return [];

  if (rawText.includes("=== ITEM ===")) {
    return parseFixedInventoryText(rawText);
  }

  return [];
}

function parseFixedInventoryText(rawText: string): PreviewItem[] {
  const hasOrderBlock = rawText.includes("=== ORDER ===");

  const orderBlock = hasOrderBlock
    ? rawText.split("=== ITEM ===")[0]
    : "";

  const orderNo = getField(orderBlock, "ORDER_NO");
  const orderDate = getField(orderBlock, "ORDER_DATE");
  const orderSeries = getField(orderBlock, "SERIES");
  const orderDomesticShipping = toNumber(getField(orderBlock, "DOMESTIC_SHIPPING"));
  const orderTracking = getField(orderBlock, "TRACKING");
  const orderStatus = getField(orderBlock, "STATUS") || "입고전";

  const itemBlocks = rawText
    .split("=== ITEM ===")
    .slice(1)
    .map((block) => block.trim())
    .filter(Boolean);

  return itemBlocks.map((block, index) => {
    const itemName = getField(block, "NAME");

    const itemSeries =
      getField(block, "SERIES") ||
      orderSeries ||
      detectSeriesName(itemName) ||
      "기타";

    const itemType =
      getField(block, "TYPE") ||
      detectItemType(itemName) ||
      "기타";

    const price = toNumber(getField(block, "PRICE"));
    const qty = toNumber(getField(block, "QTY")) || 1;

    return {
      local_id: `${getField(block, "ORDER_NO") || orderNo || "item"}-${index}-${Date.now()}`,
      checked: true,
      item_name: itemName,
      item_type: itemType,
      series_name: itemSeries,
      order_number: getField(block, "ORDER_NO") || orderNo,
      order_date: getField(block, "ORDER_DATE") || orderDate,
      yen_price: price,
      shipping_fee: 0,
      domestic_shipping_fee:
        toNumber(getField(block, "DOMESTIC_SHIPPING")) || orderDomesticShipping,
      total_price: price,
      tracking_number: getField(block, "TRACKING") || orderTracking,
      image_url: getField(block, "IMAGE"),
      quantity: qty,
      status: (getField(block, "STATUS") || orderStatus) as InventoryStatus,
      memo: getField(block, "MEMO"),
      raw_text: block,
      saved: false,
    };
  });
}

function getField(text: string, key: string) {
  const regex = new RegExp(`^${key}:\\s*(.*)$`, "im");
  return text.match(regex)?.[1]?.trim() ?? "";
}

function toNumber(value: string) {
  return Number(String(value).replace(/[¥,\s]/g, "")) || 0;
}
