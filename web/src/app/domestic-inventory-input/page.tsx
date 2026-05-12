"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PreviewItem = {
  item_name: string;
  item_type: string;
  series_name: string;
  order_number: string;
  order_date: string;
  yen_price: number;
  shipping_fee: number;
  total_price: number;
  tracking_number: string;
  image_url: string;
  quantity: number;
  status: string;
  memo: string;
};

export default function DomesticInventoryInputPage() {
  const [rawText, setRawText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [memo, setMemo] = useState("");

  const preview = useMemo<PreviewItem>(() => {
    const orderNumber = rawText.match(/Order\s?#\s*([\d-]+)/i)?.[1] ?? "";

    const orderDate =
      rawText.match(/Order placed\s*([A-Za-z]+\s\d{1,2},\s\d{4})/i)?.[1] ??
      "";

    const grandTotalText =
      rawText.match(/Grand Total:\s*¥([\d,]+)/i)?.[1] ??
      rawText.match(/Total:\s*¥([\d,]+)/i)?.[1] ??
      "0";

    const shippingText =
      rawText.match(/Shipping\s*&\s*Handling:\s*¥([\d,]+)/i)?.[1] ?? "0";

    const totalPrice = Number(grandTotalText.replaceAll(",", ""));
    const shippingFee = Number(shippingText.replaceAll(",", ""));

    const itemName = extractItemName(rawText);
    const itemType = detectItemType(rawText);
    const seriesName = detectSeriesName(rawText);

    return {
      item_name: itemName,
      item_type: itemType,
      series_name: seriesName,
      order_number: orderNumber,
      order_date: orderDate,
      yen_price: totalPrice,
      shipping_fee: shippingFee,
      total_price: totalPrice,
      tracking_number: trackingNumber,
      image_url: imageUrl,
      quantity: extractQuantity(itemName),
      status: "입고전",
      memo,
    };
  }, [rawText, imageUrl, trackingNumber, memo]);

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>국내 재고 입력</h1>
          <p style={subTextStyle}>
            아마존 주문내역 텍스트, 이미지 URL, 운송장번호를 입력해 재고를 등록합니다.
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

      <div style={layoutStyle}>
        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>주문내역 입력</h2>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="아마존 Order Details 텍스트를 붙여넣기"
            style={rawTextareaStyle}
          />

          <div style={fieldGridStyle}>
            <label style={labelStyle}>
              이미지 URL
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              운송장번호
              <input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="운송장번호 직접 입력"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={labelStyle}>
            메모
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모"
              style={memoTextareaStyle}
            />
          </label>

          <button type="button" style={saveButtonStyle}>
            재고 저장
          </button>
        </section>

        <section style={previewPanelStyle}>
          <h2 style={panelTitleStyle}>미리보기</h2>

          {preview.image_url ? (
            <img src={preview.image_url} alt="" style={imageStyle} />
          ) : (
            <div style={emptyImageStyle}>이미지 미리보기</div>
          )}

          <div style={previewBodyStyle}>
            <div style={badgeRowStyle}>
              <span style={badgeStyle}>{preview.series_name}</span>
              <span style={badgeStyle}>{preview.item_type}</span>
              <span style={statusBadgeStyle}>{preview.status}</span>
            </div>

            <h3 style={itemNameStyle}>{preview.item_name || "상품명"}</h3>

            <div style={infoBoxStyle}>
              <InfoRow label="주문번호" value={preview.order_number} />
              <InfoRow label="주문일" value={preview.order_date} />
              <InfoRow label="작품명" value={preview.series_name} />
              <InfoRow label="아이템 타입" value={preview.item_type} />
              <InfoRow label="수량" value={String(preview.quantity)} />
              <InfoRow
                label="상품금액"
                value={`¥${preview.yen_price.toLocaleString()}`}
              />
              <InfoRow
                label="배송비"
                value={`¥${preview.shipping_fee.toLocaleString()}`}
              />
              <InfoRow
                label="총액"
                value={`¥${preview.total_price.toLocaleString()}`}
              />
              <InfoRow label="운송장" value={preview.tracking_number} />
            </div>

            <div style={memoBoxStyle}>{preview.memo || "메모 없음"}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRowStyle}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <strong style={{ textAlign: "right" }}>{value || "-"}</strong>
    </div>
  );
}

function extractItemName(rawText: string) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const ignoredWords = [
    "order details",
    "order placed",
    "order #",
    "invoice",
    "ship to",
    "payment method",
    "mastercard",
    "order summary",
    "item(s) subtotal",
    "shipping & handling",
    "grand total",
    "delivered",
    "your package was delivered",
    "sold by",
    "return or replace",
    "eligible through",
    "buy it again",
    "view your item",
    "track package",
    "share gift receipt",
    "write a product review",
    "amazon.co.jp",
  ];

  const englishTitle = lines.find((line) => {
    const lower = line.toLowerCase();

    if (!/[a-zA-Z]/.test(line)) return false;
    if (line.includes("¥")) return false;
    if (/^\d{3}-\d{7}-\d{7}$/.test(line)) return false;

    return !ignoredWords.some((word) => lower.includes(word));
  });

  if (englishTitle) return englishTitle;

  const japaneseTitle = lines.find((line) => {
    if (!/[ぁ-んァ-ン一-龥]/.test(line)) return false;
    if (line.includes("墨田区")) return false;
    if (line.includes("Tokyo-to")) return false;
    if (line.includes("Japan")) return false;
    if (line.includes("配送")) return false;
    if (line.includes("注文")) return false;
    if (line.includes("支払い")) return false;

    return true;
  });

  return japaneseTitle ?? "";
}

function extractQuantity(itemName: string) {
  const boxMatch =
    itemName.match(/box\s*of\s*(\d+)/i) ||
    itemName.match(/(\d+)\s*pcs/i) ||
    itemName.match(/(\d+)\s*pieces/i) ||
    itemName.match(/(\d+)\s*個入り/i) ||
    itemName.match(/(\d+)\s*点/i);

  if (!boxMatch) return 1;

  return Number(boxMatch[1]) || 1;
}

function detectItemType(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("acrylic") ||
    text.includes("アクリル") ||
    text.includes("아크릴")
  ) {
    return "아크릴";
  }

  if (
    lower.includes("can badge") ||
    lower.includes("badge") ||
    text.includes("缶バッジ") ||
    text.includes("缶バッチ") ||
    text.includes("バッジ") ||
    text.includes("뱃지") ||
    text.includes("배지")
  ) {
    return "뱃지";
  }

  if (
    lower.includes("figure") ||
    lower.includes("re-ment") ||
    lower.includes("rement") ||
    text.includes("フィギュア") ||
    text.includes("리멘트") ||
    text.includes("피규어")
  ) {
    return "피규어";
  }

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
  ) {
    return "키링";
  }

  if (
    lower.includes("photocard") ||
    lower.includes("photo card") ||
    lower.includes("postcard") ||
    lower.includes("post card") ||
    lower.includes("card") ||
    text.includes("フォトカード") ||
    text.includes("ポストカード") ||
    text.includes("カード") ||
    text.includes("브로마이드") ||
    text.includes("포토카드") ||
    text.includes("엽서") ||
    text.includes("카드")
  ) {
    return "지류";
  }

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
  ) {
    return "헌터헌터";
  }

  if (
    lower.includes("demon slayer") ||
    lower.includes("kimetsu") ||
    text.includes("鬼滅") ||
    text.includes("鬼滅の刃") ||
    text.includes("きめつ") ||
    text.includes("귀멸") ||
    text.includes("귀멸의 칼날")
  ) {
    return "귀멸의칼날";
  }

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
  ) {
    return "나의히어로아카데미아";
  }

  if (
    lower.includes("frieren") ||
    text.includes("葬送のフリーレン") ||
    text.includes("フリーレン") ||
    text.includes("프리렌") ||
    text.includes("장송의 프리렌")
  ) {
    return "프리렌";
  }

  if (
    lower.includes("attack on titan") ||
    lower.includes("shingeki") ||
    text.includes("進撃の巨人") ||
    text.includes("進撃") ||
    text.includes("진격의 거인") ||
    text.includes("진격거")
  ) {
    return "진격의거인";
  }

  return "기타";
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  background: "#f9fafb",
  minHeight: "100vh",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 20,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 800,
};

const subTextStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#6b7280",
  fontSize: 14,
};

const linkButtonStyle: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  fontSize: 14,
  fontWeight: 600,
};

const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 420px",
  gap: 20,
  alignItems: "start",
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 20,
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const previewPanelStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
  overflow: "hidden",
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
};

const rawTextareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 360,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
  lineHeight: 1.5,
  resize: "vertical",
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

const memoTextareaStyle: React.CSSProperties = {
  minHeight: 100,
  padding: 12,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  resize: "vertical",
};

const saveButtonStyle: React.CSSProperties = {
  height: 46,
  border: "none",
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const imageStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  background: "#f3f4f6",
};

const emptyImageStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  background: "#f3f4f6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#9ca3af",
  fontSize: 14,
};

const previewBodyStyle: React.CSSProperties = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const badgeStyle: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "#eef2ff",
  fontSize: 12,
  fontWeight: 800,
};

const statusBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: "#fee2e2",
};

const itemNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.45,
};

const infoBoxStyle: React.CSSProperties = {
  background: "#f9fafb",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 13,
};

const memoBoxStyle: React.CSSProperties = {
  minHeight: 44,
  background: "#fff7ed",
  borderRadius: 10,
  padding: 12,
  fontSize: 13,
  color: "#374151",
  whiteSpace: "pre-wrap",
};
