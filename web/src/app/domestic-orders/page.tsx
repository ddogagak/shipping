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
    case "platform":
      return row.platform || "";
    case "order_id":
      return row.order_id || "";
    case "nickname":
      return row.nickname || "";
    case "order_count":
      return Number(row.order_count || 0);
    case "first_order_date":
      return row.first_order_date || "";
    case "item_summary":
      return row.item_summary || "";
    case "item_total_price":
      return Number(row.item_total_price || 0);
    case "order_status":
      return row.order_status || "";
    case "shipping_status":
      return s?.shipping_status || "start";
    case "shipping_type":
      return s?.shipping_type || "일반택배";
    case "tracking_number":
      return s?.tracking_number || "";
    default:
      return "";
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
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [platforms, setPlatforms] = useState<string[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<string[]>(["accepted", "checked"]);
  const [shippingStatuses, setShippingStatuses] = useState<string[]>(["start", "excel_exported", "uploaded"]);
  const [shippingTypes, setShippingTypes] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("first_order_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/domestic/orders", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "조회 실패");
        return;
      }

      setRows((json.orders || []).map((row: DomesticOrder) => ({ ...row, selected: false })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        const s = shipping(row);
        const shippingStatus = s?.shipping_status || "start";
        const shippingType = s?.shipping_type || "일반택배";

        if (platforms.length && !platforms.includes(row.platform)) return false;
        if (orderStatuses.length && !orderStatuses.includes(row.order_status || "accepted")) return false;
        if (shippingStatuses.length && !shippingStatuses.includes(shippingStatus)) return false;
        if (shippingTypes.length && !shippingTypes.includes(shippingType)) return false;

        if (q.trim()) {
          const text = [
            row.order_id,
            row.platform,
            row.nickname,
            row.recipient_name,
            row.phone,
            row.postal_code,
            row.address,
            row.first_order_date,
            row.item_summary,
            s?.tracking_number,
            shippingType,
          ]
            .join(" ")
            .toLowerCase();

          if (!text.includes(q.trim().toLowerCase())) return false;
        }

        return true;
      })
      .sort((a, b) => compareRows(a, b, sortKey, sortDirection));
  }, [rows, platforms, orderStatuses, shippingStatuses, shippingTypes, q, sortKey, sortDirection]);

  const selectedIds = rows.filter((row) => row.selected).map((row) => row.order_id);
  const selectedRows = rows.filter((row) => row.selected);

  function toggleList(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function updateSelected(orderId: string, selected: boolean) {
    setRows((prev) => prev.map((row) => (row.order_id === orderId ? { ...row, selected } : row)));
  }

  function toggleAllFiltered(checked: boolean) {
    const ids = new Set(filteredRows.map((row) => row.order_id));
    setRows((prev) => prev.map((row) => (ids.has(row.order_id) ? { ...row, selected: checked } : row)));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  }

  async function patch(action: string) {
    if (!selectedIds.length) {
      alert("선택된 주문이 없어.");
      return;
    }

    const res = await fetch("/api/domestic/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: selectedIds, action }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "상태 변경 실패");
      return;
    }

    await load();
  }

  async function exportExcel() {
    if (!selectedRows.length) {
      alert("엑셀 추출할 주문을 선택해줘.");
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
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    XLSX.writeFile(workbook, `domestic_shipping_${stamp}.xlsx`);
    await patch("excel_exported");
  }

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => row.selected);

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Domestic Orders</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>국내 주문 조회, 필터, 상태 변경, 엑셀 재추출 화면입니다.</p>

        {message ? <p style={{ color: "#b91c1c" }}>{message}</p> : null}

        <div style={summaryGridStyle}>
          <Summary label="전체" value={rows.length} />
          <Summary label="현재 표시" value={filteredRows.length} />
          <Summary label="선택" value={selectedIds.length} />
          <Summary label="배송완료" value={rows.filter((row) => shipping(row)?.shipping_status === "done").length} />
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>필터</h2>

        <FilterGroup title="플랫폼" options={PLATFORM_OPTIONS} selected={platforms} onToggle={(value) => setPlatforms((prev) => toggleList(prev, value))} />
        <FilterGroup title="주문상태" options={ORDER_STATUS_OPTIONS} selected={orderStatuses} onToggle={(value) => setOrderStatuses((prev) => toggleList(prev, value))} />
        <FilterGroup title="배송상태" options={SHIPPING_STATUS_OPTIONS} selected={shippingStatuses} onToggle={(value) => setShippingStatuses((prev) => toggleList(prev, value))} />
        <FilterGroup title="배송수단" options={SHIPPING_TYPE_OPTIONS} selected={shippingTypes} onToggle={(value) => setShippingTypes((prev) => toggleList(prev, value))} />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="고객주문번호, 닉네임, 아이템, 운송장 검색" style={searchInputStyle} />
          <button type="button" onClick={() => void load()} style={blackButtonStyle}>새로고침</button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <div style={actionBarStyle}>
          <div style={{ fontWeight: 800 }}>선택 {selectedIds.length}건</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={exportExcel} style={blackButtonStyle}>선택 {selectedIds.length}건 엑셀 추출</button>
            <button type="button" onClick={() => patch("checked")} style={blueButtonStyle}>재고확인 처리</button>
            <button type="button" onClick={() => patch("order_done")} style={purpleButtonStyle}>주문완료 처리</button>
            <button type="button" onClick={() => patch("shipping_done")} style={greenButtonStyle}>배송완료 처리</button>
          </div>
        </div>

        {loading ? (
          <p>불러오는 중...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 1400, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thStyle}>
                    <input type="checkbox" checked={allFilteredSelected} onChange={(event) => toggleAllFiltered(event.target.checked)} />
                  </th>
                  <SortableTh label="플랫폼" sortKeyValue="platform" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="고객주문번호" sortKeyValue="order_id" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="닉네임" sortKeyValue="nickname" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="주문건수" sortKeyValue="order_count" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="최초주문일" sortKeyValue="first_order_date" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="아이템" sortKeyValue="item_summary" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="상품합계" sortKeyValue="item_total_price" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="주문상태" sortKeyValue="order_status" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="배송상태" sortKeyValue="shipping_status" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="배송수단" sortKeyValue="shipping_type" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="운송장" sortKeyValue="tracking_number" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const s = shipping(row);
                  return (
                    <tr key={row.order_id}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={row.selected} onChange={(event) => updateSelected(row.order_id, event.target.checked)} />
                      </td>
                      <td style={tdStyle}>{label(PLATFORM_OPTIONS, row.platform)}</td>
                      <td style={tdStyle}>{row.order_id}</td>
                      <td style={tdStyle}>{row.nickname || ""}</td>
                      <td style={tdStyle}>{row.order_count || 1}</td>
                      <td style={tdStyle}>{row.first_order_date || ""}</td>
                      <td style={{ ...tdStyle, minWidth: 360, maxWidth: 520, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={row.item_summary || ""}>{row.item_summary || ""}</td>
                      <td style={tdStyle}>{formatWon(row.item_total_price)}</td>
                      <td style={tdStyle}>{label(ORDER_STATUS_OPTIONS, row.order_status || "accepted")}</td>
                      <td style={tdStyle}>{label(SHIPPING_STATUS_OPTIONS, s?.shipping_status || "start")}</td>
                      <td style={tdStyle}>{s?.shipping_type || "일반택배"}</td>
                      <td style={tdStyle}>{s?.tracking_number || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <strong style={{ fontSize: 28 }}>{value}</strong>
    </div>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button key={option.value} type="button" onClick={() => onToggle(option.value)} style={filterButtonStyle(active)}>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKeyValue,
  sortKey,
  direction,
  onSort,
}: {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === sortKeyValue;
  return (
    <th style={thStyle}>
      <button type="button" onClick={() => onSort(sortKeyValue)} style={sortButtonStyle}>
        {label} {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
      </button>
    </th>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  background: "#fff",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 18,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const actionBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

const searchInputStyle: CSSProperties = {
  flex: "1 1 340px",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
};

const blackButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const blueButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#2563eb" };
const purpleButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#7c3aed" };
const greenButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#059669" };

function filterButtonStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
    borderRadius: 999,
    padding: "8px 12px",
    background: active ? "#2563eb" : "#fff",
    color: active ? "#fff" : "#111827",
    fontWeight: 800,
    cursor: "pointer",
  };
}

const sortButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  padding: 0,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

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
