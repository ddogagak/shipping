import Link from "next/link";

import { createServiceRoleClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createServiceRoleClient();

  const { data: lastOrderUpload } = await supabase
    .from("admin_activity_log")
    .select("created_at")
    .eq("activity_type", "order_upload")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastTrackingUpload } = await supabase
    .from("admin_activity_log")
    .select("created_at")
    .eq("activity_type", "tracking_upload")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestOrder } = await supabase
    .from("ebay_order")
    .select("sale_date")
    .order("sale_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
      <section>
        <h1 style={{ marginTop: 0 }}>Shipping Admin</h1>
        <p style={{ color: "#6b7280" }}>
          주문 업로드, 주문 관리, 운송장 업로드를 처리합니다.
        </p>

        <h2 style={{ marginTop: 28, marginBottom: 12 }}>Overseas</h2>
        <div style={gridStyle}>
          <Link href="/orders" style={cardStyle("#fff", "#e5e7eb")}>
            <div style={titleStyle}>Overseas Order</div>
            <p style={descStyle}>해외 주문 조회 및 상태 관리</p>
          </Link>

          <Link href="/order-upload" style={cardStyle("#fff8d7", "#fde68a")}>
            <div style={titleStyle}>Order Upload</div>
            <p style={descStyle}>eBay CSV 주문 업로드</p>
            <p style={metaStyle}>
              Last update: {formatDate(lastOrderUpload?.created_at)}
            </p>
            <p style={metaStyle}>
              Last order: {formatDate(latestOrder?.sale_date)}
            </p>
          </Link>

          <Link href="/tracking-upload" style={cardStyle("#eff6ff", "#bfdbfe")}>
            <div style={titleStyle}>Tracking Upload</div>
            <p style={descStyle}>K-Packet · EGS 운송장 매칭/업데이트</p>
            <p style={metaStyle}>
              Last update: {formatDate(lastTrackingUpload?.created_at)}
            </p>
          </Link>
        </div>

        <h2 style={{ marginTop: 28, marginBottom: 12 }}>Domestic</h2>
        <div style={gridStyle}>
          <Link href="/domestic-upload" style={cardStyle("#f9fafb", "#e5e7eb")}>
            <div style={titleStyle}>Domestic Upload</div>
            <p style={descStyle}>국내 주문 텍스트 업로드/엑셀 추출</p>
          </Link>

          <Link href="/domestic-orders" style={cardStyle("#f9fafb", "#e5e7eb")}>
            <div style={titleStyle}>Domestic Orders</div>
            <p style={descStyle}>국내 주문 조회 및 상태 관리</p>
          </Link>

          <Link
            href="/domestic-tracking"
            style={cardStyle("#f9fafb", "#e5e7eb")}
          >
            <div style={titleStyle}>Domestic Tracking</div>
            <p style={descStyle}>국내 운송장 매칭/업데이트</p>
          </Link>

          <Link href="/archive" style={cardStyle("#fff", "#e5e7eb")}>
            <div style={titleStyle}>보관소</div>
            <p style={descStyle}>
              PDF / 엑셀 파일을 업로드하고 내려받습니다.
            </p>
          </Link>

          
        </div>
      </section>
    </main>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function cardStyle(bg: string, border: string): React.CSSProperties {
  return {
    textDecoration: "none",
    color: "inherit",
    padding: 20,
    border: `1px solid ${border}`,
    borderRadius: 16,
    background: bg,
    display: "block",
  };
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
};

const descStyle: React.CSSProperties = {
  color: "#6b7280",
  marginBottom: 8,
};

const metaStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  margin: "4px 0 0",
};
