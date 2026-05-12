function parseAmazonHtml(htmlText: string): PreviewItem[] {
  if (!htmlText.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  doc.querySelectorAll("script, style, noscript, nav, header, footer").forEach((el) => el.remove());

  const orderCards = Array.from(doc.querySelectorAll(".order-card.js-order-card"));

  return orderCards.flatMap((card, cardIndex) => {
    const cardText = card.textContent ?? "";

    const orderDate =
      findTextAfterLabel(card, "Order placed") ??
      findTextAfterLabel(card, "ORDER PLACED") ??
      "";

    const orderNumber =
      card.querySelector(".yohtmlc-order-id span[dir='ltr']")?.textContent?.trim() ??
      cardText.match(/Order #\s*([0-9-]+)/i)?.[1] ??
      "";

    const totalText =
      findTextAfterLabel(card, "Total") ??
      findTextAfterLabel(card, "TOTAL") ??
      "0";

    const totalPrice = Number(totalText.replace(/[¥,\s]/g, "")) || 0;

    const productLinks = Array.from(card.querySelectorAll("a"))
      .filter((a) => {
        const href = a.getAttribute("href") ?? "";
        const title = a.textContent?.trim() ?? "";

        return (
          title.length > 5 &&
          href.includes("/dp/") &&
          href.includes("asin_title") &&
          !isNotProductLine(title)
        );
      });

    const productImages = Array.from(card.querySelectorAll("img"))
      .filter((img) => {
        const alt = img.getAttribute("alt")?.trim() ?? "";
        const src =
          img.getAttribute("data-a-hires")?.trim() ||
          img.getAttribute("src")?.trim() ||
          "";

        if (!alt || !src) return false;
        if (src.includes("down-arrow") || src.endsWith(".svg")) return false;
        if (src.includes("sprite") || src.includes("nav-") || src.includes("logo")) return false;
        if (src.includes("timeline") || src.includes("transparent-pixel")) return false;

        return true;
      });

    return productLinks.map((link, itemIndex) => {
      const itemName = link.textContent?.trim() ?? "";
      const img = productImages[itemIndex] ?? productImages[0];

      const imageUrl = normalizeImageUrl(
        img?.getAttribute("data-a-hires")?.trim() ||
          img?.getAttribute("src")?.trim() ||
          ""
      );

      const imageAlt = img?.getAttribute("alt")?.trim() ?? "";
      const itemText = `${imageAlt}\n${itemName}`;
      const quantity = img ? findQuantityNearImage(img) : 1;

      return {
        local_id: `${orderNumber || cardIndex}-${itemIndex}-${itemName.slice(0, 12)}`,
        checked: true,
        item_name: itemName,
        item_type: detectItemType(itemText),
        series_name: detectSeriesName(itemText),
        order_number: orderNumber,
        order_date: orderDate,
        yen_price: totalPrice,
        shipping_fee: 0,
        domestic_shipping_fee: 0,
        total_price: totalPrice,
        tracking_number: "",
        image_url: imageUrl,
        quantity,
        status: "입고전",
        memo: "",
        raw_text: cardText,
        saved: false,
      };
    });
  });
}

function findTextAfterLabel(root: Element, label: string) {
  const text = root.textContent ?? "";
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const index = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());

  if (index >= 0) return lines[index + 1] ?? "";

  return "";
}

function findQuantityNearImage(img: Element) {
  let current: Element | null = img;

  for (let i = 0; i < 8; i += 1) {
    if (!current) break;

    const qty =
      current.querySelector(".product-image__qty")?.textContent?.trim() ??
      current.querySelector("[class*='qty']")?.textContent?.trim();

    if (qty && /^\d+$/.test(qty)) return Number(qty) || 1;

    current = current.parentElement;
  }

  return 1;
}

function normalizeImageUrl(value: string) {
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}
