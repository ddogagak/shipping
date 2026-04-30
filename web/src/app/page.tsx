import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createServiceRoleClient();

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
      <section>
        <h1 style={{ marginTop: 0 }}>Shipping Admin</h1>
        <p style={{ color: "#6b7280" }}>
          주문 업로드, 주문 관리, 운송장 업로드를 처리합니다.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 24,
          }}
        >
          {/* 주문 관리 */}
          <Link
            href="/orders"
            style={cardStyle("#fff", "#e5e7eb")}
          >
            <div style={titleStyle}>Overseas Order</div>
            <p style={descStyle}>
              해외 주문 조회 및 상태 관리
            </p>
          </Link>

          {/* 주문 업로드 */}
          <Link
            href="/order-upload"
            style={cardStyle("#fff8d7", "#fde68a")}
          >
            <div style={titleStyle}>Order Upload</div>
            <p style={descStyle}>
              eBay CSV 주문 업로드
            </p>
          </Link>

          {/* 운송장 업로드 */}
          <Link
            href="/tracking-upload"
            style={cardStyle("#eff6ff", "#bfdbfe")}
          >
            <div style={titleStyle}>Tracking Upload</div>
            <p style={descStyle}>
              K-Packet · EGS 운송장 매칭/업데이트
            </p>
          </Link>

          {/* 국내 */}
          <Link
            href="/domestic"
            style={cardStyle("#f9fafb", "#e5e7eb")}
          >
            <div style={titleStyle}>Domestic</div>
            <p style={descStyle}>
              국내 주문 관리
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
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

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
};

const descStyle: React.CSSProperties = {
  color: "#6b7280",
  marginBottom: 0,
};
