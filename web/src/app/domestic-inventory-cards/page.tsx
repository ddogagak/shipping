"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InventoryStatus = "입고전" | "입고완료" | "판매중" | "판매완료" | "보류";

type InventoryItem = {
  id: string;
  item_name: string;
  image_url: string;
  order_number: string;
  order_date: string;
  tracking_number: string;
  quantity: number;
  yen_price: number;
  shipping_fee: number;
  total_price: number;
  selling_price: number;
  status: InventoryStatus;
  memo: string;
};

const sampleItems: InventoryItem[] = [
  {
    id: "1",
    item_name:
      "TVアニメ『僕のヒーローアカデミア』 Ani Art オーロラアクリルタイル ver.B 8個入りBOX",
    image_url: "",
    order_number: "503-5349977-2659005",
    order_date: "2026-05-06",
    tracking_number: "",
    quantity: 8,
    yen_price: 3784,
    shipping_fee: 0,
    total_price: 3784,
    selling_price: 0,
    status: "입고전",
    memo: "아마존 주문 샘플",
  },
];

const statusList: Array<"전체" | InventoryStatus> = [
  "전체",
  "입고전",
  "입고완료",
  "판매중",
  "판매완료",
  "보류",
];

export default function DomesticInventoryCardsPage() {
  const [items, setItems] = useState<InventoryItem[]>(sampleItems);
  const [statusFilter, setStatusFilter] =
    useState<"전체" | InventoryStatus>("전체");
  const [keyword, setKeyword] = useState("");
  const [sortKey, setSortKey] = useState<
    "newest" | "oldest" | "priceHigh" | "priceLow" | "quantityHigh"
  >("newest");

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (statusFilter !== "전체") {
      result = result.filter((item) => item.status === statusFilter);
    }

    if (keyword.trim()) {
      const q = keyword.trim().toLowerCase();

      result = result.filter((item) => {
        return (
          item.item_name.toLowerCase().includes(q) ||
          item.order_number.toLowerCase().includes(q) ||
          item.tracking_number.toLowerCase().includes(q) ||
          item.memo.toLowerCase().includes(q)
        );
      });
    }

    result.sort((a, b) => {
      if (sortKey === "newest") {
        return b.order_date.localeCompare(a.order_date);
      }

      if (sortKey === "oldest") {
        return a.order_date.localeCompare(b.order_date);
      }

      if (sortKey === "priceHigh") {
        return b.total_price - a.total_price;
      }

      if (sortKey === "priceLow") {
        return a.total_price - b.total_price;
      }

      if (sortKey === "quantityHigh") {
        return b.quantity - a.quantity;
      }

      return 0;
    });

    return result;
  }, [items, statusFilter, keyword, sortKey]);

  const counts = useMemo(() => {
    return statusList.reduce<Record<string, number>>((acc, status) => {
      if (status === "전체") {
        acc[status] = items.length;
      } else {
        acc[status] = items.filter((item) => item.status === status).length;
      }

      return acc;
    }, {});
  }, [items]);

  const updateStatus = (id: string, nextStatus: InventoryStatus) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: nextStatus } : item
      )
    );
  };

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>국내 재고 관리</h1>
          <p style={subTextStyle}>
            이미지 기반 카드로 입고/판매 상태를 관리하는 페이지
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkButtonStyle}>
            메인으로
          </Link>

          <Link href="/domestic-inventory-input" style={darkButtonStyle}>
            재고 입력
          </Link>

          <Link href="/domestic-inventory" style={linkButtonStyle}>
            인벤토리
          </Link>
        </div>
      </div>

      <section style={summaryGridStyle}>
        {statusList.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            style={{
              ...summaryCardStyle,
              border:
                statusFilter === status
                  ? "2px solid #111827"
                  : "1px solid #e5e7eb",
            }}
          >
            <span style={summaryLabelStyle}>{status}</span>
            <strong style={summaryNumberStyle}>{counts[status] ?? 0}</strong>
          </button>
        ))}
      </section>

      <section style={filterBoxStyle}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="상품명 / 주문번호 / 운송장 / 메모 검색"
          style={searchInputStyle}
        />

        <select
          value={sortKey}
          onChange={(e) =>
            setSortKey(e.target.value as typeof sortKey)
          }
          style={selectStyle}
        >
          <option value="newest">주문일 최신순</option>
          <option value="oldest">주문일 오래된순</option>
          <option value="priceHigh">금액 높은순</option>
          <option value="priceLow">금액 낮은순</option>
          <option value="quantityHigh">수량 많은순</option>
        </select>
      </section>

      {filteredItems.length === 0 ? (
        <div style={emptyStyle}>표시할 재고가 없습니다.</div>
      ) : (
        <section style={cardGridStyle}>
          {filteredItems.map((item) => (
            <article key={item.id} style={cardStyle}>
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.item_name}
                  style={imageStyle}
                />
              ) : (
                <div style={emptyImageStyle}>이미지 없음</div>
              )}

              <div style={cardBodyStyle}>
                <div style={cardHeaderStyle}>
                  <span style={statusBadgeStyle(item.status)}>
                    {item.status}
                  </span>
                  <span style={smallTextStyle}>수량 {item.quantity}</span>
                </div>

                <h2 style={itemNameStyle}>{item.item_name}</h2>

                <div style={infoBoxStyle}>
                  <InfoRow label="주문일" value={item.order_date || "-"} />
                  <InfoRow label="주문번호" value={item.order_number || "-"} />
                  <InfoRow
                    label="운송장"
                    value={item.tracking_number || "미입력"}
                  />
                  <InfoRow
                    label="금액"
                    value={`¥${item.total_price.toLocaleString()}`}
                  />
                  <InfoRow
                    label="판매가"
                    value={
                      item.selling_price
                        ? `${item.selling_price.toLocaleString()}원`
                        : "미정"
                    }
                  />
                </div>

                <div style={memoStyle}>{item.memo || "메모 없음"}</div>

                <div style={buttonGridStyle}>
                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, "입고완료")}
                    style={miniButtonStyle}
                  >
                    입고완료
                  </button>

                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, "판매중")}
                    style={miniButtonStyle}
                  >
                    판매중
                  </button>

                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, "판매완료")}
                    style={miniDarkButtonStyle}
                  >
                    판매완료
                  </button>

                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, "보류")}
                    style={miniButtonStyle}
                  >
                    보류
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRowStyle}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <strong style={{ textAlign: "right" }}>{value}</strong>
    </div>
  );
}

function statusBadgeStyle(status: InventoryStatus): React.CSSProperties {
  return {
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background:
      status === "판매완료"
        ? "#e5e7eb"
        : status === "판매중"
        ? "#dcfce7"
        : status === "입고완료"
        ? "#dbeafe"
        : status === "보류"
        ? "#fef3c7"
        : "#fee2e2",
    color: "#111827",
  };
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  background: "#f9fafb",
  minHeight: "100vh",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  margin: 0,
};

const subTextStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#6b7280",
  fontSize: 14,
};

const linkButtonStyle: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  fontSize: 14,
  fontWeight: 600,
};

const darkButtonStyle: React.CSSProperties = {
  ...linkButtonStyle,
  background: "#111827",
  color: "#fff",
  border: "1px solid #111827",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const summaryCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 14,
  cursor: "pointer",
  textAlign: "left",
};

const summaryLabelStyle: React.CSSProperties = {
  display: "block",
  color: "#6b7280",
  fontSize: 13,
  marginBottom: 4,
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 22,
};

const filterBoxStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  marginBottom: 20,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  height: 42,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  width: 180,
  height: 42,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 14,
  background: "#fff",
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
};

const imageStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  background: "#f3f4f6",
};

const emptyImageStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  background: "#f3f4f6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#9ca3af",
  fontSize: 14,
};

const cardBodyStyle: React.CSSProperties = {
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const smallTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const itemNameStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.45,
  minHeight: 44,
  margin: 0,
};

const infoBoxStyle: React.CSSProperties = {
  background: "#f9fafb",
  borderRadius: 10,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 13,
};

const memoStyle: React.CSSProperties = {
  minHeight: 38,
  background: "#fff7ed",
  borderRadius: 10,
  padding: 10,
  fontSize: 13,
  color: "#374151",
  whiteSpace: "pre-wrap",
};

const buttonGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const miniButtonStyle: React.CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const miniDarkButtonStyle: React.CSSProperties = {
  ...miniButtonStyle,
  background: "#111827",
  color: "#fff",
  border: "1px solid #111827",
};

const emptyStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 40,
  textAlign: "center",
  color: "#6b7280",
};
