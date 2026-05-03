"use client";

import { useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

type Platform = "wise" | "x" | "bunjang";

type DomesticRow = {
  selected: boolean;
  disabled?: boolean;
  reason?: string;
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
};

const PLATFORM_TABS: { value: Platform; label: string }[] = [
  { value: "wise", label: "Wise" },
  { value: "x", label: "X" },
  { value: "bunjang", label: "번개장터" },
];

const HEADERS = [
  "받는분성명",
  "받는분우편번호",
  "받는분전화번호",
  "받는분주소(전체, 분할)",
  "고객주문번호",
  "품목명",
  "내품명",
  "박스수량",
  "박스타입",
  "기본운임",
  "주문건수",
  "최초주문일",
  "아이템",
  "상품금액합계",
];

function withApostrophe(value: string) {
  const clean = String(value ?? "").trim().replace(/^'+/, "");
  if (!clean) return "";
  return `'${clean}`;
}

function toExcelRow(row: DomesticRow) {
  return {
    받는분성명: row.recipientName,
    받는분우편번호: row.postalCode,
    받는분전화번호: row.phone,
    "받는분주소(전체, 분할)": row.address,
    고객주문번호: row.customerOrderNo,
    품목명: row.itemName,
    내품명: row.contentName,
    박스수량: row.boxCount,
    박스타입: row.boxType,
    기본운임: row.baseFee,
    주문건수: row.orderCount,
    최초주문일: row.firstOrderDate,
    아이템: row.itemSummary,
    상품금액합계: row.itemTotalPrice,
  };
}

export default function DomesticUploadPage() {
  const [platform, setPlatform] = useState<Platform>("wise");
  const [inputText, setInputText] = useState("");
  const [fresh, setFresh] = useState<DomesticRow[]>([]);
  const [duplicated, setDuplicated] = useState<DomesticRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCount = useMemo(
    () => fresh.filter((row) => row.selected).length,
    [fresh]
  );

  async function preview() {
    setLoading(true);
    setMessage("");
    setFresh([]);
    setDuplicated([]);

    try {
      const form = new FormData();
      form.append("platform", platform);
      form.append("text", inputText);

      const res = await fetch("/api/domestic/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "미리보기 실패");
        return;
      }

      setFresh(json.fresh || []);
      setDuplicated(json.duplicated || []);
      setMessage(
        `미리보기 완료: 신규 ${json.fresh_count || 0}건 / 중복 ${
          json.duplicated_count || 0
        }건`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  async function saveDb() {
    if (!selectedCount) {
      alert("DB 저장할 행을 선택해줘.");
      return;
    }

    const ok = confirm(`선택 ${selectedCount}건을 국내 DB에 저장할까?`);
    if (!ok) return;

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/domestic/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: fresh.filter((row) => row.selected),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "DB 저장 실패");
        return;
      }

      setMessage(
        `DB 저장 완료: ${json.saved || 0}건 / 중복 제외 ${
          json.skipped_count || 0
        }건`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setSaving(false);
    }
  }

  function exportExcel() {
    const selectedRows = fresh.filter((row) => row.selected);

    if (!selectedRows.length) {
      alert("엑셀로 추출할 행을 선택해줘.");
      return;
    }

    const data = selectedRows.map(toExcelRow);
    const worksheet = XLSX.utils.json_to_sheet(data, { header: HEADERS });

    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 48 },
      { wch: 18 },
      { wch: 14 },
      { wch: 28 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 20 },
      { wch: 80 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "국내배송");

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(now.getDate()).padStart(2, "0")}_${String(
      now.getHours()
    ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    XLSX.writeFile(workbook, `domestic_shipping_${stamp}.xlsx`);
  }

  function updateRow(index: number, patch: Partial<DomesticRow>) {
    setFresh((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    );
  }

  function toggleAll(checked: boolean) {
    setFresh((prev) => prev.map((row) => ({ ...row, selected: checked })));
  }

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Domestic Upload</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Wise / X / 번개장터 배송정보를 붙여넣고, 엑셀 추출 또는 DB 저장합니다.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setPlatform(tab.value);
                setFresh([]);
                setDuplicated([]);
                setMessage("");
              }}
              style={tabStyle(platform === tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={labelStyle}>배송정보 붙여넣기</label>
          <textarea
            value={inputText}
            onChange={(event) => {
              setInputText(event.target.value);
              setFresh([]);
              setDuplicated([]);
              setMessage("");
            }}
            placeholder={`배송 정보
정영인(누리너울)
[18491] 경기 화성시 동탄구 동탄신리천로3길 71, 3719동 106호
연락처
0507-0268-0040(안심번호)
배송비
배송비 결제 완료(합배송)`}
            style={textareaStyle}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={preview} disabled={loading} style={primaryButtonStyle}>
            {loading ? "검토 중..." : "미리보기"}
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!selectedCount}
            style={{
              ...darkButtonStyle,
              background: selectedCount ? "#111827" : "#9ca3af",
              cursor: selectedCount ? "pointer" : "not-allowed",
            }}
          >
            선택 {selectedCount}건 엑셀 추출
          </button>
          <button
            type="button"
            onClick={saveDb}
            disabled={!selectedCount || saving}
            style={{
              ...darkButtonStyle,
              background: selectedCount && !saving ? "#7c3aed" : "#9ca3af",
              cursor: selectedCount && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "DB 저장 중..." : `선택 ${selectedCount}건 DB 저장`}
          </button>
        </div>

        {message ? <p style={{ marginBottom: 0 }}>{message}</p> : null}
      </section>

      {fresh.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <div style={resultHeaderStyle}>
            <h2 style={{ margin: 0 }}>업로드 대상</h2>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
              <input
                type="checkbox"
                checked={fresh.length > 0 && selectedCount === fresh.length}
                onChange={(event) => toggleAll(event.target.checked)}
              />
              전체 선택
            </label>
          </div>

          <PreviewTable rows={fresh} updateRow={updateRow} />
        </section>
      ) : null}

      {duplicated.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>중복 주문</h2>
          <PreviewTable rows={duplicated} disabled />
        </section>
      ) : null}
    </main>
  );
}

function PreviewTable({
  rows,
  updateRow,
  disabled,
}: {
  rows: DomesticRow[];
  updateRow?: (index: number, patch: Partial<DomesticRow>) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 1600, borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f9fafb" }}>
            <th style={thStyle}>선택</th>
            {HEADERS.map((header) => (
              <th key={header} style={thStyle}>{header}</th>
            ))}
            {disabled ? <th style={thStyle}>사유</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.customerOrderNo}-${index}`}>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={row.selected}
                  disabled={disabled}
                  onChange={(event) => updateRow?.(index, { selected: event.target.checked })}
                />
              </td>
              <EditableCell value={row.recipientName} disabled={disabled} onChange={(v) => updateRow?.(index, { recipientName: v })} />
              <EditableCell value={row.postalCode} disabled={disabled} onChange={(v) => updateRow?.(index, { postalCode: withApostrophe(v) })} />
              <EditableCell value={row.phone} disabled={disabled} onChange={(v) => updateRow?.(index, { phone: withApostrophe(v) })} />
              <EditableCell value={row.address} disabled={disabled} wide onChange={(v) => updateRow?.(index, { address: v })} />
              <EditableCell value={row.customerOrderNo} disabled={disabled} onChange={(v) => updateRow?.(index, { customerOrderNo: v })} />
              <EditableCell value={row.itemName} disabled={disabled} onChange={(v) => updateRow?.(index, { itemName: v })} />
              <EditableCell value={row.contentName} disabled={disabled} wide onChange={(v) => updateRow?.(index, { contentName: v })} />
              <EditableCell value={row.boxCount} disabled={disabled} onChange={(v) => updateRow?.(index, { boxCount: v })} />
              <EditableCell value={row.boxType} disabled={disabled} onChange={(v) => updateRow?.(index, { boxType: v })} />
              <EditableCell value={row.baseFee} disabled={disabled} onChange={(v) => updateRow?.(index, { baseFee: v })} />
              <EditableCell value={row.orderCount} disabled={disabled} onChange={(v) => updateRow?.(index, { orderCount: v })} />
              <EditableCell value={row.firstOrderDate} disabled={disabled} onChange={(v) => updateRow?.(index, { firstOrderDate: v })} />
              <EditableCell value={row.itemSummary} disabled={disabled} extraWide onChange={(v) => updateRow?.(index, { itemSummary: v })} />
              <EditableCell value={row.itemTotalPrice} disabled={disabled} onChange={(v) => updateRow?.(index, { itemTotalPrice: v })} />
              {disabled ? <td style={tdStyle}>{row.reason || "중복"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditableCell({
  value,
  onChange,
  wide,
  extraWide,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
  extraWide?: boolean;
  disabled?: boolean;
}) {
  return (
    <td style={tdStyle}>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: extraWide ? 520 : wide ? 360 : 160,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "6px 8px",
          fontSize: 13,
          background: disabled ? "#f3f4f6" : "#fff",
        }}
      />
    </td>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  background: "#fff",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontWeight: 800,
  marginBottom: 8,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 260,
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
  lineHeight: 1.5,
};

const primaryButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const darkButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontWeight: 800,
};

const resultHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

function tabStyle(active: boolean): CSSProperties {
  return {
    border: "1px solid " + (active ? "#2563eb" : "#d1d5db"),
    borderRadius: 999,
    padding: "9px 14px",
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#1d4ed8" : "#374151",
    fontWeight: 800,
    cursor: "pointer",
  };
}

const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 8px",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "10px 8px",
  verticalAlign: "top",
};
