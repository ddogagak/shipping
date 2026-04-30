"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
};

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return date.toISOString().slice(0, 10);
}

function shippingMethodLabel(value: string | null) {
  const map: Record<string, string> = {
    "k-packet": "K-Packet",
    egs: "EGS",
    check: "Check",
  };

  return value ? map[value] || value : "-";
}

function orderStatusLabel(value: string | null) {
  const map: Record<string, string> = {
    ready: "처리 가능",
    pending: "확인 필요",
    refund: "환불 필요",
    contact: "문의 필요",
    cancelled: "취소",
    completed: "완료",
  };

  return value ? map[value] || value : "-";
}

function shippingLabelStatusLabel(value: string | null) {
  const map: Record<string, string> = {
    not_exported: "엑셀 미추출",
    exported: "엑셀 추출",
    reserved: "예약 완료",
    accepted: "접수 완료",
    tracking_added: "운송장 입력",
    shipped: "발송 완료",
    issue: "문제 있음",
  };

  return value ? map[value] || value : "-";
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: 999,
        background: "#f3f4f6",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function OrdersClient({ rows }: { rows: OrderListRow[] }) {
  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState<Set<string>>(
    () => new Set()
  );

  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const visibleOrderNumbers = useMemo(
    () => rows.map((row) => row.order_number),
    [rows]
  );

  const selectedRows = useMemo(() => {
    return rows.filter((row) => selectedOrderNumbers.has(row.order_number));
  }, [rows, selectedOrderNumbers]);

  const selectedKPacketRows = useMemo(() => {
    return selectedRows.filter((row) => {
      const method = row.label_shipping_method || row.shipping_method;
      return method === "k-packet";
    });
  }, [selectedRows]);

  const selectedNotKPacketRows = selectedRows.length - selectedKPacketRows.length;

  const allVisibleChecked =
    rows.length > 0 &&
    visibleOrderNumbers.every((orderNumber) =>
      selectedOrderNumbers.has(orderNumber)
    );

  const partlyChecked =
    rows.some((row) => selectedOrderNumbers.has(row.order_number)) &&
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

  function handleExportKPacket() {
    if (!selectedKPacketRows.length) {
      alert("K-Packet 주문을 선택해줘.");
      return;
    }

    alert(
      `선택된 K-Packet 주문 ${selectedKPacketRows.length}건.\n` +
        "다음 단계에서 여기 버튼에 엑셀 다운로드 API를 연결하면 돼."
    );
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
            현재 조건: {rows.length}건 / 선택: {selectedRows.length}건 / K-Packet 선택:{" "}
            {selectedKPacketRows.length}건
          </p>

          {selectedNotKPacketRows > 0 ? (
            <p style={{ color: "#b45309", margin: "6px 0 0", fontSize: 13 }}>
              선택한 주문 중 K-Packet이 아닌 주문 {selectedNotKPacketRows}건은
              K-Packet 엑셀 추출에서 제외됩니다.
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
            선택 K-Packet 엑셀 추출
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
            minWidth: 1200,
          }}
        >
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={thStyle}>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                  />
                  선택
                </label>
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
              <th style={thStyle}>상품목록</th>
            </tr>
          </thead>

          <tbody>
            {rows.length ? (
              rows.map((row) => {
                const checked = selectedOrderNumbers.has(row.order_number);

                return (
                  <tr
                    key={row.order_number}
                    style={{
                      background: checked ? "#eff6ff" : "#fff",
                    }}
                  >
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(row.order_number)}
                      />
                    </td>
                    <td style={tdStyle}>{formatDate(row.sale_date)}</td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{row.order_number}</td>
                    <td style={tdStyle}>{row.username || "-"}</td>
                    <td style={tdStyle}>{row.name || "-"}</td>
                    <td style={tdStyle}>
                      {row.country_code || "-"}
                      {row.country ? ` · ${row.country}` : ""}
                    </td>
                    <td style={tdStyle}>{row.quantity ?? 0}</td>
                    <td style={tdStyle}>
                      <StatusBadge>
                        {shippingMethodLabel(
                          row.label_shipping_method || row.shipping_method
                        )}
                      </StatusBadge>
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge>{orderStatusLabel(row.order_status)}</StatusBadge>
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge>
                        {shippingLabelStatusLabel(row.shipping_label_status)}
                      </StatusBadge>
                    </td>
                    <td style={tdStyle}>{row.tracking_number || "-"}</td>
                    <td
                      style={{
                        ...tdStyle,
                        maxWidth: 360,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={row.item_list || ""}
                    >
                      {row.item_list || "-"}
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
    </section>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};
