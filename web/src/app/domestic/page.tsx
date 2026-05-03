"use client";

import { useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

type Platform = "wise" | "x" | "bunjang";

type DomesticRow = {
  selected: boolean;
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
  itemSummary: string;
  itemTotalPrice: string;
};

const PLATFORM_TABS: { value: Platform; label: string; prefix: string }[] = [
  { value: "wise", label: "Wise", prefix: "W" },
  { value: "x", label: "X", prefix: "X" },
  { value: "bunjang", label: "번개장터", prefix: "B" },
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
  "아이템",
  "상품금액합계",
];

function platformPrefix(platform: Platform) {
  return PLATFORM_TABS.find((tab) => tab.value === platform)?.prefix || "W";
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function withApostrophe(value: string) {
  const clean = safeText(value).replace(/^'+/, "");
  if (!clean) return "";
  return `'${clean}`;
}

function parseNameAndNickname(line: string) {
  const text = safeText(line);
  const match = text.match(/^(.+?)\((.+?)\)$/);

  if (!match) {
    return {
      recipientName: text,
      nickname: text,
    };
  }

  return {
    recipientName: safeText(match[1]),
    nickname: safeText(match[2]),
  };
}

function splitOrderBlocks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  if (!normalized) return [];

  const datePattern = /\d{4}\.\s*\d{2}\.\s*\d{2}\s*\/\s*\d{2}:\d{2}/g;
  const matches = [...normalized.matchAll(datePattern)];

  if (!matches.length) {
    return [normalized];
  }

  return matches
    .map((match, index) => {
      const start = match.index || 0;
      const end =
        index + 1 < matches.length ? matches[index + 1].index || normalized.length : normalized.length;

      return normalized.slice(start, end).trim();
    })
    .filter(Boolean);
}

function parsePrice(value: string) {
  return Number(value.replace(/[^0-9]/g, "")) || 0;
}

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function parseItems(block: string) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items: string[] = [];
  let total = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line.startsWith("#")) continue;

    const itemName = line;
    const priceLine = lines[i + 1] || "";
    const price = parsePrice(priceLine);

    items.push(itemName);

    if (price) {
      total += price;
    }
  }

  return {
    itemSummary: items.join(" / "),
    itemTotalPrice: total ? formatWon(total) : "",
  };
}

function groupBlocksByRecipient(blocks: string[], platform: Platform): DomesticRow[] {
  const prefix = platformPrefix(platform);
  const map = new Map<string, DomesticRow>();

  blocks.forEach((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const shippingInfoIndex = lines.findIndex((line) => line.includes("배송 정보"));
    const nameLine = shippingInfoIndex >= 0 ? lines[shippingInfoIndex + 1] || "" : "";

    const addressLine =
      lines.find((line) => /^\[\d{5}\]/.test(line)) ||
      lines.find((line) => /\d{5}/.test(line) && /시|도|구|군|로|길/.test(line)) ||
      "";

    const addressMatch = addressLine.match(/^\[(\d{5})\]\s*(.+)$/);
    const postalCode = addressMatch ? addressMatch[1] : "";
    const address = addressMatch ? addressMatch[2] : addressLine;

    const phoneLabelIndex = lines.findIndex((line) => line.includes("연락처"));
    const phoneLine = phoneLabelIndex >= 0 ? lines[phoneLabelIndex + 1] || "" : "";
    const phone = phoneLine.replace(/\(.*?\)/g, "").trim();

    const { recipientName, nickname } = parseNameAndNickname(nameLine);
    const { itemSummary, itemTotalPrice } = parseItems(block);

    const key = `${recipientName}|${nickname}|${postalCode}|${phone}|${address}`;

    const existing = map.get(key);

    if (existing) {
      const nextOrderCount = Number(existing.orderCount || 0) + 1;
      const nextTotal =
        parsePrice(existing.itemTotalPrice) + parsePrice(itemTotalPrice);

      existing.orderCount = String(nextOrderCount);
      existing.itemSummary = [existing.itemSummary, itemSummary].filter(Boolean).join(" / ");
      existing.itemTotalPrice = nextTotal ? formatWon(nextTotal) : "";
      return;
    }

    map.set(key, {
      selected: true,
      platform,
      recipientName,
      nickname,
      postalCode: withApostrophe(postalCode),
      phone: withApostrophe(phone),
      address,
      customerOrderNo: `${prefix}${nickname}`,
      itemName: "피규어",
      contentName: `도파민베이커리-${nickname}`,
      boxCount: "1",
      boxType: "1",
      baseFee: "",
      orderCount: "1",
      itemSummary,
      itemTotalPrice,
    });
  });

  return Array.from(map.values());
}

function parseDomesticText(text: string, platform: Platform): DomesticRow[] {
  const blocks = splitOrderBlocks(text);
  return groupBlocksByRecipient(blocks, platform);
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
    아이템: row.itemSummary,
    상품금액합계: row.itemTotalPrice,
  };
}

export default function DomesticPage() {
  const [platform, setPlatform] = useState<Platform>("wise");
  const [inputText, setInputText] = useState("");
  const [rows, setRows] = useState<DomesticRow[]>([]);

  const selectedCount = useMemo(
    () => rows.filter((row) => row.selected).length,
    [rows]
  );

  function preview() {
    const parsed = parseDomesticText(inputText, platform);
    setRows(parsed);
  }

  function updateRow(index: number, patch: Partial<DomesticRow>) {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    );
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((row) => ({ ...row, selected: checked })));
  }

  function exportExcel() {
    const selectedRows = rows.filter((row) => row.selected);

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

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Domestic Upload</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Wise / X / 번개장터 배송정보를 붙여넣고, 택배 엑셀 양식으로
          추출합니다.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setPlatform(tab.value);
                setRows([]);
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
              setRows([]);
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

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={preview} style={primaryButtonStyle}>
            미리보기
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
        </div>
      </section>

      {rows.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0 }}>미리보기</h2>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={rows.length > 0 && selectedCount === rows.length}
                onChange={(event) => toggleAll(event.target.checked)}
              />
              전체 선택
            </label>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 1500,
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thStyle}>선택</th>
                  {HEADERS.map((header) => (
                    <th key={header} style={thStyle}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) =>
                          updateRow(index, { selected: event.target.checked })
                        }
                      />
                    </td>

                    <EditableCell value={row.recipientName} onChange={(value) => updateRow(index, { recipientName: value })} />
                    <EditableCell value={row.postalCode} onChange={(value) => updateRow(index, { postalCode: withApostrophe(value) })} />
                    <EditableCell value={row.phone} onChange={(value) => updateRow(index, { phone: withApostrophe(value) })} />
                    <EditableCell value={row.address} onChange={(value) => updateRow(index, { address: value })} wide />
                    <EditableCell value={row.customerOrderNo} onChange={(value) => updateRow(index, { customerOrderNo: value })} />
                    <EditableCell value={row.itemName} onChange={(value) => updateRow(index, { itemName: value })} />
                    <EditableCell value={row.contentName} onChange={(value) => updateRow(index, { contentName: value })} wide />
                    <EditableCell value={row.boxCount} onChange={(value) => updateRow(index, { boxCount: value })} />
                    <EditableCell value={row.boxType} onChange={(value) => updateRow(index, { boxType: value })} />
                    <EditableCell value={row.baseFee} onChange={(value) => updateRow(index, { baseFee: value })} />
                    <EditableCell value={row.orderCount} onChange={(value) => updateRow(index, { orderCount: value })} />
                    <EditableCell value={row.itemSummary} onChange={(value) => updateRow(index, { itemSummary: value })} extraWide />
                    <EditableCell value={row.itemTotalPrice} onChange={(value) => updateRow(index, { itemTotalPrice: value })} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function EditableCell({
  value,
  onChange,
  wide,
  extraWide,
}: {
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
  extraWide?: boolean;
}) {
  return (
    <td style={tdStyle}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: extraWide ? 520 : wide ? 360 : 160,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "6px 8px",
          fontSize: 13,
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
