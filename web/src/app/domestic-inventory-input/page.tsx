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

type InputMode = "text" | "html";

const statusList: InventoryStatus[] = [
  "입고전",
  "해외배송",
  "입고완료",
  "판매중",
  "판매완료",
  "보류",
];

const typeList = [
  "아크릴",
  "지류",
  "뱃지",
  "피규어",
  "키링",
  "기타",
];

const seriesList = [
  "헌터헌터",
  "귀멸의칼날",
  "나의히어로아카데미아",
  "프리렌",
  "진격의거인",
  "기타",
];

export default function DomesticInventoryInputPage() {
  const [inputMode, setInputMode] =
    useState<InputMode>("text");

  const [rawText, setRawText] = useState("");

  const [htmlText, setHtmlText] = useState("");

  const [items, setItems] = useState<PreviewItem[]>([]);

  const [saveMessage, setSaveMessage] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const parsedItems = useMemo(() => {
    if (inputMode === "html") {
      return parseAmazonHtml(htmlText);
    }

    return parseAmazonOrders(rawText);
  }, [inputMode, rawText, htmlText]);

  useEffect(() => {
    setItems(parsedItems);
  }, [parsedItems]);

  const checkedCount = items.filter(
    (item) => item.checked && !item.saved
  ).length;

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
          return {
            ...item,
            [field]: Number(value),
            saved: false,
          };
        }

        return {
          ...item,
          [field]: value,
          saved: false,
        };
      })
    );
  };

  const toggleAll = (checked: boolean) => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        checked,
      }))
    );
  };

  const handleHtmlFile = async (file?: File) => {
    if (!file) return;

    const text = await file.text();

    setInputMode("html");
    setHtmlText(text);
  };

  const saveSelected = async () => {
    setSaveMessage("");

    setIsSaving(true);

    const targets = items.filter(
      (item) => item.checked && !item.saved
    );

    let successCount = 0;

    for (const item of targets) {
      if (!item.item_name.trim()) {
        setSaveMessage(
          "상품명이 없는 항목이 있어 저장을 중단했어."
        );
        break;
      }

      const res = await fetch(
        "/api/domestic-inventory/items",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(item),
        }
      );

      const result = await res.json();

      if (!res.ok || !result.ok) {
        setSaveMessage(
          result.message || "저장 실패"
        );
        break;
      }

      successCount += 1;

      setItems((prev) =>
        prev.map((prevItem) =>
          prevItem.local_id === item.local_id
            ? {
                ...prevItem,
                saved: true,
                checked: false,
              }
            : prevItem
        )
      );
    }

    setIsSaving(false);

    setSaveMessage(`${successCount}건 저장 완료`);
  };

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>
            국내 재고 입력
          </h1>

          <p style={subTextStyle}>
            모바일은 텍스트 붙여넣기,
            PC는 HTML 업로드를 사용할 수 있어.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/"
            style={linkButtonStyle}
          >
            메인
          </Link>

          <Link
            href="/domestic-inventory-cards"
            style={linkButtonStyle}
          >
            카드형 보기
          </Link>

          <Link
            href="/domestic-inventory"
            style={linkButtonStyle}
          >
            인벤토리
          </Link>
        </div>
      </div>

      <section style={inputPanelStyle}>
        <div style={modeButtonRowStyle}>
          <button
            type="button"
            onClick={() =>
              setInputMode("text")
            }
            style={
              inputMode === "text"
                ? activeModeButtonStyle
                : modeButtonStyle
            }
          >
            텍스트 붙여넣기
          </button>

          <button
            type="button"
            onClick={() =>
              setInputMode("html")
            }
            style={
              inputMode === "html"
                ? activeModeButtonStyle
                : modeButtonStyle
            }
          >
            HTML 업로드
          </button>
        </div>

        {inputMode === "text" ? (
          <>
            <h2 style={panelTitleStyle}>
              주문내역 텍스트 붙여넣기
            </h2>

            <textarea
              value={rawText}
              onChange={(e) =>
                setRawText(e.target.value)
              }
              placeholder="주문내역 텍스트 여러 건 붙여넣기"
              style={rawTextareaStyle}
            />
          </>
        ) : (
          <>
            <h2 style={panelTitleStyle}>
              아마존 주문 HTML 업로드
            </h2>

            <input
              type="file"
              accept=".html,.htm,text/html"
              onChange={(e) =>
                handleHtmlFile(
                  e.target.files?.[0]
                )
              }
              style={fileInputStyle}
            />

            <textarea
              value={htmlText}
              onChange={(e) =>
                setHtmlText(e.target.value)
              }
              placeholder="또는 HTML 직접 붙여넣기"
              style={rawTextareaStyle}
            />
          </>
        )}

        <div style={controlBarStyle}>
          <div style={summaryBoxStyle}>
            자동 인식{" "}
            <strong>{items.length}</strong>건 /
            저장대상{" "}
            <strong>{checkedCount}</strong>건
          </div>

          <button
            type="button"
            onClick={() =>
              toggleAll(true)
            }
            style={smallButtonStyle}
          >
            전체선택
          </button>

          <button
            type="button"
            onClick={() =>
              toggleAll(false)
            }
            style={smallButtonStyle}
          >
            전체해제
          </button>

          <button
            type="button"
            onClick={saveSelected}
            disabled={
              isSaving || checkedCount === 0
            }
            style={{
              ...saveButtonStyle,
              opacity:
                isSaving || checkedCount === 0
                  ? 0.6
                  : 1,
              cursor:
                isSaving || checkedCount === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isSaving
              ? "저장 중..."
              : `체크한 항목 저장 (${checkedCount}건)`}
          </button>
        </div>

        {saveMessage ? (
          <div style={messageStyle}>
            {saveMessage}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function parseAmazonHtml(htmlText: string): PreviewItem[] {
  return [];
}

function parseAmazonOrders(
  rawText: string
): PreviewItem[] {
  return [];
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

const inputPanelStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 18,
  background: "#fff",
  marginBottom: 18,
};

const modeButtonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 16,
};

const modeButtonStyle: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const activeModeButtonStyle: React.CSSProperties =
  {
    ...modeButtonStyle,
    background: "#111827",
    color: "#fff",
    border: "1px solid #111827",
  };

const panelTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 18,
  fontWeight: 800,
};

const rawTextareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 180,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
  lineHeight: 1.5,
  resize: "vertical",
};

const fileInputStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 12,
};

const controlBarStyle: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const summaryBoxStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "#f3f4f6",
  fontSize: 14,
};

const smallButtonStyle: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const saveButtonStyle: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  border: "none",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
};

const messageStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "#f3f4f6",
  fontSize: 14,
  fontWeight: 700,
};
