"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

type DomesticOrder = {
  order_id: string;
  platform: string;
  first_order_date: string | null;
  nickname: string | null;
  recipient_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  order_count: number | null;
  item_total_price: number | null;
  order_status: string | null;
  domestic_shipping:
    | {
        shipping_type: string | null;
        tracking_number: string | null;
        shipping_status: string | null;
      }
    | null;
};

type Row = DomesticOrder & { selected: boolean };

const HEADERS = [
  "받는분성명",
  "받는분우편번호",
  "받는분전화번호",
  "받는분주소",
  "고객주문번호",
  "품목명",
  "내품명",
  "박스수량",
  "박스타입",
  "주문건수",
  "최초주문일",
  "상품합계",
];

function formatWon(value?: number | null) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function withApostrophe(value?: string | null) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  return `'${clean}`;
}

function toExcelRow(row: DomesticOrder) {
  return {
    받는분성명: row.recipient_name || "",
    받는분우편번호: withApostrophe(row.postal_code),
    받는분전화번호: withApostrophe(row.phone),
    받는분주소: row.address || "",
    고객주문번호: row.order_id,
    품목명: "피규어",
    내품명: `도파민-${row.nickname || ""}`,
    박스수량: "1",
    박스타입: "1",
    주문건수: row.order_count || 1,
    최초주문일: row.first_order_date || "",
    상품합계: formatWon(row.item_total_price),
  };
}

export default function DomesticOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);

    const res = await fetch("/api/domestic/orders", {
      cache: "no-store",
    });

    const json = await res.json();

    setRows(
      (json.orders || []).map((row: DomesticOrder) => ({
        ...row,
        selected: false,
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const selectedRows = rows.filter((r) => r.selected);

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected: checked })));
  }

  function toggle(id: string, checked: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.order_id === id ? { ...r, selected: checked } : r
      )
    );
  }

  function exportExcel() {
    if (!selectedRows.length) {
      alert("선택 없음");
      return;
    }

    const data = selectedRows.map(toExcelRow);
    const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "국내배송");

    XLSX.writeFile(wb, "domestic.xlsx");
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1>Domestic Orders</h1>

      <div style={{ marginBottom: 12 }}>
        <button onClick={load}>새로고침</button>
        <button onClick={exportExcel} style={{ marginLeft: 8 }}>
          엑셀 추출 ({selectedRows.length})
        </button>
      </div>

      {loading ? (
        <p>로딩중...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th>주문번호</th>
              <th>닉네임</th>
              <th>수취인</th>
              <th>전화번호</th>
              <th>주소</th>
              <th>금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.order_id}>
                <td>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) =>
                      toggle(row.order_id, e.target.checked)
                    }
                  />
                </td>
                <td>{row.order_id}</td>
                <td>{row.nickname}</td>
                <td>{row.recipient_name}</td>
                <td>{row.phone}</td>
                <td>{row.address}</td>
                <td>{formatWon(row.item_total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
