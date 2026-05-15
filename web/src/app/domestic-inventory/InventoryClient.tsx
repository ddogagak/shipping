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

  const [trackingFilter, setTrackingFilter] =
    useState("전체");

  const [message, setMessage] = useState("");


  const filtered = useMemo(() => {
  return items.filter((item) => {
    const q = keyword.trim().toLowerCase();

    const matchKeyword =
      !q ||
      String(item.item_name ?? "")
        .toLowerCase()
        .includes(q) ||

      String(item.order_number ?? "")
        .toLowerCase()
        .includes(q) ||

      String(item.tracking_number ?? "")
        .toLowerCase()
        .includes(q) ||

      String(item.memo ?? "")
        .toLowerCase()
        .includes(q);

    const matchStatus =
      status === "전체" ||
      item.status === status;

    const matchType =
      type === "전체" ||
      item.item_type === type;

    const matchSeries =
      series === "전체" ||
      item.series_name === series;

    const matchTracking =
      trackingFilter === "전체" ||

      (
        trackingFilter === "운송장없음" &&
        !item.tracking_number
      ) ||

      (
        trackingFilter === "운송장있음" &&
        !!item.tracking_number
      );

    return (
      matchKeyword &&
      matchStatus &&
      matchType &&
      matchSeries &&
      matchTracking
    );
  });
}, [
  items,
  keyword,
  status,
  type,
  series,
  trackingFilter,
]);


  

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

    try {
      const res = await fetch(`/api/domestic-inventory/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.message || "저장 실패");
      }

      setMessage("저장 완료");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    }
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

        <select
          value={trackingFilter}
          onChange={(e) =>
            setTrackingFilter(e.target.value)
          }
          style={selectStyle}
        >
          <option>전체</option>
          <option>운송장없음</option>
          <option>운송장있음</option>
        </select>


        
      </section>

      {message ? <div style={messageStyle}>{message}</div> : null}

      <section style={listStyle}>
        {filtered.length === 0 ? (
          <div style={emptyStyle}>조건에 맞는 재고가 없습니다.</div>
        ) : (
          filtered.map((item) => (
            <article key={item.id} style={cardStyle}>
              <div style={imageWrapStyle}>
                {item.image_url ? (
                  <img src={item.image_url} alt="" style={imgStyle} />
                ) : (
                  <div style={emptyImgStyle}>IMG</div>
                )}
              </div>

              <div style={bodyStyle}>
                <div style={badgeRowStyle}>
                  <span style={badgeStyle}>{item.series_name || "기타"}</span>
                  <span style={typeBadgeStyle}>{item.item_type || "기타"}</span>
                  <span style={statusBadgeStyle}>{item.status || "입고전"}</span>
                </div>

                <label style={labelStyle}>
                  상품명
                  <textarea
                    value={item.item_name ?? ""}
                    onChange={(e) => updateItem(item.id, "item_name", e.target.value)}
                    style={titleTextareaStyle}
                  />
                </label>

                <div style={grid4Style}>
                  <FieldSelect
                    label="작품명"
                    value={item.series_name ?? "기타"}
                    options={seriesList.filter((v) => v !== "전체")}
                    onChange={(value) => updateItem(item.id, "series_name", value)}
                  />

                  <FieldSelect
                    label="타입"
                    value={item.item_type ?? "기타"}
                    options={typeList.filter((v) => v !== "전체")}
                    onChange={(value) => updateItem(item.id, "item_type", value)}
                  />

                  <FieldSelect
                    label="상태"
                    value={item.status ?? "입고전"}
                    options={statusList.filter((v) => v !== "전체")}
                    onChange={(value) => updateItem(item.id, "status", value)}
                  />

                  <FieldInput
                    label="수량"
                    type="number"
                    value={String(item.quantity ?? 1)}
                    onChange={(value) => updateItem(item.id, "quantity", value)}
                  />
                </div>

                <div style={grid4Style}>
                  <FieldInput
                    label="총액(¥)"
                    type="number"
                    value={String(item.total_price ?? 0)}
                    onChange={(value) => updateItem(item.id, "total_price", value)}
                  />

                  <FieldInput
                    label="일본내배송비"
                    type="number"
                    value={String(item.domestic_shipping_fee ?? 0)}
                    onChange={(value) => updateItem(item.id, "domestic_shipping_fee", value)}
                  />

                  <FieldInput
                    label="주문번호"
                    value={item.order_number ?? ""}
                    onChange={(value) => updateItem(item.id, "order_number", value)}
                  />

                  <FieldInput
                    label="주문일"
                    value={item.order_date ?? ""}
                    onChange={(value) => updateItem(item.id, "order_date", value)}
                  />
                </div>

                <div style={grid2Style}>
                  <FieldInput
                    label="운송장"
                    value={item.tracking_number ?? ""}
                    onChange={(value) => updateItem(item.id, "tracking_number", value)}
                  />

                  <FieldInput
                    label="이미지 URL"
                    value={item.image_url ?? ""}
                    onChange={(value) => updateItem(item.id, "image_url", value)}
                  />
                </div>

                <label style={labelStyle}>
                  메모
                  <textarea
                    value={item.memo ?? ""}
                    onChange={(e) => updateItem(item.id, "memo", e.target.value)}
                    style={memoStyle}
                  />
                </label>

                <div style={buttonRowStyle}>
                  <button type="button" onClick={() => saveItem(item)} style={saveBtnStyle}>
                    저장
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((v) => <option key={v}>{v}</option>)}
      </select>
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  background: "#f9fafb",
  minHeight: "100vh",
};

const topStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};

const linkStyle: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#fff",
  color: "#111827",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  fontWeight: 700,
};

const filterStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 14,
};

const searchStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 260,
  height: 40,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 10px",
};

const selectStyle: React.CSSProperties = {
  height: 40,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 10px",
  background: "#fff",
};

const messageStyle: React.CSSProperties = {
  padding: 10,
  background: "#eef2ff",
  borderRadius: 10,
  marginBottom: 12,
  fontWeight: 800,
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const cardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "120px 1fr",
  gap: 16,
  padding: 16,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
};

const imageWrapStyle: React.CSSProperties = {
  width: 120,
  height: 120,
};

const imgStyle: React.CSSProperties = {
  width: 120,
  height: 120,
  objectFit: "cover",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
};

const emptyImgStyle: React.CSSProperties = {
  width: 120,
  height: 120,
  borderRadius: 12,
  background: "#f3f4f6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#9ca3af",
  fontWeight: 800,
};

const bodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const badgeStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  fontSize: 12,
  fontWeight: 800,
};

const typeBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: "#fef3c7",
};

const statusBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: "#fee2e2",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  height: 36,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 9px",
  background: "#fff",
};

const titleTextareaStyle: React.CSSProperties = {
  minHeight: 54,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 9,
  resize: "vertical",
};

const memoStyle: React.CSSProperties = {
  minHeight: 54,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 9,
  resize: "vertical",
};

const grid4Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
  gap: 8,
};

const grid2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const saveBtnStyle: React.CSSProperties = {
  height: 38,
  padding: "0 18px",
  border: "none",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 32,
  textAlign: "center",
  color: "#6b7280",
};
