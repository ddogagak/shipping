"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/* =========================
   TYPES
========================= */

export type OrderListRow = {
  id: string;
  sale_date: string | null;
  order_number: string;
  username: string | null;
  name: string | null;
  country: string | null;
  country_code: string | null;
  quantity: number | null;
  shipping_method: string | null;
  order_status: string | null;
  label_shipping_method: string | null;
  shipping_label_status: string | null;
  tracking_number: string | null;
  item_list: string | null;
  stockout_item_indexes: number[];
};

type RowDraftKey =
  | "shipping_method"
  | "order_status"
  | "shipping_label_status";

type RowDraft = Partial<Record<RowDraftKey, string>>;

type SaveRowResponse = {
  ok: boolean;
  order_number: string;
  shipping_method: string;
  order_status: string;
  shipping_label_status: string;
};

type CombineSuggestion = {
  key: string;
  username: string;
  rows: OrderListRow[];
  orderNumbers: string[];
  combinedOrderNumber: string;
  totalQuantity: number;
};

/* =========================
   CONSTANTS
========================= */

const SHIPPING_METHOD_OPTIONS = [
  { value: "k-packet", label: "K-Packet" },
  { value: "egs", label: "EGS" },
  { value: "check", label: "Check" },
];

const ORDER_STATUS_OPTIONS = [
  { value: "accepted", label: "주문 업로드" },
  { value: "check", label: "재고 확인" },
  { value: "pending", label: "확인 필요" },
  { value: "refund", label: "환불/취소" },
  { value: "done", label: "완료" },
];

const SHIPPING_LABEL_STATUS_OPTIONS = [
  { value: "start", label: "시작" },
  { value: "csv_exported", label: "CSV 추출" },
  { value: "created", label: "라벨작업 완료" },
  { value: "printed", label: "출력 완료" },
  { value: "uploaded", label: "운송장 업로드" },
  { value: "done", label: "배송 완료" },
];

/* =========================
   UTIL FUNCTIONS
========================= */

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(5, 10).replace("-", ".");
  }

  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function shortOrderNumber(value: string) {
  return value ? value.slice(-5) : "-";
}

function formatItemList(value: string | null) {
  if (!value) return [];
  return value.split("|").map((v) => v.trim()).filter(Boolean);
}

function splitItemParts(value: string) {
  return value
    .split(/(\[[^\]]*\])/g)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((part) => ({
      text: part,
      isOption: part.startsWith("[") && part.endsWith("]"),
    }));
}

function normalizeUsername(value: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function selectStyle(changed: boolean): CSSProperties {
  return {
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 13,
    fontWeight: 700,
    background: changed ? "#fff7ed" : "#fff",
    minWidth: 104,
  };
}

/* =========================
   COMPONENT
========================= */

export default function OrdersClient({ rows }: { rows: OrderListRow[] }) {
  /* =========================
     STATE
  ========================= */

  const [localRows, setLocalRows] = useState(rows);
  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState(
    () => new Set<string>()
  );
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});
  const [stockoutTouchedOrderNumbers, setStockoutTouchedOrderNumbers] =
    useState(new Set<string>());

  const [savingRowOrderNumber, setSavingRowOrderNumber] =
    useState<string | null>(null);

  const [savingAll, setSavingAll] = useState(false);
  const [combiningKey, setCombiningKey] = useState<string | null>(null);

  const selectAllRef = useRef<HTMLInputElement | null>(null);

  /* =========================
     EFFECTS
  ========================= */

  useEffect(() => {
    setLocalRows(rows);
    setRowDrafts({});
    setStockoutTouchedOrderNumbers(new Set());
  }, [rows]);

  /* =========================
     MEMO
  ========================= */

  const visibleOrderNumbers = useMemo(
    () => localRows.map((r) => r.order_number),
    [localRows]
  );

  const selectedRows = useMemo(
    () => localRows.filter((r) => selectedOrderNumbers.has(r.order_number)),
    [localRows, selectedOrderNumbers]
  );

  const selectedKPacketRows = useMemo(
    () =>
      selectedRows.filter((r) => {
        const m = r.label_shipping_method || r.shipping_method;
        return m === "k-packet";
      }),
    [selectedRows]
  );

  const combineSuggestions = useMemo<CombineSuggestion[]>(() => {
    const map = new Map<string, OrderListRow[]>();

    localRows.forEach((row) => {
      const key = normalizeUsername(row.username);
      if (!key) return;
      if (row.order_status === "done") return;
      if (row.shipping_label_status === "done") return;

      const arr = map.get(key) || [];
      arr.push(row);
      map.set(key, arr);
    });

    const result: CombineSuggestion[] = [];

    map.forEach((group, key) => {
      if (group.length < 2) return;

      const orderNumbers = group.map((r) => r.order_number);

      result.push({
        key,
        username: group[0].username || key,
        rows: group,
        orderNumbers,
        combinedOrderNumber: orderNumbers.map(shortOrderNumber).join("-"),
        totalQuantity: group.reduce(
          (sum, r) => sum + Number(r.quantity || 0),
          0
        ),
      });
    });

    return result;
  }, [localRows]);

  /* =========================
     SELECTION LOGIC
  ========================= */

  function toggleOne(orderNumber: string) {
    setSelectedOrderNumbers((prev) => {
      const next = new Set(prev);
      next.has(orderNumber) ? next.delete(orderNumber) : next.add(orderNumber);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedOrderNumbers((prev) => {
      const next = new Set(prev);
      visibleOrderNumbers.forEach((n) =>
        checked ? next.add(n) : next.delete(n)
      );
      return next;
    });
  }

  function clearSelected() {
    setSelectedOrderNumbers(new Set());
  }

  /* =========================
     RENDER
  ========================= */

  return (
    <section className="card" style={wrapperStyle}>
      {/* ===== HEADER ===== */}
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>
            주문 목록
            {combineSuggestions.length > 0 && (
              <span style={badgeStyle}>
                합배송 가능 {combineSuggestions.length}그룹
              </span>
            )}
          </h2>

          <p style={descStyle}>
            {localRows.length}건 / 선택 {selectedRows.length}건
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={clearSelected}>선택 해제</button>
        </div>
      </div>

      {/* ===== TABLE ===== */}
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={thStyle}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                />
              </th>
              <th style={thStyle}>주문번호</th>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>수량</th>
            </tr>
          </thead>

          <tbody>
            {localRows.map((row) => {
              const checked = selectedOrderNumbers.has(row.order_number);

              return (
                <tr key={row.order_number}>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(row.order_number)}
                    />
                  </td>

                  <td style={tdStyle}>
                    {shortOrderNumber(row.order_number)}
                  </td>

                  <td style={tdStyle}>{row.username}</td>
                  <td style={tdStyle}>{row.quantity}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* =========================
   STYLES
========================= */

const wrapperStyle: CSSProperties = {
  marginTop: 16,
  padding: 20,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 12,
};

const titleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const badgeStyle: CSSProperties = {
  background: "#fef3c7",
  padding: "4px 8px",
  borderRadius: 999,
  fontWeight: 800,
};

const descStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #f3f4f6",
};
