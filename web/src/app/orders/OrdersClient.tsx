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
};

type RowDraftKey =
  | "shipping_method"
  | "order_status"
  | "shipping_label_status";

type RowDraft = Partial<Record<RowDraftKey, string>>;

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

export default function OrdersClient({ rows }: { rows: OrderListRow[] }) {
  const [localRows, setLocalRows] = useState<OrderListRow[]>(rows);

  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState<Set<string>>(
    () => new Set()
  );

  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});

  const [savingRowOrderNumber, setSavingRowOrderNumber] = useState<
    string | null
  >(null);

  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLocalRows(rows);
    setRowDrafts({});
  }, [rows]);

  const visibleOrderNumbers = useMemo(
    () => localRows.map((row) => row.order_number),
    [localRows]
  );

  const selectedRows = useMemo(() => {
    return localRows.filter((row) => selectedOrderNumbers.has(row.order_number));
  }, [localRows, selectedOrderNumbers]);

  const selectedKPacketRows = useMemo(() => {
    return selectedRows.filter((row) => {
      const method = row.label_shipping_method || row.shipping_method;
      return method === "k-packet";
    });
  }, [selectedRows]);

  const selectedNotKPacketRows =
    selectedRows.length - selectedKPacketRows.length;

  const allVisibleChecked =
    localRows.length > 0 &&
    visibleOrderNumbers.every((orderNumber) =>
      selectedOrderNumbers.has(orderNumber)
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

    if (draftValue) {
      return draftValue;
    }

    if (key === "shipping_method") {
      return row.label_shipping_method || row.shipping_method || "check";
    }

    if (key === "order_status") {
      return row.order_status || "accepted";
    }

    return row.shipping_label_status || "start";
  }

  function isRowChanged(row: OrderListRow): boolean {
    const draft = rowDrafts[row.order_number];

    if (!draft) return false;

    const savedShippingMethod =
      row.label_shipping_method || row.shipping_method || "check";
    const savedOrderStatus = row.order_status || "accepted";
    const savedLabelStatus = row.shipping_label_status || "start";

    const shippingMethodChanged =
      typeof draft.shipping_method === "string" &&
      draft.shipping_method !== savedShippingMethod;

    const orderStatusChanged =
      typeof draft.order_status === "string" &&
      draft.order_status !== savedOrderStatus;

    const shippingLabelStatusChanged =
      typeof draft.shipping_label_status === "string" &&
      draft.shipping_label_status !== savedLabelStatus;

    return (
      shippingMethodChanged || orderStatusChanged || shippingLabelStatusChanged
    );
  }

  function changeRowDraft(
    orderNumber: string,
    key: RowDraftKey,
    value: string
  ) {
    setRowDrafts((prev) => ({
      ...prev,
      [orderNumber]: {
        ...prev[orderNumber],
        [key]: value,
      },
    }));
  }

  async function saveRow(row: OrderListRow) {
    if (!isRowChanged(row)) return;

    const shippingMethod = getRowDraftValue(row, "shipping_method");
    const orderStatus = getRowDraftValue(row, "order_status");
    const shippingLabelStatus = getRowDraftValue(
      row,
      "shipping_label_status"
    );

    setSavingRowOrderNumber(row.order_number);

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
        }),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => null);

        throw new Error(
          errorResult?.detail || errorResult?.error || "주문 행 저장 실패"
        );
      }

      const result = await response.json();

      setLocalRows((prevRows) =>
        prevRows.map((targetRow) => {
          if (targetRow.order_number !== row.order_number) {
            return targetRow;
          }

          return {
            ...targetRow,
            shipping_method: result.shipping_method,
            label_shipping_method: result.shipping_method,
            order_status: result.order_status,
            shipping_label_status: result.shipping_label_status,
          };
        })
      );

      setRowDrafts((prev) => {
        const next = { ...prev };
        delete next[row.order_number];
        return next;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(error);
      alert("저장 오류: " + message);
    } finally {
      setSavingRowOrderNumber(null);
    }
  }

  async function toggleStockoutItem(
    orderNumber: string,
    itemIndex: number,
    checked: boolean
  ) {
    setLocalRows((prevRows) =>
      prevRows.map((row) => {
        if (row.order_number !== orderNumber) return row;

        const current = new Set(row.stockout_item_indexes || []);

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
      })
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
            "재고없음 상태 저장 실패"
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
        })
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
        "추출 후 라벨상태가 'CSV 추출'로 변경됩니다."
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
          errorResult?.detail ||
            errorResult?.error ||
            "K-Packet CSV 추출 실패"
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

  function handleCompleteShipping() {
    if (!selectedRows.length) {
      alert("배송완료 처리할 주문을 선택해줘.");
      return;
    }

    alert(
      `선택된 주문 ${selectedRows.length}건.\n` +
        "다음 단계에서 배송완료 처리 API를 연결하면 돼."
    );
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
          <h2 style={{ margin: 0 }}>주문 목록</h2>
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
            disabled={!selectedRows.length}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "0",
              background: selectedRows.length ? "#16a34a" : "#9ca3af",
              color: "#fff",
              fontWeight: 800,
              cursor: selectedRows.length ? "pointer" : "not-allowed",
            }}
          >
            배송완료 처리
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
            disabled
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              color: "#6b7280",
              fontWeight: 800,
            }}
          >
            운송장 업로드 준비중
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            minWidth: 1300,
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
              <th style={thStyle}>주문일</th>
              <th style={thStyle}>주문번호</th>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>수취인</th>
              <th style={thStyle}>국가</th>
              <th style={thStyle}>수량</th>
              <th style={thStyle}>배송방식</th>
              <th style={thStyle}>주문상태</th>
              <th style={thStyle}>라벨상태</th>
              <th style={thStyle}>운송장번호</th>
              <th style={thStyle}>저장</th>
              <th style={thStyle}>상품목록</th>
            </tr>
          </thead>

          <tbody>
            {localRows.length ? (
              localRows.map((row) => {
                const checked = selectedOrderNumbers.has(row.order_number);
                const itemList = formatItemList(row.item_list);
                const changed = isRowChanged(row);

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
                      style={{ ...tdStyle, fontWeight: 800 }}
                      title={row.order_number}
                    >
                      {shortOrderNumber(row.order_number)}
                    </td>

                    <td style={tdStyle}>{row.username || "-"}</td>
                    <td style={tdStyle}>{row.name || "-"}</td>
                    <td style={tdStyle}>{row.country_code || "-"}</td>
                    <td style={tdStyle}>{row.quantity ?? 0}</td>

                    <td style={tdStyle}>
                      <select
                        value={getRowDraftValue(row, "shipping_method")}
                        onChange={(event) =>
                          changeRowDraft(
                            row.order_number,
                            "shipping_method",
                            event.target.value
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
                            event.target.value
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
                            event.target.value
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
                          !changed || savingRowOrderNumber === row.order_number
                        }
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "0",
                          background: changed ? "#111827" : "#d1d5db",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor:
                            changed &&
                            savingRowOrderNumber !== row.order_number
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
                        maxWidth: 620,
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
                                        event.target.checked
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
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={13}
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
