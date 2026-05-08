"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

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
  memo: string | null;
};

type RowDraftKey =
  | "shipping_method"
  | "order_status"
  | "shipping_label_status"
  | "memo";

type RowDraft = Partial<Record<RowDraftKey, string>>;

type SaveRowResponse = {
  ok: boolean;
  order_number: string;
  shipping_method: string;
  order_status: string;
  shipping_label_status: string;
  memo: string | null;
};

type CombineSuggestion = {
  key: string;
  username: string;
  rows: OrderListRow[];
  orderNumbers: string[];
  combinedOrderNumber: string;
  totalQuantity: number;
};

type SortKey =
  | "sale_date"
  | "order_number"
  | "username"
  | "name"
  | "country_code"
  | "quantity"
  | "shipping_method"
  | "order_status"
  | "shipping_label_status"
  | "tracking_number"
  | "item_list"
  | "memo";

type SortDirection = "asc" | "desc";

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

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(5, 10).replace("-", ".");
  }

  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  return `${mm}.${dd}`;
}

function shortOrderNumber(value: string) {
  if (!value) return "-";
  return value.slice(-5);
}

function formatItemList(value: string | null) {
  if (!value) return [];

  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeUsername(value: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function splitItemParts(value: string) {
  return value
    .split(/(\[[^\]]*\])/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      text: part,
      isOption: part.startsWith("[") && part.endsWith("]"),
    }));
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

function getSortValue(row: OrderListRow, key: SortKey): string | number {
  if (key === "sale_date") return row.sale_date || "";
  if (key === "order_number") return row.order_number || "";
  if (key === "username") return row.username || "";
  if (key === "name") return row.name || "";
  if (key === "country_code") return row.country_code || "";
  if (key === "quantity") return Number(row.quantity || 0);
  if (key === "shipping_method")
    return row.label_shipping_method || row.shipping_method || "check";
  if (key === "order_status") return row.order_status || "accepted";
  if (key === "shipping_label_status")
    return row.shipping_label_status || "start";
  if (key === "tracking_number") return row.tracking_number || "";
  if (key === "item_list") return row.item_list || "";
  return row.memo || "";
}

function SortableTh({
  label,
  sortKeyValue,
  sortKey,
  direction,
  onSort,
  style,
}: {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  style?: CSSProperties;
}) {
  const active = sortKey === sortKeyValue;
  const arrow = !active ? "↕" : direction === "asc" ? "▲" : "▼";

  return (
    <th style={{ ...thStyle, ...style }}>
      <button
        type="button"
        onClick={() => onSort(sortKeyValue)}
        style={{
          border: 0,
          background: "transparent",
          padding: 0,
          font: "inherit",
          fontWeight: 900,
          color: active ? "#2563eb" : "#111827",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title={`${label} 정렬`}
      >
        {label} <span style={{ fontSize: 11 }}>{arrow}</span>
      </button>
    </th>
  );
}

export default function OrdersClient({ rows }: { rows: OrderListRow[] }) {
  const [localRows, setLocalRows] = useState<OrderListRow[]>(rows);

  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState<Set<string>>(
    () => new Set(),
  );

  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});

  const [stockoutTouchedOrderNumbers, setStockoutTouchedOrderNumbers] =
    useState<Set<string>>(() => new Set());

  const [savingRowOrderNumber, setSavingRowOrderNumber] = useState<
    string | null
  >(null);

  const [savingAll, setSavingAll] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("sale_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLocalRows(rows);
    setRowDrafts({});
    setStockoutTouchedOrderNumbers(new Set());
  }, [rows]);

  const sortedRows = useMemo(() => {
    const multiplier = sortDirection === "asc" ? 1 : -1;

    return [...localRows].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * multiplier;
      }

      return String(av).localeCompare(String(bv), "ko") * multiplier;
    });
  }, [localRows, sortDirection, sortKey]);

  const visibleOrderNumbers = useMemo(
    () => sortedRows.map((row) => row.order_number),
    [sortedRows],
  );

  const selectedRows = useMemo(() => {
    return localRows.filter((row) =>
      selectedOrderNumbers.has(row.order_number),
    );
  }, [localRows, selectedOrderNumbers]);

  const selectedKPacketRows = useMemo(() => {
    return selectedRows.filter((row) => {
      const method = row.label_shipping_method || row.shipping_method;
      return method === "k-packet";
    });
  }, [selectedRows]);

  const selectedNotKPacketRows =
    selectedRows.length - selectedKPacketRows.length;

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

      result.push({
        key,
        username: group[0].username || key,
        rows: group,
        orderNumbers: group.map((row) => row.order_number),
        combinedOrderNumber: group
          .map((row) => row.order_number.slice(-5))
          .join("-"),
        totalQuantity: group.reduce(
          (sum, row) => sum + Number(row.quantity || 0),
          0,
        ),
      });
    });

    return result;
  }, [localRows]);

  const allVisibleChecked =
    localRows.length > 0 &&
    visibleOrderNumbers.every((orderNumber) =>
      selectedOrderNumbers.has(orderNumber),
    );

  const partlyChecked =
    localRows.some((row) => selectedOrderNumbers.has(row.order_number)) &&
    !allVisibleChecked;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partlyChecked;
    }
  }, [partlyChecked]);

  useEffect(() => {
    setSelectedOrderNumbers((prev) => {
      const next = new Set<string>();
      const visibleSet = new Set(visibleOrderNumbers);

      prev.forEach((orderNumber) => {
        if (visibleSet.has(orderNumber)) {
          next.add(orderNumber);
        }
      });

      return next;
    });
  }, [visibleOrderNumbers]);

  function toggleOne(orderNumber: string) {
    setSelectedOrderNumbers((prev) => {
      const next = new Set(prev);

      if (next.has(orderNumber)) {
        next.delete(orderNumber);
      } else {
        next.add(orderNumber);
      }

      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedOrderNumbers((prev) => {
      const next = new Set(prev);

      visibleOrderNumbers.forEach((orderNumber) => {
        if (checked) {
          next.add(orderNumber);
        } else {
          next.delete(orderNumber);
        }
      });

      return next;
    });
  }

  function clearSelected() {
    setSelectedOrderNumbers(new Set());
  }

  function getRowDraftValue(row: OrderListRow, key: RowDraftKey): string {
    const draftValue = rowDrafts[row.order_number]?.[key];

    if (typeof draftValue === "string") {
      return draftValue;
    }

    if (key === "shipping_method") {
      return row.label_shipping_method || row.shipping_method || "check";
    }

    if (key === "order_status") {
      return row.order_status || "accepted";
    }

    if (key === "shipping_label_status") {
      return row.shipping_label_status || "start";
    }

    return row.memo || "";
  }

  function isRowSelectChanged(row: OrderListRow): boolean {
    const draft = rowDrafts[row.order_number];

    if (!draft) return false;

    const savedShippingMethod =
      row.label_shipping_method || row.shipping_method || "check";
    const savedOrderStatus = row.order_status || "accepted";
    const savedLabelStatus = row.shipping_label_status || "start";
    const savedMemo = row.memo || "";

    const shippingMethodChanged =
      typeof draft.shipping_method === "string" &&
      draft.shipping_method !== savedShippingMethod;

    const orderStatusChanged =
      typeof draft.order_status === "string" &&
      draft.order_status !== savedOrderStatus;

    const shippingLabelStatusChanged =
      typeof draft.shipping_label_status === "string" &&
      draft.shipping_label_status !== savedLabelStatus;

    const memoChanged =
      typeof draft.memo === "string" && draft.memo !== savedMemo;

    return (
      shippingMethodChanged ||
      orderStatusChanged ||
      shippingLabelStatusChanged ||
      memoChanged
    );
  }

  function isRowStockoutTouched(row: OrderListRow): boolean {
    return stockoutTouchedOrderNumbers.has(row.order_number);
  }

  function isRowSaveEnabled(row: OrderListRow): boolean {
    return isRowSelectChanged(row) || isRowStockoutTouched(row);
  }

  function changeRowDraft(
    orderNumber: string,
    key: RowDraftKey,
    value: string,
  ) {
    setRowDrafts((prev) => ({
      ...prev,
      [orderNumber]: {
        ...prev[orderNumber],
        [key]: value,
      },
    }));
  }

  async function saveRowToServer(row: OrderListRow): Promise<SaveRowResponse> {
    const shippingMethod = getRowDraftValue(row, "shipping_method");
    const orderStatus = getRowDraftValue(row, "order_status");
    const shippingLabelStatus = getRowDraftValue(row, "shipping_label_status");
    const memo = getRowDraftValue(row, "memo");

    const response = await fetch("/api/ebay/order-row", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_number: row.order_number,
        shipping_method: shippingMethod,
        order_status: orderStatus,
        shipping_label_status: shippingLabelStatus,
        memo,
      }),
    });

    if (!response.ok) {
      const errorResult = await response.json().catch(() => null);

      throw new Error(
        errorResult?.detail || errorResult?.error || "주문 행 저장 실패",
      );
    }

    return (await response.json()) as SaveRowResponse;
  }

  function applySavedRow(result: SaveRowResponse) {
    setLocalRows((prevRows) =>
      prevRows.map((targetRow) => {
        if (targetRow.order_number !== result.order_number) {
          return targetRow;
        }

        return {
          ...targetRow,
          shipping_method: result.shipping_method,
          label_shipping_method: result.shipping_method,
          order_status: result.order_status,
          shipping_label_status: result.shipping_label_status,
          memo: result.memo,
        };
      }),
    );

    setRowDrafts((prev) => {
      const next = { ...prev };
      delete next[result.order_number];
      return next;
    });

    setStockoutTouchedOrderNumbers((prev) => {
      const next = new Set(prev);
      next.delete(result.order_number);
      return next;
    });
  }

  async function saveRow(row: OrderListRow) {
    if (!isRowSaveEnabled(row)) return;

    setSavingRowOrderNumber(row.order_number);

    try {
      const result = await saveRowToServer(row);
      applySavedRow(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(error);
      alert("저장 오류: " + message);
    } finally {
      setSavingRowOrderNumber(null);
    }
  }

  async function saveSelectedRows() {
    if (!selectedRows.length) {
      alert("전체저장할 주문을 선택해줘.");
      return;
    }

    const ok = confirm(
      `선택한 주문 ${selectedRows.length}건을 전체 저장할까?\n\n` +
        "변경사항이 없는 주문도 현재 화면 값 그대로 저장됩니다.",
    );

    if (!ok) return;

    setSavingAll(true);

    const savedResults: SaveRowResponse[] = [];
    const errors: string[] = [];

    for (const row of selectedRows) {
      try {
        const result = await saveRowToServer(row);
        savedResults.push(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        errors.push(`${row.order_number}: ${message}`);
      }
    }

    savedResults.forEach((result) => {
      applySavedRow(result);
    });

    setSavingAll(false);

    if (errors.length) {
      alert(
        `일부 저장 실패\n\n성공: ${savedResults.length}건\n실패: ${errors.length}건\n\n` +
          errors.slice(0, 5).join("\n"),
      );
      return;
    }

    alert(`전체저장 완료: ${savedResults.length}건`);
  }

  async function toggleStockoutItem(
    orderNumber: string,
    itemIndex: number,
    checked: boolean,
  ) {
    setStockoutTouchedOrderNumbers((prev) => {
      const next = new Set(prev);
      next.add(orderNumber);
      return next;
    });

    setLocalRows((prevRows) =>
      prevRows.map((row) => {
        if (row.order_number !== orderNumber) return row;

        const current = new Set<number>(row.stockout_item_indexes || []);

        if (checked) {
          current.add(itemIndex);
        } else {
          current.delete(itemIndex);
        }

        return {
          ...row,
          stockout_item_indexes: Array.from(current).sort((a, b) => a - b),
          order_status: checked ? "pending" : row.order_status,
        };
      }),
    );

    try {
      const response = await fetch("/api/ebay/item-stockout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_number: orderNumber,
          item_index: itemIndex,
          checked,
        }),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => null);

        throw new Error(
          errorResult?.detail ||
            errorResult?.error ||
            "재고없음 상태 저장 실패",
        );
      }

      const result = await response.json();

      setLocalRows((prevRows) =>
        prevRows.map((row) => {
          if (row.order_number !== orderNumber) return row;

          return {
            ...row,
            stockout_item_indexes: result.stockout_item_indexes || [],
            order_status: result.order_status || row.order_status,
          };
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(error);
      alert("재고없음 상태 저장 오류: " + message);
      window.location.reload();
    }
  }

  async function handleExportKPacket() {
    if (!selectedKPacketRows.length) {
      alert("K-Packet 주문을 선택해줘.");
      return;
    }

    const ok = confirm(
      `선택한 K-Packet 주문 ${selectedKPacketRows.length}건을 CSV로 추출할까?\n\n` +
        "추출 후 라벨상태가 'CSV 추출'로 변경됩니다.",
    );

    if (!ok) return;

    try {
      const response = await fetch("/api/ebay/export-kpacket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_numbers: selectedKPacketRows.map((row) => row.order_number),
        }),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => null);

        throw new Error(
          errorResult?.detail || errorResult?.error || "K-Packet CSV 추출 실패",
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || "kpacket_export.csv";

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      a.remove();
      window.URL.revokeObjectURL(url);

      alert(`K-Packet CSV 추출 완료: ${selectedKPacketRows.length}건`);
      window.location.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(error);
      alert("K-Packet CSV 추출 오류: " + message);
    }
  }

  async function handleCombineShipping(suggestion: CombineSuggestion) {
    const ok = confirm(
      `${suggestion.username}님의 주문 ${suggestion.rows.length}건을 합배송할까?\n\n` +
        `새 주문번호: ${suggestion.combinedOrderNumber}`,
    );

    if (!ok) return;

    try {
      const response = await fetch("/api/ebay/combine-shipping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_numbers: suggestion.orderNumbers,
        }),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => null);

        throw new Error(
          errorResult?.detail || errorResult?.error || "합배송 실패",
        );
      }

      alert("합배송 완료");
      window.location.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(error);
      alert("합배송 오류: " + message);
    }
  }

  async function saveBulkRows(
    actionLabel: string,
    patch: Partial<Record<RowDraftKey, string>>,
  ) {
    if (!selectedRows.length) {
      alert(`${actionLabel}할 주문을 선택해줘.`);
      return;
    }

    const ok = confirm(
      `선택한 주문 ${selectedRows.length}건을 ${actionLabel}할까?`,
    );
    if (!ok) return;

    setSavingAll(true);

    const savedResults: SaveRowResponse[] = [];
    const errors: string[] = [];

    for (const row of selectedRows) {
      const shippingMethod =
        patch.shipping_method || getRowDraftValue(row, "shipping_method");
      const orderStatus =
        patch.order_status || getRowDraftValue(row, "order_status");
      const shippingLabelStatus =
        patch.shipping_label_status ||
        getRowDraftValue(row, "shipping_label_status");
      const memo = getRowDraftValue(row, "memo");

      try {
        const response = await fetch("/api/ebay/order-row", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_number: row.order_number,
            shipping_method: shippingMethod,
            order_status: orderStatus,
            shipping_label_status: shippingLabelStatus,
            memo,
          }),
        });

        if (!response.ok) {
          const errorResult = await response.json().catch(() => null);
          throw new Error(
            errorResult?.detail || errorResult?.error || `${actionLabel} 실패`,
          );
        }

        savedResults.push((await response.json()) as SaveRowResponse);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류";
        errors.push(`${row.order_number}: ${message}`);
      }
    }

    savedResults.forEach((result) => applySavedRow(result));

    setSavingAll(false);

    if (errors.length) {
      alert(
        `${actionLabel} 일부 실패\n\n성공: ${savedResults.length}건\n실패: ${errors.length}건\n\n` +
          errors.slice(0, 5).join("\n"),
      );
      return;
    }

    alert(`${actionLabel} 완료: ${savedResults.length}건`);
  }

  function handleCompleteShipping() {
    void saveBulkRows("배송완료 처리", {
      order_status: "done",
      shipping_label_status: "done",
    });
  }

  function handleCompleteOrder() {
    void saveBulkRows("주문상태 완료 처리", {
      order_status: "done",
    });
  }

  function handleCheckOrder() {
    void saveBulkRows("재고 확인 처리", {
      order_status: "check",
    });
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "sale_date" ? "desc" : "asc");
  }

  return (
    <section
      className="card"
      style={{
        marginTop: 16,
        padding: 20,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            주문 목록{" "}
            {combineSuggestions.length > 0 ? (
              <span style={{ color: "#2563eb", fontSize: 14 }}>
                합배송 가능 {combineSuggestions.length}그룹
              </span>
            ) : null}
          </h2>
          <p style={{ color: "#6b7280", margin: "6px 0 0" }}>
            현재 조건: {localRows.length}건 / 선택: {selectedRows.length}건 /
            K-Packet 선택: {selectedKPacketRows.length}건
          </p>

          {selectedNotKPacketRows > 0 ? (
            <p style={{ color: "#b45309", margin: "6px 0 0", fontSize: 13 }}>
              선택한 주문 중 K-Packet이 아닌 주문 {selectedNotKPacketRows}건은
              K-Packet CSV 추출에서 제외됩니다.
            </p>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleExportKPacket}
            disabled={!selectedKPacketRows.length}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "0",
              background: selectedKPacketRows.length ? "#2563eb" : "#9ca3af",
              color: "#fff",
              fontWeight: 800,
              cursor: selectedKPacketRows.length ? "pointer" : "not-allowed",
            }}
          >
            선택 K-Packet CSV 추출
          </button>

          <button
            type="button"
            onClick={handleCompleteShipping}
            disabled={!selectedRows.length || savingAll}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "0",
              background:
                selectedRows.length && !savingAll ? "#16a34a" : "#9ca3af",
              color: "#fff",
              fontWeight: 800,
              cursor:
                selectedRows.length && !savingAll ? "pointer" : "not-allowed",
            }}
          >
            배송완료 처리
          </button>

          <button
            type="button"
            onClick={handleCompleteOrder}
            disabled={!selectedRows.length || savingAll}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "0",
              background:
                selectedRows.length && !savingAll ? "#7c3aed" : "#9ca3af",
              color: "#fff",
              fontWeight: 800,
              cursor:
                selectedRows.length && !savingAll ? "pointer" : "not-allowed",
            }}
          >
            주문완료 처리
          </button>

          <button
            type="button"
            onClick={handleCheckOrder}
            disabled={!selectedRows.length || savingAll}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "0",
              background:
                selectedRows.length && !savingAll ? "#f59e0b" : "#9ca3af",
              color: "#111827",
              fontWeight: 800,
              cursor:
                selectedRows.length && !savingAll ? "pointer" : "not-allowed",
            }}
          >
            재고확인 처리
          </button>

          <button
            type="button"
            onClick={clearSelected}
            disabled={!selectedRows.length}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: selectedRows.length ? "#111827" : "#9ca3af",
              fontWeight: 800,
              cursor: selectedRows.length ? "pointer" : "not-allowed",
            }}
          >
            선택 해제
          </button>

          <button
            type="button"
            onClick={saveSelectedRows}
            disabled={!selectedRows.length || savingAll}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "0",
              background:
                selectedRows.length && !savingAll ? "#111827" : "#9ca3af",
              color: "#fff",
              fontWeight: 800,
              cursor:
                selectedRows.length && !savingAll ? "pointer" : "not-allowed",
            }}
          >
            {savingAll ? "전체저장중" : "전체저장"}
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            minWidth: 1500,
          }}
        >
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ ...thStyle, width: 42, textAlign: "center" }}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                />
              </th>
              <SortableTh
                label="주문일"
                sortKeyValue="sale_date"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTh
                label="주문정보"
                sortKeyValue="order_number"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                style={{ minWidth: 180 }}
              />
              <SortableTh
                label="국가"
                sortKeyValue="country_code"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTh
                label="수량"
                sortKeyValue="quantity"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTh
                label="배송방식"
                sortKeyValue="shipping_method"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTh
                label="주문상태"
                sortKeyValue="order_status"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTh
                label="라벨상태"
                sortKeyValue="shipping_label_status"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTh
                label="운송장번호"
                sortKeyValue="tracking_number"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <th style={thStyle}>저장</th>
              <SortableTh
                label="상품목록"
                sortKeyValue="item_list"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTh
                label="메모"
                sortKeyValue="memo"
                sortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
            </tr>
          </thead>

          <tbody>
            {sortedRows.length ? (
              sortedRows.map((row) => {
                const checked = selectedOrderNumbers.has(row.order_number);
                const itemList = formatItemList(row.item_list);
                const saveEnabled = isRowSaveEnabled(row);
                const changed =
                  isRowSelectChanged(row) || isRowStockoutTouched(row);

                return (
                  <tr
                    key={row.order_number}
                    style={{
                      background: checked ? "#eff6ff" : "#fff",
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(row.order_number)}
                      />
                    </td>

                    <td style={tdStyle}>{formatDate(row.sale_date)}</td>

                    <td
                      style={{
                        ...tdStyle,
                        minWidth: 180,
                        whiteSpace: "pre-line",
                        lineHeight: 1.55,
                      }}
                      title={`${row.order_number}
${row.username || ""}
${row.name || ""}`}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {shortOrderNumber(row.order_number)}
                      </div>
                      <div style={{ color: "#374151" }}>{row.username || "-"}</div>
                      <div style={{ color: "#6b7280" }}>{row.name || "-"}</div>
                    </td>
                    <td style={tdStyle}>{row.country_code || "-"}</td>
                    <td style={tdStyle}>{row.quantity ?? 0}</td>

                    <td style={tdStyle}>
                      <select
                        value={getRowDraftValue(row, "shipping_method")}
                        onChange={(event) =>
                          changeRowDraft(
                            row.order_number,
                            "shipping_method",
                            event.target.value,
                          )
                        }
                        style={selectStyle(changed)}
                      >
                        {SHIPPING_METHOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={tdStyle}>
                      <select
                        value={getRowDraftValue(row, "order_status")}
                        onChange={(event) =>
                          changeRowDraft(
                            row.order_number,
                            "order_status",
                            event.target.value,
                          )
                        }
                        style={selectStyle(changed)}
                      >
                        {ORDER_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={tdStyle}>
                      <select
                        value={getRowDraftValue(row, "shipping_label_status")}
                        onChange={(event) =>
                          changeRowDraft(
                            row.order_number,
                            "shipping_label_status",
                            event.target.value,
                          )
                        }
                        style={selectStyle(changed)}
                      >
                        {SHIPPING_LABEL_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={tdStyle}>{row.tracking_number || "-"}</td>

                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => saveRow(row)}
                        disabled={
                          !saveEnabled ||
                          savingRowOrderNumber === row.order_number ||
                          savingAll
                        }
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "0",
                          background: saveEnabled ? "#111827" : "#d1d5db",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor:
                            saveEnabled &&
                            savingRowOrderNumber !== row.order_number &&
                            !savingAll
                              ? "pointer"
                              : "not-allowed",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {savingRowOrderNumber === row.order_number
                          ? "저장중"
                          : "저장"}
                      </button>
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        minWidth: 720,
                        maxWidth: 900,
                      }}
                      title={row.item_list || ""}
                    >
                      {itemList.length ? (
                        <div
                          style={{
                            background: "#f3f4f6",
                            borderRadius: 8,
                            overflow: "hidden",
                          }}
                        >
                          {itemList.map((item, itemIndex) => {
                            const parts = splitItemParts(item);
                            const displayIndex = itemIndex + 1;
                            const isStockout = (
                              row.stockout_item_indexes || []
                            ).includes(displayIndex);

                            return (
                              <div
                                key={`${row.order_number}-${itemIndex}`}
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  padding: "8px 10px",
                                  borderTop:
                                    itemIndex === 0
                                      ? "none"
                                      : "1px solid #ffffff",
                                  lineHeight: 1.45,
                                  color: isStockout ? "#2563eb" : "#111827",
                                  background: isStockout
                                    ? "#eff6ff"
                                    : "transparent",
                                }}
                              >
                                <div
                                  style={{
                                    width: 46,
                                    flex: "0 0 46px",
                                    fontWeight: 800,
                                    color: isStockout ? "#2563eb" : "#374151",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 5,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isStockout}
                                    title="재고 없음"
                                    onChange={(event) =>
                                      toggleStockoutItem(
                                        row.order_number,
                                        displayIndex,
                                        event.target.checked,
                                      )
                                    }
                                    style={{
                                      marginTop: 3,
                                    }}
                                  />
                                  <span>{displayIndex}.</span>
                                </div>

                                <div
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    wordBreak: "break-word",
                                    whiteSpace: "normal",
                                  }}
                                >
                                  {isStockout ? (
                                    <div
                                      style={{
                                        fontWeight: 900,
                                        color: "#2563eb",
                                        marginBottom: 2,
                                      }}
                                    >
                                      재고 없음
                                    </div>
                                  ) : null}

                                  {parts.map((part, partIndex) => (
                                    <span
                                      key={partIndex}
                                      style={{
                                        display: part.isOption
                                          ? "block"
                                          : "inline",
                                        fontWeight: part.isOption ? 800 : 400,
                                        color: isStockout
                                          ? "#2563eb"
                                          : "#111827",
                                        marginTop: part.isOption ? 2 : 0,
                                      }}
                                    >
                                      {part.text}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={{ ...tdStyle, minWidth: 220 }}>
                      <textarea
                        value={getRowDraftValue(row, "memo")}
                        onChange={(event) =>
                          changeRowDraft(
                            row.order_number,
                            "memo",
                            event.target.value,
                          )
                        }
                        placeholder="배송 특이사항 / 클레임 / 요청사항"
                        rows={3}
                        style={memoInputStyle}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={12}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#6b7280",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  조건에 맞는 주문이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {combineSuggestions.length > 0 ? (
        <div
          style={{
            marginTop: 18,
            padding: 16,
            border: "1px solid #bfdbfe",
            borderRadius: 14,
            background: "#eff6ff",
          }}
        >
          <h3 style={{ margin: "0 0 10px", color: "#1e3a8a" }}>합배송 제안</h3>

          <div style={{ display: "grid", gap: 10 }}>
            {combineSuggestions.map((suggestion) => (
              <div
                key={suggestion.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: 12,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #dbeafe",
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 4 }}>
                    {suggestion.username}
                  </div>
                  <div style={{ color: "#374151", fontSize: 13 }}>
                    주문 {suggestion.rows.length}건 / 총 수량{" "}
                    {suggestion.totalQuantity}개
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>
                    기존 주문:{" "}
                    {suggestion.orderNumbers.map(shortOrderNumber).join(", ")}
                  </div>
                  <div style={{ color: "#1d4ed8", fontSize: 13, marginTop: 3 }}>
                    새 주문번호: {suggestion.combinedOrderNumber}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCombineShipping(suggestion)}
                  style={{
                    padding: "9px 13px",
                    borderRadius: 10,
                    border: "0",
                    background: "#2563eb",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  합배송
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};

const memoInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 200,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 13,
  lineHeight: 1.4,
  resize: "vertical",
};
