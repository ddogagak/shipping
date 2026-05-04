"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

type DomesticOrder = {
  order_id: string;
  platform: string;
  source_order_dates: string[] | null;
  first_order_date: string | null;
  nickname: string | null;
  recipient_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  order_count: number | null;
  item_total_price: number | null;
  item_summary: string | null;
  order_status: string | null;
  created_at: string | null;
  domestic_shipping:
    | {
        carrier: string | null;
        shipping_type: string | null;
        tracking_number: string | null;
        shipping_status: string | null;
        excel_exported_at: string | null;
      }
    | {
        carrier: string | null;
        shipping_type: string | null;
        tracking_number: string | null;
        shipping_status: string | null;
        excel_exported_at: string | null;
      }[]
    | null;
};

type Row = DomesticOrder & { selected: boolean };

type SortKey =
  | "platform"
  | "order_id"
  | "nickname"
  | "order_count"
  | "first_order_date"
  | "item_summary"
  | "item_total_price"
  | "order_status"
  | "shipping_status"
  | "shipping_type"
  | "tracking_number";

type SortDirection = "asc" | "desc";

const PLATFORM_OPTIONS = [
  { value: "wise", label: "Wise" },
  { value: "x", label: "X" },
  { value: "bunjang", label: "번개장터" },
];

const ORDER_STATUS_OPTIONS = [
  { value: "accepted", label: "입력됨" },
  { value: "checked", label: "재고확인" },
  { value: "done", label: "완료" },
];

const SHIPPING_STATUS_OPTIONS = [
  { value: "start", label: "시작" },
  { value: "excel_exported", label: "엑셀 추출" },
  { value: "uploaded", label: "운송장 입력" },
  { value: "done", label: "배송완료" },
];

const SHIPPING_TYPE_OPTIONS = [
  { value: "일반택배", label: "일반택배" },
  { value: "GS반값택배", label: "GS반값택배" },
  { value: "준등기", label: "준등기" },
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

function shipping(row: DomesticOrder) {
  if (Array.isArray(row.domestic_shipping)) return row.domestic_shipping[0] || null;
  return row.domestic_shipping || null;
}

function label(options: { value: string; label: string }[], value?: string | null) {
  return options.find((option) => option.value === value)?.label || value || "-";
}

function formatWon(value?: number | null) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function withApostrophe(value?: string | null) {
  const clean = String(value ?? "").trim().replace(/^'+/, "");
  if (!clean) return "";
  return `'${clean}`;
}

function contentName(row: DomesticOrder) {
  const prefix = row.platform === "bunjang" ? "스와숍" : "도파민베이커리";
  return `${prefix}-${row.nickname || ""}`;
}

function toExcelRow(row: DomesticOrder) {
  return {
    받는분성명: row.recipient_name || "",
    받는분우편번호: withApostrophe(row.postal_code),
    받는분전화번호: withApostrophe(row.phone),
    "받는분주소(전체, 분할)": row.address || "",
    고객주문번호: row.order_id,
    품목명: "피규어",
    내품명: contentName(row),
    박스수량: "1",
    박스타입: "1",
    기본운임: "",
    주문건수: String(row.order_count || 1),
    최초주문일: row.first_order_date || "",
    아이템: row.item_summary || "",
    상품금액합계: formatWon(row.item_total_price),
  };
}

function sortValue(row: Row, key: SortKey): string | number {
  const s = shipping(row);

  switch (key) {
    case "platform": return row.platform || "";
    case "order_id": return row.order_id || "";
    case "nickname": return row.nickname || "";
    case "order_count": return Number(row.order_count || 0);
    case "first_order_date": return row.first_order_date || "";
    case "item_summary": return row.item_summary || "";
    case "item_total_price": return Number(row.item_total_price || 0);
    case "order_status": return row.order_status || "";
    case "shipping_status": return s?.shipping_status || "start";
    case "shipping_type": return s?.shipping_type || "일반택배";
    case "tracking_number": return s?.tracking_number || "";
  }
}

function compareRows(a: Row, b: Row, key: SortKey, direction: SortDirection) {
  const aValue = sortValue(a, key);
  const bValue = sortValue(b, key);
  const factor = direction === "asc" ? 1 : -1;

  if (typeof aValue === "number" && typeof bValue === "number") {
    return (aValue - bValue) * factor;
  }

  return String(aValue).localeCompare(String(bValue), "ko") * factor;
}

export default function DomesticOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("first_order_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/domestic/orders", { cache: "no-store" });
    const json = await res.json();

    setRows((json.orders || []).map((row: DomesticOrder) => ({ ...row, selected: false })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDirection)),
    [rows, sortKey, sortDirection]
  );

  const selectedRows = rows.filter((r) => r.selected);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function toggle(id: string, checked: boolean) {
    setRows((prev) =>
      prev.map((r) => (r.order_id === id ? { ...r, selected: checked } : r))
    );
  }

  function exportExcel() {
    const data = selectedRows.map(toExcelRow);
    const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "국내배송");
    XLSX.writeFile(wb, "domestic.xlsx");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Domestic Orders</h1>

      <button onClick={exportExcel}>
        엑셀 ({selectedRows.length})
      </button>

      <table>
        <thead>
          <tr>
            <th></th>
            <th onClick={() => toggleSort("order_id")}>주문번호</th>
            <th onClick={() => toggleSort("nickname")}>닉네임</th>
            <th>주소</th>
            <th onClick={() => toggleSort("item_total_price")}>금액</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.order_id}>
              <td>
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={(e) => toggle(row.order_id, e.target.checked)}
                />
              </td>
              <td>{row.order_id}</td>
              <td>{row.nickname}</td>
              <td>{row.address}</td>
              <td>{formatWon(row.item_total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
