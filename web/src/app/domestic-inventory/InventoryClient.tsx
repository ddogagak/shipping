"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InventoryItem = {
  id: string | number;
  item_name: string | null;
  item_type: string | null;
  series_name: string | null;
  image_url: string | null;
  order_number: string | null;
  order_date: string | null;
  tracking_number: string | null;
  quantity: number | null;
  yen_price: number | null;
  shipping_fee: number | null;
  domestic_shipping_fee: number | null;
  total_price: number | null;
  status: string | null;
  memo: string | null;
};

const statusList = ["전체", "입고전", "해외배송", "입고완료", "판매중", "판매완료", "보류"];
const typeList = ["전체", "아크릴", "지류", "뱃지", "피규어", "키링", "기타"];
const seriesList = ["전체", "헌터헌터", "귀멸의칼날", "나의히어로아카데미아", "프리렌", "진격의거인", "기타"];

export default function InventoryClient({ initialItems }: { initialItems: InventoryItem[] }) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("전체");
  const [type, setType] = useState("전체");
  const [series, setSeries] = useState("전체");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const q = keyword.trim().toLowerCase();

      const matchKeyword =
        !q ||
        String(item.item_name ?? "").toLowerCase().includes(q) ||
        String(item.order_number ?? "").toLowerCase().includes(q) ||
        String(item.tracking_number ?? "").toLowerCase().includes(q) ||
        String(item.memo ?? "").toLowerCase().includes(q);

      const matchStatus = status === "전체" || item.status === status;
      const matchType = type === "전체" || item.item_type === type;
      const matchSeries = series === "전체" || item.series_name === series;

      return matchKeyword && matchStatus && matchType && matchSeries;
    });
  }, [items, keyword, status, type, series]);

  const updateItem = (id: string | number, field: keyof InventoryItem, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (
          field === "quantity" ||
          field === "yen_price" ||
          field === "shipping_fee" ||
          field === "domestic_shipping_fee" ||
          field === "total_price"
        ) {
          return { ...item, [field]: Number(value) };
        }

        return { ...item, [field]: value };
      })
    );
  };

  const saveItem = async (item: InventoryItem) => {
    setMessage("");

    const res = await fetch(`/api/domestic-inventory/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    const result = await res.json();

    if (!res.ok || !result.ok) {
      setMessage(result.message || "저장 실패");
      return;
    }

    setMessage("저장 완료");
  };

  const saveTracking = async (item: InventoryItem) => {
    const next = {
      ...item,
      status: item.tracking_number ? "해외배송" : item.status,
    };

    setItems((prev) => prev.map((x) => (x.id === item.id ? next : x)));
    await saveItem(next);
  };

  return (
    <main style={pageStyle}>
      <div style={topStyle}>
        <div>
          <h1 style={{ margin: 0 }}>인벤토리</h1>
          <p style={{ color: "#6b7280" }}>재고 DB 조회 / 수정 / 운송장 입력</p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkStyle}>메인</Link>
          <Link href="/domestic-inventory-input" style={linkStyle}>재고입력</Link>
          <Link href="/domestic-inventory-cards" style={linkStyle}>카드형</Link>
        </div>
      </div>

      <section style={filterStyle}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="상품명 / 주문번호 / 운송장 / 메모 검색"
          style={searchStyle}
        />

        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          {statusList.map((v) => <option key={v}>{v}</option>)}
        </select>

        <select value={series} onChange={(e) => setSeries(e.target.value)} style={selectStyle}>
          {seriesList.map((v) => <option key={v}>{v}</option>)}
        </select>

        <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
          {typeList.map((v) => <option key={v}>{v}</option>)}
        </select>
      </section>

      {message ? <div style={messageStyle}>{message}</div> : null}

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>이미지</th>
              <th style={thStyle}>상품명</th>
              <th style={thStyle}>작품명</th>
              <th style={thStyle}>타입</th>
              <th style={thStyle}>상태</th>
              <th style={thStyle}>수량</th>
              <th style={thStyle}>총액</th>
              <th style={thStyle}>일본내배송비</th>
              <th style={thStyle}>주문번호</th>
              <th style={thStyle}>주문일</th>
              <th style={thStyle}>운송장</th>
              <th style={thStyle}>메모</th>
              <th style={thStyle}>저장</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td style={tdStyle}>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" style={imgStyle} />
                  ) : (
                    <div style={emptyImgStyle}>IMG</div>
                  )}
                </td>

                <td style={tdStyle}>
                  <textarea
                    value={item.item_name ?? ""}
                    onChange={(e) => updateItem(item.id, "item_name", e.target.value)}
                    style={textareaStyle}
                  />
                </td>

                <td style={tdStyle}>
                  <select
                    value={item.series_name ?? "기타"}
                    onChange={(e) => updateItem(item.id, "series_name", e.target.value)}
                    style={inputStyle}
                  >
                    {seriesList.filter((v) => v !== "전체").map((v) => <option key={v}>{v}</option>)}
                  </select>
                </td>

                <td style={tdStyle}>
                  <select
                    value={item.item_type ?? "기타"}
                    onChange={(e) => updateItem(item.id, "item_type", e.target.value)}
                    style={inputStyle}
                  >
                    {typeList.filter((v) => v !== "전체").map((v) => <option key={v}>{v}</option>)}
                  </select>
                </td>

                <td style={tdStyle}>
                  <select
                    value={item.status ?? "입고전"}
                    onChange={(e) => updateItem(item.id, "status", e.target.value)}
                    style={inputStyle}
                  >
                    {statusList.filter((v) => v !== "전체").map((v) => <option key={v}>{v}</option>)}
                  </select>
                </td>

                <td style={tdStyle}>
                  <input
                    type="number"
                    value={item.quantity ?? 1}
                    onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                    style={numStyle}
                  />
                </td>

                <td style={tdStyle}>
                  <input
                    type="number"
                    value={item.total_price ?? 0}
                    onChange={(e) => updateItem(item.id, "total_price", e.target.value)}
                    style={numStyle}
                  />
                </td>

                <td style={tdStyle}>
                  <input
                    type="number"
                    value={item.domestic_shipping_fee ?? 0}
                    onChange={(e) => updateItem(item.id, "domestic_shipping_fee", e.target.value)}
                    style={numStyle}
                  />
                </td>

                <td style={tdStyle}>
                  <input
                    value={item.order_number ?? ""}
                    onChange={(e) => updateItem(item.id, "order_number", e.target.value)}
                    style={inputStyle}
                  />
                </td>

                <td style={tdStyle}>
                  <input
                    value={item.order_date ?? ""}
                    onChange={(e) => updateItem(item.id, "order_date", e.target.value)}
                    style={inputStyle}
                  />
                </td>

                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={item.tracking_number ?? ""}
                      onChange={(e) => updateItem(item.id, "tracking_number", e.target.value)}
                      style={inputStyle}
                    />
                    <button type="button" onClick={() => saveTracking(item)} style={smallBtnStyle}>
                      운송장
                    </button>
                  </div>
                </td>

                <td style={tdStyle}>
                  <textarea
                    value={item.memo ?? ""}
                    onChange={(e) => updateItem(item.id, "memo", e.target.value)}
                    style={memoStyle}
                  />
                </td>

                <td style={tdStyle}>
                  <button type="button" onClick={() => saveItem(item)} style={saveBtnStyle}>
                    저장
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = { padding: 24, background: "#f9fafb", minHeight: "100vh" };
const topStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const linkStyle: React.CSSProperties = { height: 38, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 700 };
const filterStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 };
const searchStyle: React.CSSProperties = { flex: 1, minWidth: 260, height: 40, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 10px" };
const selectStyle: React.CSSProperties = { height: 40, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 10px", background: "#fff" };
const messageStyle: React.CSSProperties = { padding: 10, background: "#eef2ff", borderRadius: 10, marginBottom: 12, fontWeight: 800 };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14 };
const tableStyle: React.CSSProperties = { width: "100%", minWidth: 1800, borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { background: "#f3f4f6", padding: 10, textAlign: "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
const tdStyle: React.CSSProperties = { padding: 8, borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
const imgStyle: React.CSSProperties = { width: 64, height: 64, objectFit: "cover", borderRadius: 8 };
const emptyImgStyle: React.CSSProperties = { width: 64, height: 64, borderRadius: 8, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 };
const inputStyle: React.CSSProperties = { width: 150, height: 34, border: "1px solid #d1d5db", borderRadius: 7, padding: "0 8px", background: "#fff" };
const numStyle: React.CSSProperties = { width: 90, height: 34, border: "1px solid #d1d5db", borderRadius: 7, padding: "0 8px" };
const textareaStyle: React.CSSProperties = { width: 300, minHeight: 62, border: "1px solid #d1d5db", borderRadius: 7, padding: 8 };
const memoStyle: React.CSSProperties = { width: 200, minHeight: 62, border: "1px solid #d1d5db", borderRadius: 7, padding: 8 };
const saveBtnStyle: React.CSSProperties = { height: 34, padding: "0 12px", border: "none", borderRadius: 7, background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer" };
const smallBtnStyle: React.CSSProperties = { height: 34, padding: "0 10px", border: "none", borderRadius: 7, background: "#2563eb", color: "#fff", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
