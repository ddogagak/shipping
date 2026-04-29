export type ParsedItem = {
  item_id: string;
  item_title: string;
  option_text: string;
  quantity: number;
  item_price: number;
  item_total: number;
  transaction_id: string;
};

export type ParsedOrder = {
  order_no: string;
  sales_record_no: string;
  order_date: string;
  buyer_username: string;
  buyer_email: string;
  recipient_name: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  tax_code: string;
  subtotal: number;
  shipping_fee: number;
  tax_amount: number;
  order_total: number;
  quantity_total: number;
  export_price: number;
  process_status: "ready" | "pending";
  shipping_status: "not_exported";
  items: ParsedItem[];
};

const EU_IOSS_COUNTRIES = new Set(["SE", "DE", "ES", "PL", "FR", "IE", "IT"]);
const KPACKET_COUNTRIES = new Set([
  "NZ", "MY", "VN", "BR", "SG", "GB", "AU", "ID", "JP", "CN", "CA", "TH", "TW", "FR", "PH", "HK", "RU", "DE", "ES",
  "AR", "AT", "BY", "BE", "KH", "CL", "EG", "FI", "HN", "IN", "IE", "IL", "IT", "KZ", "KG", "MX", "MN", "NP", "NL", "NO", "PK", "PE", "PL", "SA", "ZA", "SE", "CH", "TR", "UA", "AE", "UZ"
]);

const COUNTRY_CODES: Record<string, string> = {
  "United States": "US", "USA": "US", "Canada": "CA", "Italy": "IT", "Germany": "DE", "New Zealand": "NZ", "Australia": "AU", "United Kingdom": "GB", "UK": "GB", "France": "FR", "Spain": "ES", "Mexico": "MX", "Colombia": "CO", "Brazil": "BR", "Japan": "JP", "China": "CN", "Singapore": "SG", "Malaysia": "MY", "Vietnam": "VN", "Thailand": "TH", "Taiwan": "TW", "Hong Kong": "HK", "Russia": "RU", "Netherlands": "NL", "Norway": "NO", "Sweden": "SE", "Switzerland": "CH", "Turkey": "TR", "United Arab Emirates": "AE", "India": "IN", "Ireland": "IE", "Israel": "IL", "Belgium": "BE", "Austria": "AT", "Poland": "PL", "Finland": "FI", "South Africa": "ZA", "Chile": "CL", "Argentina": "AR", "Peru": "PE", "Saudi Arabia": "SA", "Ukraine": "UA", "Uzbekistan": "UZ", "Kazakhstan": "KZ", "Kyrgyzstan": "KG", "Mongolia": "MN", "Nepal": "NP", "Pakistan": "PK", "Cambodia": "KH", "Egypt": "EG", "Honduras": "HN", "Belarus": "BY", "Indonesia": "ID", "Philippines": "PH"
};

function toNumber(v: unknown): number {
  return Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function countryCodeFromName(name: string): string {
  const trimmed = String(name || "").trim();
  return COUNTRY_CODES[trimmed] || trimmed.toUpperCase();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
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
    if (ch === ',') {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === '\n') {
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
  return rows;
}

function normalizeTaxCode(rawTaxText: string, countryCode: string): string {
  let t = String(rawTaxText || "").trim();
  if (t.includes(",")) t = t.split(",")[0].trim();
  const rfcMatch = t.match(/RFC\s*[:\-]?\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i);
  if (rfcMatch) t = rfcMatch[1].toUpperCase().replace(/Ñ/g, "N");

  if (/IM2760000742/.test(t)) t = "IM2760000742";
  else if (/64652016681/.test(t)) t = "ABN64652016681";
  else if (/36560857/.test(t)) t = "GB365608576000";

  if (!t || t === "-") {
    if (EU_IOSS_COUNTRIES.has(countryCode)) t = "IM2760000742";
    else if (countryCode === "AU") t = "ABN64652016681";
    else if (countryCode === "GB") t = "GB365608576000";
    else t = "-";
  }
  return t;
}

function hasUsableTaxCode(taxCode: string): boolean {
  return Boolean(taxCode && taxCode !== "-" && taxCode.trim().length >= 4);
}

function exportPrice(subtotal: number, taxCode: string, countryCode: string): number {
  if (!hasUsableTaxCode(taxCode) && countryCode !== "US") return 15;
  return subtotal;
}

function isSummaryRow(row: Record<string, string>): boolean {
  const keys = ["Ship To Name", "Total Price", "Shipping And Handling", "eBay Reference Value", "Buyer Name"];
  return keys.some((k) => String(row[k] || "").trim() !== "");
}

function extractTaxFromRows(summary: Record<string, string>, rows: Record<string, string>[], countryCode: string): string {
  const source = [summary, ...rows].find((r) =>
    String(r["eBay Reference Value"] || "").trim() || String(r["Buyer Tax Identifier Value"] || "").trim()
  ) || summary;

  const ebayRefName = String(source["eBay Reference Name"] || "").trim();
  const ebayRefValue = String(source["eBay Reference Value"] || "").trim();
  const buyerTaxName = String(source["Buyer Tax Identifier Name"] || "").trim();
  const buyerTaxValue = String(source["Buyer Tax Identifier Value"] || "").trim();

  let raw = ebayRefValue || buyerTaxValue || "";
  if (/^RFC$/i.test(buyerTaxName) && buyerTaxValue) raw = buyerTaxValue;
  if (/^GST$/i.test(ebayRefName) && /IRD#/i.test(ebayRefValue)) raw = ebayRefValue;

  return normalizeTaxCode(raw, countryCode);
}

export function parseEbayOrdersCsv(csvText: string): ParsedOrder[] {
  const rows = parseCsv(csvText)
    .map((r) => r.map((v) => String(v || "").trim()))
    .filter((r) => r.some((v) => v !== ""));

  const headerIndex = rows.findIndex((r) => r.some((v) => v.toLowerCase() === "order number"));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex];
  const records = rows.slice(headerIndex + 1).filter((r) => !r.some((v) => /record\(s\)\s+downloaded/i.test(v)));

  const mapped = records.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });

  const group = new Map<string, Record<string, string>[]>();
  mapped.forEach((row) => {
    const orderNo = String(row["Order Number"] || "").trim();
    if (!orderNo) return;
    if (!group.has(orderNo)) group.set(orderNo, []);
    group.get(orderNo)!.push(row);
  });

  return [...group.entries()].map(([orderNo, orderRows]) => {
    const summary = orderRows.find(isSummaryRow) || orderRows[0] || {};
    let itemRows = orderRows.filter((r) => String(r["Item Number"] || "").trim() || String(r["Item Title"] || "").trim());
    if (!itemRows.length && (summary["Item Number"] || summary["Item Title"])) itemRows = [summary];

    const items: ParsedItem[] = itemRows.map((r) => ({
      item_id: String(r["Item Number"] || "").trim(),
      item_title: String(r["Item Title"] || "").trim(),
      option_text: String(r["Variation Details"] || "").trim(),
      quantity: toNumber(r["Quantity"]),
      item_price: toNumber(r["Sold For"]),
      item_total: toNumber(r["Sold For"]),
      transaction_id: String(r["Transaction ID"] || "").trim()
    }));

    const countryCode = countryCodeFromName(String(summary["Ship To Country"] || "").trim());
    const summaryQty = toNumber(summary["Quantity"]);
    const quantityTotal = summaryQty || items.reduce((sum, it) => sum + (it.quantity || 0), 0);
    const subtotal = toNumber(summary["Sold For"]) || items.reduce((sum, it) => sum + (it.item_total || 0), 0);
    const shippingFee = toNumber(summary["Shipping And Handling"]);
    const taxAmount = toNumber(summary["eBay Collected Tax"]);
    const orderTotal = toNumber(summary["Total Price"]);
    const taxCode = extractTaxFromRows(summary, orderRows, countryCode);
    const processStatus: "ready" | "pending" = KPACKET_COUNTRIES.has(countryCode) ? "ready" : "pending";

    return {
      order_no: orderNo,
      sales_record_no: String(summary["Sales Record Number"] || "").trim(),
      order_date: String(summary["Sale Date"] || "").trim(),
      buyer_username: String(summary["Buyer Username"] || "").trim(),
      buyer_email: String(summary["Buyer Email"] || "").trim(),
      recipient_name: String(summary["Ship To Name"] || "").trim(),
      phone: String(summary["Ship To Phone"] || "").trim(),
      address1: String(summary["Ship To Address 1"] || "").trim(),
      address2: String(summary["Ship To Address 2"] || "").trim(),
      city: String(summary["Ship To City"] || "").trim(),
      state: String(summary["Ship To State"] || "").trim(),
      postal_code: String(summary["Ship To Zip"] || "").trim(),
      country_code: countryCode,
      tax_code: taxCode,
      subtotal,
      shipping_fee: shippingFee,
      tax_amount: taxAmount,
      order_total: orderTotal,
      quantity_total: quantityTotal,
      export_price: exportPrice(subtotal, taxCode, countryCode),
      process_status: processStatus,
      shipping_status: "not_exported",
      items
    };
  });
}
