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

type InputMode = "manual" | "text" | "amazonHtml";

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

const initialManualForm = {
  item_name: "",
  item_type: "기타",
  series_name: "기타",
  order_number: "",
  order_date: "",
  total_price: 0,
  domestic_shipping_fee: 0,
  tracking_number: "",
  image_url: "",
  quantity: 1,
  status: "입고전" as InventoryStatus,
  memo: "",
};

export default function DomesticInventoryInputPage() {
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [rawText, setRawText] = useState("");
  const [amazonHtmlText, setAmazonHtmlText] = useState("");
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const parsedItems = useMemo(() => {
    if (inputMode === "amazonHtml") return parseAmazonHtml(amazonHtmlText);
    if (inputMode === "text") return parseInventoryText(rawText);
    return [];
  }, [inputMode, rawText, amazonHtmlText]);

  useEffect(() => {
    if (inputMode !== "manual") {
      setItems(parsedItems);
    }
  }, [parsedItems, inputMode]);

  const checkedCount = items.filter((item) => item.checked && !item.saved).length;

  const updateManualForm = (
    field: keyof typeof initialManualForm,
    value: string
  ) => {
    setManualForm((prev) => ({
      ...prev,
      [field]:
        field === "total_price" ||
        field === "domestic_shipping_fee" ||
        field === "quantity"
          ? Number(value)
          : value,
    }));
  };

  const addManualItem = () => {
    setSaveMessage("");

    if (!manualForm.item_name.trim()) {
      setSaveMessage("상품명을 입력해줘.");
      return;
    }

    const item: PreviewItem = {
      local_id: `manual-${Date.now()}`,
      checked: true,
      item_name: manualForm.item_name,
      item_type: manualForm.item_type,
      series_name: manualForm.series_name,
      order_number: manualForm.order_number,
      order_date: manualForm.order_date,
      yen_price: manualForm.total_price,
      shipping_fee: 0,
      domestic_shipping_fee: manualForm.domestic_shipping_fee,
      total_price: manualForm.total_price,
      tracking_number: manualForm.tracking_number,
      image_url: manualForm.image_url,
      quantity: manualForm.quantity,
      status: manualForm.status,
      memo: manualForm.memo,
      raw_text: "manual",
      saved: false,
    };

    setItems((prev) => [item, ...prev]);
    setManualForm(initialManualForm);
    setSaveMessage("직접 입력 항목이 추가됐어. 체크한 항목 저장을 눌러 DB에 저장하면 돼.");
  };

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

        const res = await fetch("/api/domestic-inventory/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });

        const result = await res.json();

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
            직접 입력 / 텍스트 붙여넣기 / Amazon HTML 업로드로 재고를 등록합니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkButtonStyle}>메인</Link>
          <Link href="/domestic-inventory-cards" style={linkButtonStyle}>카드형 보기</Link>
          <Link href="/domestic-inventory" style={linkButtonStyle}>인벤토리</Link>
        </div>
      </div>

      <section style={inputPanelStyle}>
        <div style={modeButtonRowStyle}>
          <button
            type="button"
            onClick={() => setInputMode("manual")}
            style={inputMode === "manual" ? activeModeButtonStyle : modeButtonStyle}
          >
            직접 입력하기
          </button>

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
            style={inputMode === "amazonHtml" ? activeModeButtonStyle : modeButtonStyle}
          >
            Amazon HTML 업로드
          </button>
        </div>

        {inputMode === "manual" ? (
          <>
            <h2 style={panelTitleStyle}>직접 입력하기</h2>

            <div style={manualGridStyle}>
              <ManualField label="상품명" value={manualForm.item_name} onChange={(v) => updateManualForm("item_name", v)} />
              <ManualSelect label="작품명" value={manualForm.series_name} options={seriesList} onChange={(v) => updateManualForm("series_name", v)} />
              <ManualSelect label="타입" value={manualForm.item_type} options={typeList} onChange={(v) => updateManualForm("item_type", v)} />
              <ManualSelect label="상태" value={manualForm.status} options={statusList} onChange={(v) => updateManualForm("status", v)} />
              <ManualField label="수량" type="number" value={String(manualForm.quantity)} onChange={(v) => updateManualForm("quantity", v)} />
              <ManualField label="총액(¥)" type="number" value={String(manualForm.total_price)} onChange={(v) => updateManualForm("total_price", v)} />
              <ManualField label="일본내배송비" type="number" value={String(manualForm.domestic_shipping_fee)} onChange={(v) => updateManualForm("domestic_shipping_fee", v)} />
              <ManualField label="주문번호" value={manualForm.order_number} onChange={(v) => updateManualForm("order_number", v)} />
              <ManualField label="주문일" value={manualForm.order_date} onChange={(v) => updateManualForm("order_date", v)} />
              <ManualField label="운송장" value={manualForm.tracking_number} onChange={(v) => updateManualForm("tracking_number", v)} />
              <ManualField label="이미지 URL" value={manualForm.image_url} onChange={(v) => updateManualForm("image_url", v)} />
              <ManualField label="메모" value={manualForm.memo} onChange={(v) => updateManualForm("memo", v)} />
            </div>

            <button type="button" onClick={addManualItem} style={saveButtonStyle}>
              입력 항목 추가
            </button>
          </>
        ) : inputMode === "text" ? (
          <>
            <h2 style={panelTitleStyle}>재고 입력 텍스트 붙여넣기</h2>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`=== ITEM ===
NAME:
SERIES:
TYPE:
PRICE:
QTY:
ORDER_NO:
ORDER_DATE:
DOMESTIC_SHIPPING:
TRACKING:
STATUS:
IMAGE:
MEMO:`}
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
            자동/입력 항목 <strong>{items.length}</strong>건 / 저장대상{" "}
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
          <div style={emptyStyle}>항목을 추가하거나 주문내역을 넣으면 카드가 생성됩니다.</div>
        ) : (
          items.map((item, index) => (
            <article key={item.local_id} style={compactCardStyle}>
              <div style={checkAreaStyle}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => updateItem(item.local_id, "checked", e.target.checked)}
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
                  <EditableSelect label="작품명" value={item.series_name} options={seriesList} onChange={(v) => updateItem(item.local_id, "series_name", v)} />
                  <EditableSelect label="타입" value={item.item_type} options={typeList} onChange={(v) => updateItem(item.local_id, "item_type", v)} />
                  <EditableSelect label="상태" value={item.status} options={statusList} onChange={(v) => updateItem(item.local_id, "status", v)} />
                  <EditableField label="수량" value={String(item.quantity)} type="number" onChange={(v) => updateItem(item.local_id, "quantity", v)} />
                </div>

                <div style={grid4Style}>
                  <EditableField label="주문일" value={item.order_date} onChange={(v) => updateItem(item.local_id, "order_date", v)} />
                  <EditableField label="주문번호" value={item.order_number} onChange={(v) => updateItem(item.local_id, "order_number", v)} />
                  <EditableField label="총액(¥)" value={String(item.total_price)} type="number" onChange={(v) => updateItem(item.local_id, "total_price", v)} />
                  <EditableField label="일본내배송비" value={String(item.domestic_shipping_fee)} type="number" onChange={(v) => updateItem(item.local_id, "domestic_shipping_fee", v)} />
                </div>

                <div style={grid3Style}>
                  <EditableField label="이미지 URL" value={item.image_url} onChange={(v) => updateItem(item.local_id, "image_url", v)} />
                  <EditableField label="운송장" value={item.tracking_number} onChange={(v) => updateItem(item.local_id, "tracking_number", v)} />
                  <EditableField label="메모" value={item.memo} onChange={(v) => updateItem(item.local_id, "memo", v)} />
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
  return [];
}

function parseInventoryText(rawText: string): PreviewItem[] {
  if (!rawText.trim()) return [];

  if (rawText.includes("=== ITEM ===")) {
    return parseFixedInventoryText(rawText);
  }

  return [];
}

function parseFixedInventoryText(rawText: string): PreviewItem[] {
  const hasOrderBlock = rawText.includes("=== ORDER ===");
  const orderBlock = hasOrderBlock ? rawText.split("=== ITEM ===")[0] : "";

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
  const regex = new RegExp(`^${key}:[ \\t]*(.*)$`, "im");
  return text.match(regex)?.[1]?.trim() ?? "";
}

function toNumber(value: string) {
  return Number(String(value).replace(/[¥,\s,]/g, "")) || 0;
}

function detectItemType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("acrylic") || text.includes("アクリル") || text.includes("아크릴")) return "아크릴";
  if (lower.includes("badge") || text.includes("缶バッジ") || text.includes("バッジ") || text.includes("뱃지") || text.includes("배지")) return "뱃지";
  if (lower.includes("figure") || lower.includes("re-ment") || lower.includes("rement") || text.includes("フィギュア") || text.includes("피규어")) return "피규어";
  if (lower.includes("keyring") || lower.includes("keychain") || lower.includes("key holder") || text.includes("キーホルダー") || text.includes("キーリング") || text.includes("키링")) return "키링";
  if (lower.includes("card") || lower.includes("postcard") || lower.includes("photocard") || text.includes("カード") || text.includes("ポストカード") || text.includes("포토카드") || text.includes("엽서")) return "지류";

  return "기타";
}

function detectSeriesName(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("hunter") || text.includes("HUNTER") || text.includes("ハンター") || text.includes("헌터헌터")) return "헌터헌터";
  if (lower.includes("demon slayer") || lower.includes("kimetsu") || text.includes("鬼滅") || text.includes("귀멸")) return "귀멸의칼날";
  if (lower.includes("my hero academia") || lower.includes("boku no hero") || lower.includes("mha") || text.includes("僕のヒーローアカデミア") || text.includes("ヒロアカ") || text.includes("히로아카")) return "나의히어로아카데미아";
  if (lower.includes("frieren") || text.includes("フリーレン") || text.includes("프리렌")) return "프리렌";
  if (lower.includes("attack on titan") || lower.includes("shingeki") || text.includes("進撃") || text.includes("진격")) return "진격의거인";

  return "기타";
}

function ManualField({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function ManualSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function EditableField({ label, value, onChange, type = "text", textarea = false }: {
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

function EditableSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((option) => <option key={option}>{option}</option>)}
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
const manualGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 };
const inputStyle: React.CSSProperties = { height: 34, padding: "0 9px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13, background: "#fff" };
const textareaStyle: React.CSSProperties = { minHeight: 48, padding: 9, borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13, resize: "vertical" };
const emptyStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 32, textAlign: "center", color: "#6b7280" };
