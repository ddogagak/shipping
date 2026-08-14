"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InventoryItem = {
  id: string;
  item_name: string | null;
  item_type: string | null;
  series_name: string | null;
  image_url: string | null;
  lineup_image_url: string | null;
  source_url: string | null;
  quantity: number | null;
  total_price: number | null;
  currency: string | null;
  purchase_price: number | null;
  domestic_shipping_fee: number | null;
  status: string | null;
  memo: string | null;
  component_count: number | null;
  unit_sale_price: number | null;
};

const statusList = [
  "입고전",
  "해외배송",
  "입고완료",
  "판매중",
  "판매완료",
  "보류",
];

const filterStatusList = [
  "판매완료/보류 제외",
  "전체",
  ...statusList,
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

export default function InventoryCardsClient({
  initialItems = [],
}: {
  initialItems?: InventoryItem[];
}) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems ?? []);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("판매완료/보류 제외");
  const [type, setType] = useState("전체");
  const [series, setSeries] = useState("전체");

  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lineupImage, setLineupImage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return (items ?? []).filter((item) => {
      const keyword = q.trim().toLowerCase();

      const matchKeyword =
        !keyword ||
        String(item.item_name ?? "").toLowerCase().includes(keyword) ||
        String(item.memo ?? "").toLowerCase().includes(keyword);

      const matchStatus =
        status === "전체" ||
        (status === "판매완료/보류 제외" &&
          item.status !== "판매완료" &&
          item.status !== "보류") ||
        item.status === status;

      const matchType = type === "전체" || item.item_type === type;
      const matchSeries = series === "전체" || item.series_name === series;

      return matchKeyword && matchStatus && matchType && matchSeries;
    });
  }, [items, q, status, type, series]);

  const updateItem = (
    id: string,
    field: keyof InventoryItem,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (
          field === "component_count" ||
          field === "unit_sale_price" ||
          field === "purchase_price"
        ) {
          return {
            ...item,
            [field]: value === "" ? null : Number(value),
          };
        }

        if (field === "status") {
          return {
            ...item,
            status: value,
          };
        }

        return item;
      })
    );
  };

  const saveItem = async (item: InventoryItem) => {
    setMessage("");
    setSavingId(item.id);
    setSavedId(null);

    try {
      const res = await fetch(`/api/domestic-inventory/items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(item),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.message || "저장 실패");
      }

      setMessage("저장 완료");
      setSavedId(item.id);

      setTimeout(() => {
        setSavedId((current) => (current === item.id ? null : current));
      }, 1800);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "저장 실패";

      setMessage(errorMessage);
      alert(errorMessage);
    } finally {
      setSavingId(null);
    }
  };

  const saveStatusImmediately = async (
    item: InventoryItem,
    nextStatus: string
  ) => {
    const nextItem: InventoryItem = {
      ...item,
      status: nextStatus,
    };

    setItems((prev) =>
      prev.map((prevItem) =>
        prevItem.id === item.id ? nextItem : prevItem
      )
    );

    await saveItem(nextItem);
  };

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>국내 재고 카드 관리</h1>
          <p style={subTextStyle}>
            카드별 상태 / 구성품 / 판매가 수정 및 수익 계산
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkButtonStyle}>
            메인
          </Link>
          <Link href="/domestic-inventory-input" style={linkButtonStyle}>
            재고 입력
          </Link>
          <Link href="/domestic-inventory" style={linkButtonStyle}>
            인벤토리
          </Link>
        </div>
      </div>

      <section style={filterBarStyle}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="상품명 / 메모 검색"
          style={searchInputStyle}
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={selectStyle}
        >
          {filterStatusList.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={selectStyle}
        >
          {typeList.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>

        <select
          value={series}
          onChange={(e) => setSeries(e.target.value)}
          style={selectStyle}
        >
          {seriesList.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </section>

      {message ? <div style={messageStyle}>{message}</div> : null}

      {filtered.length === 0 ? (
        <div style={emptyStyle}>조건에 맞는 재고가 없습니다.</div>
      ) : (
        <section style={gridStyle}>
          {filtered.map((item) => {
            const profitInfo = calcInventoryProfit(item);

            return (
              <article key={item.id} style={cardStyle}>
                <div style={imageWrapStyle}>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      style={{
                        ...imageStyle,
                        cursor: item.lineup_image_url ? "zoom-in" : "default",
                      }}
                      title={item.lineup_image_url ? "더블클릭: 라인업 보기" : undefined}
                      onDoubleClick={() => {
                        if (item.lineup_image_url) {
                          setLineupImage(item.lineup_image_url);
                        }
                      }}
                    />
                  ) : (
                    <div style={emptyImageStyle}>NO IMAGE</div>
                  )}

                  <select
                    value={item.status || "입고전"}
                    onChange={(e) =>
                      saveStatusImmediately(item, e.target.value)
                    }
                    disabled={savingId === item.id}
                    style={statusSelectStyle}
                  >
                    {statusList.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>

                <div style={cardBodyStyle}>
                  <div style={badgeRowStyle}>
                    <span style={seriesBadgeStyle}>
                      {item.series_name || "기타"}
                    </span>
                    <span style={typeBadgeStyle}>
                      {item.item_type || "기타"}
                    </span>
                  </div>

                  <div style={itemNameStyle}>{item.item_name}</div>

                  <div style={infoGridStyle}>
                    <InfoItem
                      label="수량"
                      value={String(item.quantity ?? 1)}
                    />

                    <InfoItem
                      label="구매가"
                      value={`${formatCurrencySymbol(item.currency)}${Number(
                        item.purchase_price ?? item.total_price ?? 0
                      ).toLocaleString()}`}
                    />

                    <InfoItem
                      label="원가"
                      value={
                        (item.currency || "JPY") === "JPY"
                          ? formatWon(profitInfo.cost)
                          : "환율 계산 미설정"
                      }
                    />

                    <EditableInfoItem
                      label="박스당 팩 수"
                      value={item.component_count}
                      onChange={(value) =>
                        updateItem(item.id, "component_count", value)
                      }
                    />

                    <InfoItem
                      label="낱개가격"
                      value={
                        (item.currency || "JPY") === "JPY"
                          ? formatNullableWon(profitInfo.unitPrice)
                          : "-"
                      }
                    />

                    <InfoItem
                      label="최소마진가격"
                      value={
                        (item.currency || "JPY") === "JPY"
                          ? formatNullableWon(profitInfo.minMarginPrice)
                          : "-"
                      }
                    />

                    <EditableInfoItem
                      label="개당판매가"
                      value={item.unit_sale_price}
                      onChange={(value) =>
                        updateItem(item.id, "unit_sale_price", value)
                      }
                    />

                    <InfoItem
                      label="이익"
                      value={
                        (item.currency || "JPY") === "JPY"
                          ? formatNullableWon(profitInfo.profit)
                          : "-"
                      }
                      highlight={
                        (item.currency || "JPY") === "JPY" &&
                        profitInfo.profit !== null
                      }
                    />
                  </div>

                  {item.memo ? <div style={memoStyle}>{item.memo}</div> : null}

                  {(item.source_url || item.lineup_image_url) ? (
                    <div style={quickLinkRowStyle}>
                      {item.source_url ? (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                          style={quickLinkStyle}
                        >
                          소싱 페이지
                        </a>
                      ) : null}
                      {item.lineup_image_url ? (
                        <button
                          type="button"
                          onClick={() => setLineupImage(item.lineup_image_url)}
                          style={quickLinkButtonStyle}
                        >
                          라인업 보기
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => saveItem(item)}
                    disabled={savingId === item.id}
                    style={{
                      ...saveButtonStyle,
                      opacity: savingId === item.id ? 0.6 : 1,
                      background:
                        savedId === item.id
                          ? "#16a34a"
                          : saveButtonStyle.background,
                    }}
                  >
                    {savingId === item.id
                      ? "저장 중..."
                      : savedId === item.id
                      ? "저장완료"
                      : "저장"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {lineupImage ? (
        <div
          style={lineupModalBackdropStyle}
          onClick={() => setLineupImage(null)}
        >
          <img
            src={lineupImage}
            alt="라인업"
            style={lineupModalImageStyle}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </main>
  );
}

function calcInventoryProfit(item: {
  purchase_price?: number | null;
  total_price?: number | null;
  domestic_shipping_fee?: number | null;
  component_count?: number | null;
  unit_sale_price?: number | null;
}) {
  const yenPrice = Number(item.purchase_price ?? item.total_price ?? 0);
  const domesticShipping = Number(item.domestic_shipping_fee ?? 0);
  const componentCount = Number(item.component_count ?? 0);
  const unitSalePrice = Number(item.unit_sale_price ?? 0);

  const cost =
    (yenPrice + domesticShipping * (yenPrice / 23000)) * 10 +
    40000 * (yenPrice / 23000);

  const roundedCost = Math.round(cost);

  const unitPrice =
    componentCount > 0 ? Math.ceil((cost * 1.2) / componentCount) : null;

  const minMarginPrice =
    componentCount > 0
      ? Math.ceil((cost * 1.2) / componentCount + 10000 / componentCount)
      : null;

  const profit =
    componentCount > 0 && unitSalePrice > 0 && unitPrice !== null
      ? Math.round((unitSalePrice - unitPrice) * componentCount)
      : null;

  return {
    cost: roundedCost,
    unitPrice,
    minMarginPrice,
    profit,
  };
}

function formatCurrencySymbol(currency?: string | null) {
  return currency === "CNY" ? "CNY " : "¥";
}

function formatWon(value: number) {
  if (Number.isNaN(value)) return "-";
  return `${Math.round(value).toLocaleString()}원`;
}

function formatNullableWon(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value).toLocaleString()}원`;
}

function InfoItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={highlight ? highlightedInfoItemStyle : infoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function EditableInfoItem({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <div style={editableInfoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="-"
        style={miniInputStyle}
      />
    </div>
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
  gap: 16,
  marginBottom: 20,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 900,
};

const subTextStyle: React.CSSProperties = {
  marginTop: 6,
  color: "#6b7280",
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
  fontWeight: 700,
};

const filterBarStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 20,
  padding: 16,
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  background: "#fff",
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 220,
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
};

const selectStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
};

const messageStyle: React.CSSProperties = {
  padding: 12,
  marginBottom: 16,
  borderRadius: 12,
  background: "#eef2ff",
  fontWeight: 800,
};

const emptyStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 40,
  textAlign: "center",
  color: "#6b7280",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  overflow: "hidden",
};

const imageWrapStyle: React.CSSProperties = {
  position: "relative",
  aspectRatio: "1 / 1",
  background: "#f3f4f6",
};

const imageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const emptyImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#9ca3af",
  fontWeight: 700,
};

const statusSelectStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  height: 32,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #fca5a5",
  background: "#fee2e2",
  fontSize: 12,
  fontWeight: 800,
};

const cardBodyStyle: React.CSSProperties = {
  padding: 16,
};

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 10,
};

const seriesBadgeStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  fontSize: 12,
  fontWeight: 800,
};

const typeBadgeStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "#fef3c7",
  fontSize: 12,
  fontWeight: 800,
};

const itemNameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1.45,
  minHeight: 44,
};

const infoGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 14,
};

const infoItemStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f9fafb",
};

const highlightedInfoItemStyle: React.CSSProperties = {
  ...infoItemStyle,
  background: "#ecfdf5",
};

const editableInfoItemStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#f9fafb",
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
};

const infoValueStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  fontWeight: 800,
  wordBreak: "break-all",
};

const miniInputStyle: React.CSSProperties = {
  width: "100%",
  height: 30,
  marginTop: 4,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "0 8px",
  fontSize: 13,
  fontWeight: 800,
};

const memoStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#fff7ed",
  fontSize: 13,
  lineHeight: 1.5,
};


const quickLinkRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  flexWrap: "wrap",
};

const quickLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 800,
};

const quickLinkButtonStyle: React.CSSProperties = {
  ...quickLinkStyle,
  cursor: "pointer",
};

const lineupModalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  cursor: "zoom-out",
};

const lineupModalImageStyle: React.CSSProperties = {
  maxWidth: "95vw",
  maxHeight: "92vh",
  objectFit: "contain",
  borderRadius: 12,
  background: "#fff",
};

const saveButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  marginTop: 14,
  border: "none",
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
