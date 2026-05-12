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

const initialItems: InventoryItem[] = [
  {
    id: "1",
    item_name:
      "TVアニメ『僕のヒーローアカデミア』 Ani Art オーロラアクリルタイル",
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
    memo: "아마존 주문",
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

export default function DomesticInventoryPage() {
  const [items, setItems] =
    useState<InventoryItem[]>(initialItems);

  const [statusFilter, setStatusFilter] =
    useState<"전체" | InventoryStatus>("전체");

  const [keyword, setKeyword] = useState("");

  const [sortKey, setSortKey] = useState<
    "newest" | "oldest" | "priceHigh" | "quantityHigh"
  >("newest");

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (statusFilter !== "전체") {
      result = result.filter(
        (item) => item.status === statusFilter
      );
    }

    if (keyword.trim()) {
      const q = keyword.toLowerCase();

      result = result.filter((item) => {
        return (
          item.item_name.toLowerCase().includes(q) ||
          item.order_number.toLowerCase().includes(q) ||
          item.memo.toLowerCase().includes(q) ||
          item.tracking_number.toLowerCase().includes(q)
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

      if (sortKey === "quantityHigh") {
        return b.quantity - a.quantity;
      }

      return 0;
    });

    return result;
  }, [items, statusFilter, keyword, sortKey]);

  const updateItem = (
    id: string,
    field: keyof InventoryItem,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (
          field === "quantity" ||
          field === "yen_price" ||
          field === "shipping_fee" ||
          field === "total_price" ||
          field === "selling_price"
        ) {
          return {
            ...item,
            [field]: Number(value),
          };
        }

        return {
          ...item,
          [field]: value,
        };
      })
    );
  };

  return (
    <main style={pageStyle}>
      {/* 상단 */}
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>인벤토리</h1>

          <p style={subTextStyle}>
            DB 형태 재고/판매 관리 페이지
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
            href="/domestic-inventory-cards"
            style={linkButtonStyle}
          >
            카드형 보기
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

      {/* 검색 및 정렬 */}
      <section style={filterSectionStyle}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="상품명 / 주문번호 / 메모 검색"
          style={searchInputStyle}
        />

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

          <option value="quantityHigh">
            수량 많은순
          </option>
        </select>
      </section>

      {/* 테이블 */}
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>이미지</th>
              <th style={thStyle}>상품명</th>
              <th style={thStyle}>상태</th>
              <th style={thStyle}>주문번호</th>
              <th style={thStyle}>주문일</th>
              <th style={thStyle}>운송장</th>
              <th style={thStyle}>수량</th>
              <th style={thStyle}>엔화</th>
              <th style={thStyle}>총액</th>
              <th style={thStyle}>판매가</th>
              <th style={thStyle}>메모</th>
              <th style={thStyle}>저장</th>
            </tr>
          </thead>

          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                {/* 이미지 */}
                <td style={tdStyle}>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      style={imageStyle}
                    />
                  ) : (
                    <div style={emptyImageStyle}>
                      없음
                    </div>
                  )}
                </td>

                {/* 상품명 */}
                <td style={tdStyle}>
                  <textarea
                    value={item.item_name}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "item_name",
                        e.target.value
                      )
                    }
                    style={textareaStyle}
                  />
                </td>

                {/* 상태 */}
                <td style={tdStyle}>
                  <select
                    value={item.status}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "status",
                        e.target.value
                      )
                    }
                    style={smallSelectStyle}
                  >
                    <option value="입고전">
                      입고전
                    </option>

                    <option value="입고완료">
                      입고완료
                    </option>

                    <option value="판매중">
                      판매중
                    </option>

                    <option value="판매완료">
                      판매완료
                    </option>

                    <option value="보류">
                      보류
                    </option>
                  </select>
                </td>

                {/* 주문번호 */}
                <td style={tdStyle}>
                  <input
                    value={item.order_number}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "order_number",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </td>

                {/* 주문일 */}
                <td style={tdStyle}>
                  <input
                    value={item.order_date}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "order_date",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </td>

                {/* 운송장 */}
                <td style={tdStyle}>
                  <input
                    value={item.tracking_number}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "tracking_number",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </td>

                {/* 수량 */}
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "quantity",
                        e.target.value
                      )
                    }
                    style={numberInputStyle}
                  />
                </td>

                {/* 엔화 */}
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={item.yen_price}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "yen_price",
                        e.target.value
                      )
                    }
                    style={numberInputStyle}
                  />
                </td>

                {/* 총액 */}
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={item.total_price}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "total_price",
                        e.target.value
                      )
                    }
                    style={numberInputStyle}
                  />
                </td>

                {/* 판매가 */}
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={item.selling_price}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "selling_price",
                        e.target.value
                      )
                    }
                    style={numberInputStyle}
                  />
                </td>

                {/* 메모 */}
                <td style={tdStyle}>
                  <textarea
                    value={item.memo}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "memo",
                        e.target.value
                      )
                    }
                    style={memoTextareaStyle}
                  />
                </td>

                {/* 저장 */}
                <td style={tdStyle}>
                  <button
                    type="button"
                    style={saveButtonStyle}
                  >
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
  fontWeight: 600,
  cursor: "pointer",
};

const filterSectionStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 18,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  height: 42,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "0 12px",
  fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  width: 180,
  height: 42,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "0 10px",
  fontSize: 14,
};

const tableWrapperStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1800,
};

const thStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#f3f4f6",
  padding: 12,
  textAlign: "left",
  fontSize: 13,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const imageStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  objectFit: "cover",
  borderRadius: 10,
};

const emptyImageStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 10,
  background: "#f3f4f6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  color: "#9ca3af",
};

const inputStyle: React.CSSProperties = {
  width: 180,
  height: 38,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 13,
};

const numberInputStyle: React.CSSProperties = {
  width: 110,
  height: 38,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 13,
};

const textareaStyle: React.CSSProperties = {
  width: 280,
  minHeight: 80,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 10,
  fontSize: 13,
  resize: "vertical",
};

const memoTextareaStyle: React.CSSProperties = {
  width: 220,
  minHeight: 80,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 10,
  fontSize: 13,
  resize: "vertical",
};

const smallSelectStyle: React.CSSProperties = {
  width: 120,
  height: 38,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "0 8px",
  fontSize: 13,
};

const saveButtonStyle: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 8,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
