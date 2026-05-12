"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InventoryStatus =
  | "입고전"
  | "입고완료"
  | "판매중"
  | "판매완료"
  | "보류";

type InventoryItem = {
  id: string;
  item_name: string;
  item_type: string;
  series_name: string;
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
      "TV Anime My Hero Academia Trading Ani Art Vol. 8 Aurora Acrylic Tile Version B Box of 8",
    item_type: "아크릴",
    series_name: "나의히어로아카데미아",
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

const typeList = [
  "전체",
  "아크릴",
  "지류",
  "뱃지",
  "피규어",
  "키링",
  "기타",
];

const seriesList = [
  "전체",
  "헌터헌터",
  "귀멸의칼날",
  "나의히어로아카데미아",
  "프리렌",
  "진격의거인",
  "기타",
];

export default function DomesticInventoryCardsPage() {
  const [items, setItems] =
    useState<InventoryItem[]>(sampleItems);

  const [statusFilter, setStatusFilter] =
    useState<"전체" | InventoryStatus>("전체");

  const [typeFilter, setTypeFilter] =
    useState("전체");

  const [seriesFilter, setSeriesFilter] =
    useState("전체");

  const [keyword, setKeyword] = useState("");

  const [sortKey, setSortKey] = useState<
    "newest" | "oldest" | "priceHigh" | "priceLow"
  >("newest");

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (statusFilter !== "전체") {
      result = result.filter(
        (item) => item.status === statusFilter
      );
    }

    if (typeFilter !== "전체") {
      result = result.filter(
        (item) => item.item_type === typeFilter
      );
    }

    if (seriesFilter !== "전체") {
      result = result.filter(
        (item) => item.series_name === seriesFilter
      );
    }

    if (keyword.trim()) {
      const q = keyword.trim().toLowerCase();

      result = result.filter((item) => {
        return (
          item.item_name.toLowerCase().includes(q) ||
          item.order_number.toLowerCase().includes(q) ||
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

      return 0;
    });

    return result;
  }, [
    items,
    statusFilter,
    typeFilter,
    seriesFilter,
    keyword,
    sortKey,
  ]);

  const updateStatus = (
    id: string,
    nextStatus: InventoryStatus
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: nextStatus }
          : item
      )
    );
  };

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>카드형 재고관리</h1>

          <p style={subTextStyle}>
            작품 / 타입 / 상태 기준으로 재고를 관리합니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkButtonStyle}>
            메인
          </Link>

          <Link
            href="/domestic-inventory-input"
            style={darkButtonStyle}
          >
            재고입력
          </Link>

          <Link
            href="/domestic-inventory"
            style={linkButtonStyle}
          >
            인벤토리
          </Link>
        </div>
      </div>

      {/* 상태 필터 */}
      <section style={statusSectionStyle}>
        {statusList.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            style={{
              ...statusButtonStyle,
              background:
                statusFilter === status
                  ? "#111827"
                  : "#fff",
              color:
                statusFilter === status
                  ? "#fff"
                  : "#111827",
            }}
          >
            {status}
          </button>
        ))}
      </section>

      {/* 필터 */}
      <section style={filterBoxStyle}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="상품명 / 메모 검색"
          style={searchInputStyle}
        />

        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value)
          }
          style={selectStyle}
        >
          {typeList.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>

        <select
          value={seriesFilter}
          onChange={(e) =>
            setSeriesFilter(e.target.value)
          }
          style={selectStyle}
        >
          {seriesList.map((series) => (
            <option key={series}>{series}</option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) =>
            setSortKey(
              e.target.value as typeof sortKey
            )
          }
          style={selectStyle}
        >
          <option value="newest">
            최신 주문순
          </option>

          <option value="oldest">
            오래된 주문순
          </option>

          <option value="priceHigh">
            금액 높은순
          </option>

          <option value="priceLow">
            금액 낮은순
          </option>
        </select>
      </section>

      {/* 카드 */}
      {filteredItems.length === 0 ? (
        <div style={emptyStyle}>
          표시할 재고가 없습니다.
        </div>
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
                <div style={emptyImageStyle}>
                  이미지 없음
                </div>
              )}

              <div style={cardBodyStyle}>
                <div style={badgeRowStyle}>
                  <span style={seriesBadgeStyle}>
                    {item.series_name}
                  </span>

                  <span style={typeBadgeStyle}>
                    {item.item_type}
                  </span>

                  <span style={statusBadgeStyle(item.status)}>
                    {item.status}
                  </span>
                </div>

                <h2 style={itemNameStyle}>
                  {item.item_name}
                </h2>

                <div style={infoBoxStyle}>
                  <InfoRow
                    label="주문일"
                    value={item.order_date}
                  />

                  <InfoRow
                    label="수량"
                    value={`${item.quantity}`}
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

                  <InfoRow
                    label="운송장"
                    value={
                      item.tracking_number || "미입력"
                    }
                  />
                </div>

                <div style={memoStyle}>
                  {item.memo || "메모 없음"}
                </div>

                <div style={buttonGridStyle}>
                  <button
                    type="button"
                    onClick={() =>
                      updateStatus(
                        item.id,
                        "입고완료"
                      )
                    }
                    style={miniButtonStyle}
                  >
                    입고완료
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateStatus(
                        item.id,
                        "판매중"
                      )
                    }
                    style={miniButtonStyle}
                  >
                    판매중
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateStatus(
                        item.id,
                        "판매완료"
                      )
                    }
                    style={miniDarkButtonStyle}
                  >
                    판매완료
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateStatus(
                        item.id,
                        "보류"
                      )
                    }
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

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoRowStyle}>
      <span style={{ color: "#6b7280" }}>
        {label}
      </span>

      <strong>{value}</strong>
    </div>
  );
}

function statusBadgeStyle(
  status: InventoryStatus
): React.CSSProperties {
  return {
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
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
  marginBottom: 20,
  gap: 16,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 800,
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

const statusSectionStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 14,
  flexWrap: "wrap",
};

const statusButtonStyle: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  fontWeight: 700,
  cursor: "pointer",
};

const filterBoxStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
  flexWrap: "wrap",
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 220,
  height: 42,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  width: 170,
  height: 42,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 14,
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow:
    "0 8px 20px rgba(15, 23, 42, 0.06)",
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
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const seriesBadgeStyle: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "#eef2ff",
  fontSize: 12,
  fontWeight: 800,
};

const typeBadgeStyle: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "#fef3c7",
  fontSize: 12,
  fontWeight: 800,
};

const itemNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.5,
  minHeight: 46,
};

const infoBoxStyle: React.CSSProperties = {
  background: "#f9fafb",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 13,
};

const memoStyle: React.CSSProperties = {
  minHeight: 40,
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
  fontWeight: 700,
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
  borderRadius: 14,
  padding: 40,
  textAlign: "center",
  color: "#6b7280",
};
