import Link from "next/link";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  type?: string;
  series?: string;
  sort?: string;
}>;

const statusList = [
  "전체",
  "입고전",
  "해외배송",
  "입고완료",
  "판매중",
  "판매완료",
  "보류",
];

export default async function DomesticInventoryCardsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const q = params.q ?? "";
  const status = params.status ?? "전체";
  const type = params.type ?? "전체";
  const series = params.series ?? "전체";
  const sort = params.sort ?? "latest";

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("inventory_items")
    .select("*")
    .order(sort === "price" ? "total_price" : "created_at", {
      ascending: sort === "price",
    });

  if (status !== "전체") {
    query = query.eq("status", status);
  }

  if (type !== "전체") {
    query = query.eq("item_type", type);
  }

  if (series !== "전체") {
    query = query.eq("series_name", series);
  }

  if (q.trim()) {
    query = query.or(
      `item_name.ilike.%${q}%,memo.ilike.%${q}%,order_number.ilike.%${q}%`
    );
  }

const { data, error } = await query;

if (error) {
  console.error(error);
}

const items = data ?? [];

const totalCount = items.length;
const totalYen = items.reduce(
    (sum, item) => sum + (item.total_price ?? 0),
    0
  );

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>국내 재고 카드 관리</h1>
          <p style={subTextStyle}>
            재고 상태 / 작품 / 타입 기준으로 카드형 관리
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

      <form method="GET" style={filterBarStyle}>
        <input
          name="q"
          defaultValue={q}
          placeholder="상품명 / 주문번호 / 메모 검색"
          style={searchInputStyle}
        />

        <select
          name="status"
          defaultValue={status}
          style={selectStyle}
        >
          {statusList.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>

        <select
          name="type"
          defaultValue={type}
          style={selectStyle}
        >
          {[
            "전체",
            "아크릴",
            "지류",
            "뱃지",
            "피규어",
            "키링",
            "기타",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>

        <select
          name="series"
          defaultValue={series}
          style={selectStyle}
        >
          {[
            "전체",
            "헌터헌터",
            "귀멸의칼날",
            "나의히어로아카데미아",
            "프리렌",
            "진격의거인",
            "기타",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>

        <select
          name="sort"
          defaultValue={sort}
          style={selectStyle}
        >
          <option value="latest">최신순</option>
          <option value="price">금액순</option>
        </select>

        <button type="submit" style={searchButtonStyle}>
          적용
        </button>
      </form>

      <div style={summaryRowStyle}>
        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>전체 재고</div>
          <div style={summaryValueStyle}>{totalCount}</div>
        </div>

        <div style={summaryCardStyle}>
          <div style={summaryLabelStyle}>총 금액</div>
          <div style={summaryValueStyle}>
            ¥{totalYen.toLocaleString()}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={emptyStyle}>
          조건에 맞는 재고가 없습니다.
        </div>
      ) : (
        <section style={gridStyle}>
          {items.map((item) => (
            <article key={item.id} style={cardStyle}>
              <div style={imageWrapStyle}>
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    style={imageStyle}
                  />
                ) : (
                  <div style={emptyImageStyle}>NO IMAGE</div>
                )}

                <div style={statusBadgeStyle(item.status)}>
                  {item.status}
                </div>
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

                <div style={itemNameStyle}>
                  {item.item_name}
                </div>

                <div style={infoGridStyle}>
                  <InfoItem
                    label="수량"
                    value={String(item.quantity ?? 1)}
                  />

                  <InfoItem
                    label="금액"
                    value={`¥${(
                      item.total_price ?? 0
                    ).toLocaleString()}`}
                  />

                  <InfoItem
                    label="주문일"
                    value={item.order_date || "-"}
                  />

                  <InfoItem
                    label="주문번호"
                    value={item.order_number || "-"}
                  />
                </div>

                <div style={trackingBoxStyle}>
                  <strong>운송장</strong>
                  <div style={trackingValueStyle}>
                    {item.tracking_number || "-"}
                  </div>
                </div>

                {item.memo ? (
                  <div style={memoStyle}>
                    {item.memo}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
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

const searchButtonStyle: React.CSSProperties = {
  height: 42,
  padding: "0 18px",
  borderRadius: 10,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 20,
};

const summaryCardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
  minWidth: 180,
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const summaryValueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 900,
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
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
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

const statusBadgeStyle = (
  status: string
): React.CSSProperties => ({
  position: "absolute",
  top: 12,
  right: 12,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background:
    status === "판매완료"
      ? "#dcfce7"
      : status === "입고완료"
      ? "#dbeafe"
      : status === "해외배송"
      ? "#fef3c7"
      : "#fee2e2",
});

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

const infoLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
};

const infoValueStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  fontWeight: 700,
  wordBreak: "break-all",
};

const trackingBoxStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  background: "#f3f4f6",
};

const trackingValueStyle: React.CSSProperties = {
  marginTop: 6,
  fontWeight: 700,
  wordBreak: "break-all",
};

const memoStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#fff7ed",
  fontSize: 13,
  lineHeight: 1.5,
};
