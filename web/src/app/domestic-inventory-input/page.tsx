"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InventoryStatus =
  | "입고전"
  | "해외배송"
  | "입고완료"
  | "판매중"
  | "판매완료"
  | "보류";

type PreviewItem = {
  local_id: string;
  checked: boolean;
  item_name: string;
  item_type: string;
  series_name: string;
  order_number: string;
  order_date: string;
  yen_price: number;
  shipping_fee: number;
  domestic_shipping_fee: number;
  total_price: number;
  tracking_number: string;
  image_url: string;
  quantity: number;
  status: InventoryStatus;
  memo: string;
  raw_text: string;
  saved?: boolean;
};

type InputMode = "text" | "amazonHtml";

const statusList: InventoryStatus[] = [
  "입고전",
  "해외배송",
  "입고완료",
  "판매중",
  "판매완료",
  "보류",
];

const typeList = ["아크릴", "지류", "뱃지", "피규어", "키링", "기타"];

const seriesList = [
  "헌터헌터",
  "귀멸의칼날",
  "나의히어로아카데미아",
  "프리렌",
  "진격의거인",
  "기타",
];

export default function DomesticInventoryInputPage() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [rawText, setRawText] = useState("");
  const [amazonHtmlText, setAmazonHtmlText] = useState("");
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const parsedItems = useMemo(() => {
    if (inputMode === "amazonHtml") return parseAmazonHtml(amazonHtmlText);
    return parseAmazonOrders(rawText);
  }, [inputMode, rawText, amazonHtmlText]);

  useEffect(() => {
    setItems(parsedItems);
  }, [parsedItems]);

  const checkedCount = items.filter((item) => item.checked && !item.saved).length;

  const updateItem = (
    localId: string,
    field: keyof PreviewItem,
    value: string | boolean
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.local_id !== localId) return item;

        if (
          field === "quantity" ||
          field === "yen_price" ||
          field === "shipping_fee" ||
          field === "domestic_shipping_fee" ||
          field === "total_price"
        ) {
          return { ...item, [field]: Number(value), saved: false };
        }

        return { ...item, [field]: value, saved: false };
      })
    );
  };

  const toggleAll = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, checked })));
  };

  const handleAmazonHtmlFile = async (file?: File) => {
    if (!file) return;

    const text = await file.text();
    setInputMode("amazonHtml");
    setAmazonHtmlText(text);
  };

  const saveSelected = async () => {
    setSaveMessage("");
    setIsSaving(true);

    const targets = items.filter((item) => item.checked && !item.saved);
    let successCount = 0;

    try {
      for (const item of targets) {
        if (!item.item_name.trim()) {
          throw new Error("상품명이 없는 항목이 있어 저장을 중단했어.");
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        const res = await fetch("/api/domestic-inventory/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
          signal: controller.signal,
        });

        clearTimeout(timer);

        const text = await res.text();

        let result: { ok?: boolean; message?: string } = {};

        try {
          result = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`API 응답이 JSON이 아님: ${text.slice(0, 200)}`);
        }

        if (!res.ok || !result.ok) {
          throw new Error(result.message || `저장 실패: ${res.status}`);
        }

        successCount += 1;

        setItems((prev) =>
          prev.map((prevItem) =>
            prevItem.local_id === item.local_id
              ? { ...prevItem, saved: true, checked: false }
              : prevItem
          )
        );
      }

      setSaveMessage(`${successCount}건 저장 완료`);
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? `저장 실패: ${error.message}` : "저장 실패"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>국내 재고 입력</h1>
          <p style={subTextStyle}>
            모바일은 텍스트 붙여넣기, PC는 Amazon HTML 업로드를 사용할 수 있어.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkButtonStyle}>
            메인
          </Link>
          <Link href="/domestic-inventory-cards" style={linkButtonStyle}>
            카드형 보기
          </Link>
          <Link href="/domestic-inventory" style={linkButtonStyle}>
            인벤토리
          </Link>
        </div>
      </div>

      <section style={inputPanelStyle}>
        <div style={modeButtonRowStyle}>
          <button
            type="button"
            onClick={() => setInputMode("text")}
            style={inputMode === "text" ? activeModeButtonStyle : modeButtonStyle}
          >
            텍스트 붙여넣기
          </button>

          <button
            type="button"
            onClick={() => setInputMode("amazonHtml")}
            style={
              inputMode === "amazonHtml" ? activeModeButtonStyle : modeButtonStyle
            }
          >
            Amazon HTML 업로드
          </button>
        </div>

        {inputMode === "text" ? (
          <>
            <h2 style={panelTitleStyle}>주문내역 텍스트 붙여넣기</h2>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="아마존 주문내역 텍스트를 여러 건 그대로 붙여넣기"
              style={rawTextareaStyle}
            />
          </>
        ) : (
          <>
            <h2 style={panelTitleStyle}>Amazon 주문 HTML 업로드</h2>
            <input
              type="file"
              accept=".html,.htm,text/html"
              onChange={(e) => handleAmazonHtmlFile(e.target.files?.[0])}
              style={fileInputStyle}
            />
            <textarea
              value={amazonHtmlText}
              onChange={(e) => setAmazonHtmlText(e.target.value)}
              placeholder="또는 Amazon 주문 HTML 내용을 직접 붙여넣기"
              style={rawTextareaStyle}
            />
          </>
        )}

        <div style={controlBarStyle}>
          <div style={summaryBoxStyle}>
            자동 인식 <strong>{items.length}</strong>건 / 저장대상{" "}
            <strong>{checkedCount}</strong>건
          </div>

          <button type="button" onClick={() => toggleAll(true)} style={smallButtonStyle}>
            전체선택
          </button>

          <button type="button" onClick={() => toggleAll(false)} style={smallButtonStyle}>
            전체해제
          </button>

          <button
            type="button"
            onClick={saveSelected}
            disabled={isSaving || checkedCount === 0}
            style={{
              ...saveButtonStyle,
              opacity: isSaving || checkedCount === 0 ? 0.6 : 1,
              cursor: isSaving || checkedCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "저장 중..." : `체크한 항목 저장 (${checkedCount}건)`}
          </button>
        </div>

        {saveMessage ? <div style={messageStyle}>{saveMessage}</div> : null}
      </section>

      <section style={cardsSectionStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>주문내역을 넣으면 카드가 생성됩니다.</div>
        ) : (
          items.map((item, index) => (
            <article key={item.local_id} style={compactCardStyle}>
              <div style={checkAreaStyle}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) =>
                    updateItem(item.local_id, "checked", e.target.checked)
                  }
                  style={{ width: 18, height: 18 }}
                />
                <strong>#{index + 1}</strong>
              </div>

              <div style={thumbBoxStyle}>
                {item.image_url ? (
                  <img src={item.image_url} alt="" style={thumbStyle} />
                ) : (
                  <div style={emptyThumbStyle}>IMG</div>
                )}
              </div>

              <div style={cardMainStyle}>
                <div style={badgeRowStyle}>
                  <span style={badgeStyle}>{item.series_name}</span>
                  <span style={typeBadgeStyle}>{item.item_type}</span>
                  <span style={statusBadgeStyle}>{item.status}</span>
                  {item.saved ? <span style={savedBadgeStyle}>저장완료</span> : null}
                </div>

                <EditableField
                  label="상품명"
                  value={item.item_name}
                  onChange={(value) => updateItem(item.local_id, "item_name", value)}
                  textarea
                />

                <div style={grid4Style}>
                  <EditableSelect
                    label="작품명"
                    value={item.series_name}
                    options={seriesList}
                    onChange={(value) =>
                      updateItem(item.local_id, "series_name", value)
                    }
                  />

                  <EditableSelect
                    label="타입"
                    value={item.item_type}
                    options={typeList}
                    onChange={(value) => updateItem(item.local_id, "item_type", value)}
                  />

                  <EditableSelect
                    label="상태"
                    value={item.status}
                    options={statusList}
                    onChange={(value) => updateItem(item.local_id, "status", value)}
                  />

                  <EditableField
                    label="수량"
                    value={String(item.quantity)}
                    type="number"
                    onChange={(value) => updateItem(item.local_id, "quantity", value)}
                  />
                </div>

                <div style={grid4Style}>
                  <EditableField
                    label="주문일"
                    value={item.order_date}
                    onChange={(value) => updateItem(item.local_id, "order_date", value)}
                  />

                  <EditableField
                    label="주문번호"
                    value={item.order_number}
                    onChange={(value) =>
                      updateItem(item.local_id, "order_number", value)
                    }
                  />

                  <EditableField
                    label="총액(¥)"
                    value={String(item.total_price)}
                    type="number"
                    onChange={(value) => updateItem(item.local_id, "total_price", value)}
                  />

                  <EditableField
                    label="일본내배송비"
                    value={String(item.domestic_shipping_fee)}
                    type="number"
                    onChange={(value) =>
                      updateItem(item.local_id, "domestic_shipping_fee", value)
                    }
                  />
                </div>

                <div style={grid3Style}>
                  <EditableField
                    label="이미지 URL"
                    value={item.image_url}
                    onChange={(value) => updateItem(item.local_id, "image_url", value)}
                  />

                  <EditableField
                    label="운송장"
                    value={item.tracking_number}
                    onChange={(value) =>
                      updateItem(item.local_id, "tracking_number", value)
                    }
                  />

                  <EditableField
                    label="메모"
                    value={item.memo}
                    onChange={(value) => updateItem(item.local_id, "memo", value)}
                  />
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

function parseAmazonHtml(htmlText: string): PreviewItem[] {
  if (!htmlText.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  doc
    .querySelectorAll("script, style, noscript, nav, header, footer")
    .forEach((el) => el.remove());

  const orderCards = Array.from(
    doc.querySelectorAll(".order-card.js-order-card")
  ).filter((card) => {
    const text = card.textContent ?? "";

    return (
      /ORDER\s*#/i.test(text) &&
      /ORDER\s*PLACED/i.test(text) &&
      /View order details/i.test(text)
    );
  });

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

    if (!orderNumber) return [];

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
          href.includes("/dp/") &&
          href.includes("asin_title") &&
          title.length > 5 &&
          !title.includes("/dp/") &&
          !isNotProductLine(title)
        );
      })
      .filter((a, index, arr) => {
        const title = normalizeTitle(a.textContent?.trim() ?? "");

        return (
          title &&
          arr.findIndex(
            (other) => normalizeTitle(other.textContent?.trim() ?? "") === title
          ) === index
        );
      });

    return productLinks.map((link, itemIndex) => {
      const itemName = link.textContent?.trim() ?? "";

      const nearestRow =
        link.closest(".a-fixed-left-grid") ??
        link.closest("[class*='yohtmlc-product']") ??
        link.parentElement ??
        card;

      const img =
        nearestRow.querySelector("img") ??
        card.querySelectorAll("img")[itemIndex] ??
        card.querySelector("img");

      const imageUrl = normalizeImageUrl(
        img?.getAttribute("data-a-hires")?.trim() ||
          img?.getAttribute("src")?.trim() ||
          ""
      );

      const imageAlt = img?.getAttribute("alt")?.trim() ?? "";
      const itemText = `${imageAlt}\n${itemName}`;
      const quantity = img ? findQuantityNearImage(img) : 1;

      return {
        local_id: `${orderNumber}-${itemIndex}-${itemName.slice(0, 12)}`,
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

function parseAmazonOrders(rawText: string): PreviewItem[] {
  const chunks = rawText
    .split(/(?=Order placed\s*\n|ORDER PLACED\s*\n)/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => /Order #|ORDER #/i.test(chunk));

  return chunks.flatMap((chunk, index) => {
    const orderDate =
      chunk.match(/Order placed\s*\n\s*([A-Za-z]+\s\d{1,2},\s\d{4})/i)?.[1] ??
      chunk.match(/ORDER PLACED\s*\n\s*([A-Za-z]+\s\d{1,2},\s\d{4})/i)?.[1] ??
      "";

    const orderNumber =
      chunk.match(/Order #\s*([\d-]+)/i)?.[1] ??
      chunk.match(/ORDER #\s*([\d-]+)/i)?.[1] ??
      "";

    const totalText =
      chunk.match(/Total\s*\n\s*¥([\d,]+)/i)?.[1] ??
      chunk.match(/TOTAL\s*\n\s*¥([\d,]+)/i)?.[1] ??
      chunk.match(/Grand Total:\s*¥([\d,]+)/i)?.[1] ??
      "0";

    const totalPrice = Number(totalText.replaceAll(",", "")) || 0;

    const shippingText =
      chunk.match(/Shipping\s*&\s*Handling:\s*¥([\d,]+)/i)?.[1] ?? "0";

    const shippingFee = Number(shippingText.replaceAll(",", "")) || 0;
    const itemBlocks = splitItemsInOrderChunk(chunk);

    return itemBlocks.map((itemText, itemIndex) => {
      const itemName = extractItemName(itemText);

      return {
        local_id: `${orderNumber || index}-${itemIndex}-${itemName.slice(0, 12)}`,
        checked: true,
        item_name: itemName,
        item_type: detectItemType(itemText),
        series_name: detectSeriesName(itemText),
        order_number: orderNumber,
        order_date: orderDate,
        yen_price: totalPrice,
        shipping_fee: shippingFee,
        domestic_shipping_fee: 0,
        total_price: totalPrice,
        tracking_number: "",
        image_url: "",
        quantity: extractQuantity(itemText),
        status: "입고전",
        memo: "",
        raw_text: itemText,
        saved: false,
      };
    });
  });
}

function splitItemsInOrderChunk(chunk: string) {
  const lines = chunk
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const result: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";

    if (isNotProductLine(line)) continue;

    const lower = line.toLowerCase();

    const looksLikeJapaneseProduct =
      /[ぁ-んァ-ン一-龥]/.test(line) &&
      (line.includes("アニメ") ||
        line.includes("ヒーロー") ||
        line.includes("HUNTER") ||
        line.includes("鬼滅") ||
        line.includes("フリーレン") ||
        line.includes("進撃") ||
        line.includes("バンダイ") ||
        line.includes("BANDAI") ||
        line.includes("リーメント") ||
        line.includes("アクリル") ||
        line.includes("カード") ||
        line.includes("缶バッジ") ||
        line.includes("BOX") ||
        line.includes("食玩"));

    const looksLikeEnglishProduct =
      /[a-zA-Z]/.test(line) &&
      (lower.includes("my hero") ||
        lower.includes("hunter") ||
        lower.includes("demon slayer") ||
        lower.includes("frieren") ||
        lower.includes("attack on titan") ||
        lower.includes("acrylic") ||
        lower.includes("card") ||
        lower.includes("badge") ||
        lower.includes("figure") ||
        lower.includes("re-ment") ||
        lower.includes("rement") ||
        lower.includes("box"));

    if (looksLikeJapaneseProduct || looksLikeEnglishProduct) {
      const block = next && !isNotProductLine(next) ? `${line}\n${next}` : line;
      result.push(block);
    }
  }

  return result;
}

function extractItemName(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isNotProductLine(line));

  const englishTitle = lines.find((line) => {
    const lower = line.toLowerCase();

    if (!/[a-zA-Z]/.test(line)) return false;
    if (line.includes("¥")) return false;
    if (/^\d{3}-\d{7}-\d{7}$/.test(line)) return false;

    return (
      lower.includes("my hero") ||
      lower.includes("hunter") ||
      lower.includes("demon slayer") ||
      lower.includes("frieren") ||
      lower.includes("attack on titan") ||
      lower.includes("acrylic") ||
      lower.includes("card") ||
      lower.includes("badge") ||
      lower.includes("figure") ||
      lower.includes("re-ment") ||
      lower.includes("rement") ||
      lower.includes("box")
    );
  });

  if (englishTitle) return englishTitle;

  return lines.find((line) => /[ぁ-んァ-ン一-龥]/.test(line)) ?? "";
}

function isNotProductLine(line: string) {
  const lower = line.toLowerCase();

  if (!line.trim()) return true;

  return (
    lower.includes("ue.count") ||
    lower.includes("ordersview") ||
    lower.includes("function") ||
    lower.includes("window.") ||
    lower.includes("amazonuipagejs") ||
    lower.includes("order placed") ||
    lower.includes("order #") ||
    lower.includes("invoice") ||
    lower.includes("ship to") ||
    lower.includes("sungyeon") ||
    lower.includes("tokyo-to") ||
    lower.includes("japan") ||
    lower.includes("eldex") ||
    lower.includes("delivered") ||
    lower.includes("your package was delivered") ||
    lower.includes("total") ||
    lower.includes("buy it again") ||
    lower.includes("view your item") ||
    lower.includes("track package") ||
    lower.includes("return items") ||
    lower.includes("return or replace") ||
    lower.includes("problem with order") ||
    lower.includes("write a product review") ||
    lower.includes("share gift receipt") ||
    lower.includes("leave seller feedback") ||
    lower.includes("ask product question") ||
    lower.includes("estimated to arrive") ||
    lower.includes("order received") ||
    line.includes("墨田区") ||
    line.includes("東墨田") ||
    line.includes("東京都") ||
    line.includes("131-0042") ||
    line.includes("2F") ||
    line.includes("KI107555")
  );
}

function extractQuantity(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const jpMatch =
      line.match(/個入り\s*(\d+)$/) ||
      line.match(/パック入\s*(\d+)$/) ||
      line.match(/枚入り\s*(\d+)$/) ||
      line.match(/BOX商品.*?(\d+)$/) ||
      line.match(/セット】\s*(\d+)$/);

    if (jpMatch) return Number(jpMatch[1]) || 1;
  }

  for (const line of lines) {
    const enMatch =
      line.match(/included\s*(\d+)$/i) || line.match(/box product\s*(\d+)$/i);

    if (enMatch) return Number(enMatch[1]) || 1;
  }

  return 1;
}

function detectItemType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("acrylic") || text.includes("アクリル") || text.includes("아크릴"))
    return "아크릴";
  if (
    lower.includes("can badge") ||
    lower.includes("tin badge") ||
    lower.includes("badge") ||
    text.includes("缶バッジ") ||
    text.includes("缶バッチ") ||
    text.includes("バッジ") ||
    text.includes("뱃지") ||
    text.includes("배지")
  )
    return "뱃지";
  if (
    lower.includes("figure") ||
    lower.includes("re-ment") ||
    lower.includes("rement") ||
    text.includes("フィギュア") ||
    text.includes("리멘트") ||
    text.includes("피규어")
  )
    return "피규어";
  if (
    lower.includes("keyring") ||
    lower.includes("key ring") ||
    lower.includes("keychain") ||
    lower.includes("key chain") ||
    lower.includes("key holder") ||
    text.includes("キーホルダー") ||
    text.includes("キーリング") ||
    text.includes("키링") ||
    text.includes("키홀더")
  )
    return "키링";
  if (
    lower.includes("photocard") ||
    lower.includes("photo card") ||
    lower.includes("postcard") ||
    lower.includes("post card") ||
    lower.includes("card") ||
    lower.includes("poster") ||
    text.includes("フォトカード") ||
    text.includes("ポストカード") ||
    text.includes("カード") ||
    text.includes("ポスター") ||
    text.includes("紙製") ||
    text.includes("브로마이드") ||
    text.includes("포토카드") ||
    text.includes("엽서") ||
    text.includes("카드")
  )
    return "지류";

  return "기타";
}

function detectSeriesName(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("hunter x hunter") ||
    lower.includes("hunter×hunter") ||
    lower.includes("hxh") ||
    text.includes("HUNTER×HUNTER") ||
    text.includes("ハンター×ハンター") ||
    text.includes("ハンターハンター") ||
    text.includes("헌터헌터")
  )
    return "헌터헌터";
  if (
    lower.includes("demon slayer") ||
    lower.includes("kimetsu") ||
    text.includes("鬼滅") ||
    text.includes("鬼滅の刃") ||
    text.includes("きめつ") ||
    text.includes("귀멸") ||
    text.includes("귀멸의 칼날")
  )
    return "귀멸의칼날";
  if (
    lower.includes("my hero academia") ||
    lower.includes("hero academia") ||
    lower.includes("boku no hero") ||
    lower.includes("bnha") ||
    lower.includes("mha") ||
    text.includes("僕のヒーローアカデミア") ||
    text.includes("ヒロアカ") ||
    text.includes("나의 히어로 아카데미아") ||
    text.includes("히로아카")
  )
    return "나의히어로아카데미아";
  if (
    lower.includes("frieren") ||
    text.includes("葬送のフリーレン") ||
    text.includes("フリーレン") ||
    text.includes("프리렌") ||
    text.includes("장송의 프리렌")
  )
    return "프리렌";
  if (
    lower.includes("attack on titan") ||
    lower.includes("shingeki") ||
    text.includes("進撃の巨人") ||
    text.includes("進撃") ||
    text.includes("진격의 거인") ||
    text.includes("진격거")
  )
    return "진격의거인";

  return "기타";
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ン一-龥]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function EditableField({
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label style={labelStyle}>
      {label}
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} style={textareaStyle} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </label>
  );
}

function EditableSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

const pageStyle: React.CSSProperties = { padding: 24, background: "#f9fafb", minHeight: "100vh" };
const topBarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800 };
const subTextStyle: React.CSSProperties = { marginTop: 6, color: "#6b7280", fontSize: 14 };
const linkButtonStyle: React.CSSProperties = { height: 40, padding: "0 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", textDecoration: "none", display: "inline-flex", alignItems: "center", fontSize: 14, fontWeight: 600 };
const inputPanelStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, padding: 18, background: "#fff", marginBottom: 18 };
const modeButtonRowStyle: React.CSSProperties = { display: "flex", gap: 8, marginBottom: 16 };
const modeButtonStyle: React.CSSProperties = { height: 38, padding: "0 14px", borderRadius: 999, border: "1px solid #d1d5db", background: "#fff", fontWeight: 800, cursor: "pointer" };
const activeModeButtonStyle: React.CSSProperties = { ...modeButtonStyle, background: "#111827", color: "#fff", border: "1px solid #111827" };
const panelTitleStyle: React.CSSProperties = { margin: "0 0 12px", fontSize: 18, fontWeight: 800 };
const rawTextareaStyle: React.CSSProperties = { width: "100%", minHeight: 180, padding: 12, borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, lineHeight: 1.5, resize: "vertical" };
const fileInputStyle: React.CSSProperties = { display: "block", marginBottom: 12 };
const controlBarStyle: React.CSSProperties = { marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const summaryBoxStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "#f3f4f6", fontSize: 14 };
const smallButtonStyle: React.CSSProperties = { height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: "pointer" };
const saveButtonStyle: React.CSSProperties = { height: 38, padding: "0 14px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontWeight: 800 };
const messageStyle: React.CSSProperties = { marginTop: 10, padding: 10, borderRadius: 10, background: "#f3f4f6", fontSize: 14, fontWeight: 700 };
const cardsSectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const compactCardStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "70px 84px 1fr", gap: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, alignItems: "start" };
const checkAreaStyle: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", paddingTop: 8 };
const thumbBoxStyle: React.CSSProperties = { width: 84, height: 84 };
const thumbStyle: React.CSSProperties = { width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" };
const emptyThumbStyle: React.CSSProperties = { width: 84, height: 84, borderRadius: 10, background: "#f3f4f6", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 };
const cardMainStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const badgeRowStyle: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const badgeStyle: React.CSSProperties = { padding: "4px 8px", borderRadius: 999, background: "#eef2ff", fontSize: 12, fontWeight: 800 };
const typeBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "#fef3c7" };
const statusBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "#fee2e2" };
const savedBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "#dcfce7" };
const grid4Style: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8 };
const grid3Style: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 8 };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 };
const inputStyle: React.CSSProperties = { height: 34, padding: "0 9px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13, background: "#fff" };
const textareaStyle: React.CSSProperties = { minHeight: 48, padding: 9, borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13, resize: "vertical" };
const emptyStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 32, textAlign: "center", color: "#6b7280" };
