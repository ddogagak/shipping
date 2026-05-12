"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InventoryStatus =
  | "입고전"
  | "입고완료"
  | "판매중"
  | "판매완료"
  | "보류";

type PreviewItem = {
  item_name: string;
  item_type: string;
  series_name: string;
  order_number: string;
  order_date: string;
  yen_price: number;
  shipping_fee: number;
  total_price: number;
  selling_price: number;
  tracking_number: string;
  image_url: string;
  quantity: number;
  status: InventoryStatus;
  memo: string;
};

const statusList: InventoryStatus[] = [
  "입고전",
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
  const [rawText, setRawText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [memo, setMemo] = useState("");

  const [editableItem, setEditableItem] = useState<PreviewItem>({
    item_name: "",
    item_type: "기타",
    series_name: "기타",
    order_number: "",
    order_date: "",
    yen_price: 0,
    shipping_fee: 0,
    total_price: 0,
    selling_price: 0,
    tracking_number: "",
    image_url: "",
    quantity: 1,
    status: "입고전",
    memo: "",
  });

  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const parsedPreview = useMemo<PreviewItem>(() => {
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

    return {
      item_name: itemName,
      item_type: detectItemType(rawText),
      series_name: detectSeriesName(rawText),
      order_number: orderNumber,
      order_date: orderDate,
      yen_price: totalPrice,
      shipping_fee: shippingFee,
      total_price: totalPrice,
      selling_price: 0,
      tracking_number: trackingNumber,
      image_url: imageUrl,
      quantity: extractQuantity(itemName),
      status: "입고전",
      memo,
    };
  }, [rawText, imageUrl, trackingNumber, memo]);

  useEffect(() => {
    setEditableItem(parsedPreview);
  }, [parsedPreview]);

  const updateEditableItem = (
    field: keyof PreviewItem,
    value: string
  ) => {
    setEditableItem((prev) => {
      if (
        field === "quantity" ||
        field === "yen_price" ||
        field === "shipping_fee" ||
        field === "total_price" ||
        field === "selling_price"
      ) {
        return {
          ...prev,
          [field]: Number(value),
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const saveInventoryItem = async () => {
    setSaveMessage("");

    if (!editableItem.item_name.trim()) {
      setSaveMessage("상품명을 입력해줘.");
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/domestic-inventory/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...editableItem,
          raw_text: rawText,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.message || "저장 실패");
      }

      setSaveMessage("저장 완료!");
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "저장 실패"
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
            주문내역을 붙여넣고, 미리보기에서 필요한 값을 수정한 뒤 저장합니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkButtonStyle}>메인</Link>
          <Link href="/domestic-inventory-cards" style={linkButtonStyle}>카드형 보기</Link>
          <Link href="/domestic-inventory" style={linkButtonStyle}>인벤토리</Link>
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

          <button
            type="button"
            onClick={saveInventoryItem}
            disabled={isSaving}
            style={{
              ...saveButtonStyle,
              opacity: isSaving ? 0.6 : 1,
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "저장 중..." : "재고 저장"}
          </button>

          {saveMessage ? (
            <div style={messageStyle}>{saveMessage}</div>
          ) : null}
        </section>

        <section style={previewPanelStyle}>
          <h2 style={{ ...panelTitleStyle, padding: 16, paddingBottom: 0 }}>
            수정 가능한 미리보기
          </h2>

          {editableItem.image_url ? (
            <img src={editableItem.image_url} alt="" style={imageStyle} />
          ) : (
            <div style={emptyImageStyle}>이미지 미리보기</div>
          )}

          <div style={previewBodyStyle}>
            <div style={badgeRowStyle}>
              <span style={badgeStyle}>{editableItem.series_name}</span>
              <span style={badgeStyle}>{editableItem.item_type}</span>
              <span style={statusBadgeStyle}>{editableItem.status}</span>
            </div>

            <EditableField
              label="상품명"
              value={editableItem.item_name}
              onChange={(value) => updateEditableItem("item_name", value)}
              textarea
            />

            <div style={twoColStyle}>
              <EditableSelect
                label="작품명"
                value={editableItem.series_name}
                options={seriesList}
                onChange={(value) => updateEditableItem("series_name", value)}
              />

              <EditableSelect
                label="아이템 타입"
                value={editableItem.item_type}
                options={typeList}
                onChange={(value) => updateEditableItem("item_type", value)}
              />
            </div>

            <div style={twoColStyle}>
              <EditableField
                label="주문번호"
                value={editableItem.order_number}
                onChange={(value) => updateEditableItem("order_number", value)}
              />

              <EditableField
                label="주문일"
                value={editableItem.order_date}
                onChange={(value) => updateEditableItem("order_date", value)}
              />
            </div>

            <div style={twoColStyle}>
              <EditableField
                label="수량"
                value={String(editableItem.quantity)}
                onChange={(value) => updateEditableItem("quantity", value)}
                type="number"
              />

              <EditableSelect
                label="상태"
                value={editableItem.status}
                options={statusList}
                onChange={(value) => updateEditableItem("status", value)}
              />
            </div>

            <div style={twoColStyle}>
              <EditableField
                label="상품금액"
                value={String(editableItem.yen_price)}
                onChange={(value) => updateEditableItem("yen_price", value)}
                type="number"
              />

              <EditableField
                label="배송비"
                value={String(editableItem.shipping_fee)}
                onChange={(value) => updateEditableItem("shipping_fee", value)}
                type="number"
              />
            </div>

            <div style={twoColStyle}>
              <EditableField
                label="총액"
                value={String(editableItem.total_price)}
                onChange={(value) => updateEditableItem("total_price", value)}
                type="number"
              />

              <EditableField
                label="판매가"
                value={String(editableItem.selling_price)}
                onChange={(value) => updateEditableItem("selling_price", value)}
                type="number"
              />
            </div>

            <EditableField
              label="운송장"
              value={editableItem.tracking_number}
              onChange={(value) => updateEditableItem("tracking_number", value)}
            />

            <EditableField
              label="이미지 URL"
              value={editableItem.image_url}
              onChange={(value) => updateEditableItem("image_url", value)}
              textarea
            />

            <EditableField
              label="메모"
              value={editableItem.memo}
              onChange={(value) => updateEditableItem("memo", value)}
              textarea
            />
          </div>
        </section>
      </div>
    </main>
  );
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
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={smallTextareaStyle}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
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

  return "";
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

  if (lower.includes("acrylic") || text.includes("アクリル") || text.includes("아크릴")) return "아크릴";
  if (lower.includes("can badge") || lower.includes("badge") || text.includes("缶バッジ") || text.includes("缶バッチ") || text.includes("バッジ") || text.includes("뱃지") || text.includes("배지")) return "뱃지";
  if (lower.includes("figure") || lower.includes("re-ment") || lower.includes("rement") || text.includes("フィギュア") || text.includes("리멘트") || text.includes("피규어")) return "피규어";
  if (lower.includes("keyring") || lower.includes("key ring") || lower.includes("keychain") || lower.includes("key chain") || lower.includes("key holder") || text.includes("キーホルダー") || text.includes("キーリング") || text.includes("키링") || text.includes("키홀더")) return "키링";
  if (lower.includes("photocard") || lower.includes("photo card") || lower.includes("postcard") || lower.includes("post card") || lower.includes("card") || text.includes("フォトカード") || text.includes("ポストカード") || text.includes("カード") || text.includes("브로마이드") || text.includes("포토카드") || text.includes("엽서") || text.includes("카드")) return "지류";

  return "기타";
}

function detectSeriesName(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("hunter x hunter") || lower.includes("hunter×hunter") || lower.includes("hxh") || text.includes("HUNTER×HUNTER") || text.includes("ハンター×ハンター") || text.includes("ハンターハンター") || text.includes("헌터헌터")) return "헌터헌터";
  if (lower.includes("demon slayer") || lower.includes("kimetsu") || text.includes("鬼滅") || text.includes("鬼滅の刃") || text.includes("きめつ") || text.includes("귀멸") || text.includes("귀멸의 칼날")) return "귀멸의칼날";
  if (lower.includes("my hero academia") || lower.includes("hero academia") || lower.includes("boku no hero") || lower.includes("bnha") || lower.includes("mha") || text.includes("僕のヒーローアカデミア") || text.includes("ヒロアカ") || text.includes("나의 히어로 아카데미ア") || text.includes("나의 히어로 아카데미아") || text.includes("히로아카")) return "나의히어로아카데미아";
  if (lower.includes("frieren") || text.includes("葬送のフリーレン") || text.includes("フリーレン") || text.includes("프리렌") || text.includes("장송의 프리렌")) return "프리렌";
  if (lower.includes("attack on titan") || lower.includes("shingeki") || text.includes("進撃の巨人") || text.includes("進撃") || text.includes("진격의 거인") || text.includes("진격거")) return "진격의거인";

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
  gridTemplateColumns: "1fr 480px",
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

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
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
  background: "#fff",
};

const smallTextareaStyle: React.CSSProperties = {
  minHeight: 72,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  resize: "vertical",
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
};

const messageStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "#f3f4f6",
  fontSize: 14,
  fontWeight: 700,
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
