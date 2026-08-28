import Link from "next/link";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
        <p style={{ color: "#6b7280" }}>주문 업로드, 주문 관리, 운송장 업로드, 재고 관리를 처리합니다.</p>

        <h2 style={sectionTitleMarginStyle}>Overseas</h2>
        <div style={gridStyle}>
          <Link href="/orders" style={cardStyle()}><div style={titleStyle}>Overseas Order</div><p style={descStyle}>해외 주문 조회 및 상태 관리</p></Link>
          <Link href="/order-upload" style={cardStyle()}><div style={titleStyle}>Order Upload</div><p style={descStyle}>eBay CSV 주문 업로드</p><p style={metaStyle}>Last update: {formatDate(lastOrderUpload?.created_at)}</p><p style={metaStyle}>Last order: {formatDate(latestOrder?.sale_date)}</p></Link>
          <Link href="/tracking-upload" style={cardStyle()}><div style={titleStyle}>Tracking Upload</div><p style={descStyle}>K-Packet · EGS 운송장 매칭/업데이트</p><p style={metaStyle}>Last update: {formatDate(lastTrackingUpload?.created_at)}</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}>Domestic</h2>
        <div style={gridStyle}>
          <Link href="/domestic-upload" style={cardStyle()}><div style={titleStyle}>Domestic Upload</div><p style={descStyle}>국내 주문 텍스트 업로드/엑셀 추출</p></Link>
          <Link href="/domestic-orders" style={cardStyle()}><div style={titleStyle}>Domestic Orders</div><p style={descStyle}>국내 주문 조회 및 상태 관리</p></Link>
          <Link href="/domestic-tracking" style={cardStyle()}><div style={titleStyle}>Domestic Tracking</div><p style={descStyle}>국내 운송장 매칭/업데이트</p></Link>
          <Link href="/archive" style={cardStyle()}><div style={titleStyle}>보관소</div><p style={descStyle}>PDF / 엑셀 파일을 업로드하고 내려받습니다.</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}>Inventory</h2>
        <div style={gridStyle}>
          <Link href="/domestic-inventory-input" style={cardStyle()}><div style={titleStyle}>Inventory Input</div><p style={descStyle}>주문내역 / 이미지 URL 기반 재고 등록</p></Link>
          <Link href="/domestic-inventory-cards" style={cardStyle()}><div style={titleStyle}>Inventory Cards</div><p style={descStyle}>카드형 이미지 기반 재고 관리</p></Link>
          <Link href="/domestic-inventory" style={cardStyle()}><div style={titleStyle}>Inventory DB</div><p style={descStyle}>DB 테이블 형태 전체 재고 관리</p></Link>
          <Link href="/sourcing-research" style={cardStyle()}><div style={titleStyle}>Sourcing Research</div><p style={descStyle}>사입 전 상품 링크, 원가, 예상 판매가를 저장하고 이윤을 계산합니다.</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}>Purchase</h2>
        <div style={gridStyle}>
          <Link href="/purchases" style={cardStyle()}><div style={titleStyle}>매입관리</div><p style={descStyle}>실제 구매 · 증빙 · 배송 · 입고 관리</p></Link>
          <Link href="/purchases/import" style={cardStyle()}><div style={titleStyle}>매입 엑셀 등록</div><p style={descStyle}>Taobao 주문 엑셀을 매입 DB로 등록</p></Link>
          <Link href="/sale-inventory" style={cardStyle()}><div style={titleStyle}>방송 판매재고</div><p style={descStyle}>입고완료 상품 · 라인업 · 판매가 · 판매수량 관리</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}>STOCK</h2>
        <div style={gridStyle}>
          <Link href="/stock" style={cardStyle()}><div style={titleStyle}>STOCK 조회</div><p style={descStyle}>등록된 상품과 재고를 조회하고 수정합니다.</p></Link>
          <Link href="/stock/import" style={cardStyle()}><div style={titleStyle}>재고 등록</div><p style={descStyle}>사진을 업로드해 상품 초안을 만들고 등록합니다.</p></Link>
        </div>
      </section>
    </main>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function cardStyle(): React.CSSProperties { return { textDecoration:"none",color:"#111111",padding:20,border:"2px solid #0047FF",borderRadius:16,background:"#FEFF5A",display:"block",transition:"0.15s ease",boxShadow:"0 3px 0 #0047FF",boxSizing:"border-box" }; }
const sectionTitleMarginStyle:React.CSSProperties={marginTop:28,marginBottom:12};
const gridStyle:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:12};
const titleStyle:React.CSSProperties={fontSize:22,fontWeight:800};
const descStyle:React.CSSProperties={color:"#6b7280",marginBottom:8};
const metaStyle:React.CSSProperties={color:"#6b7280",fontSize:13,margin:"4px 0 0"};
