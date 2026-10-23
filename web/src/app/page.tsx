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
    <main className="ddoga-home" style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 64px" }}>
      <section>
        <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 22, marginBottom: 30 }}>
          <p style={{ color: "#4f46e5", fontSize: 12, letterSpacing: 2, fontWeight: 800, margin: "0 0 8px" }}>DDOGA ADMIN</p>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 850, letterSpacing: "-1px", color: "#111827" }}>관리 대시보드</h1>
          <p style={{ color: "#64748b", margin: "10px 0 0", fontSize: 14 }}>주문 · 재고 · 매입 · 매출을 한눈에 관리하세요.</p>
        </div>

        <h2 style={sectionTitleMarginStyle}><span style={{ background: "#eff6ff", color: "#2563eb", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 800, letterSpacing: "0.5px" }}>Overseas</span></h2>
        <div style={gridStyle}>
          <Link href="/orders" style={cardStyle("#2563eb", "#eff6ff")}><div style={titleStyle}>Overseas Order</div><p style={descStyle}>해외 주문 조회 및 상태 관리</p></Link>
          <Link href="/order-upload" style={cardStyle("#2563eb", "#eff6ff")}><div style={titleStyle}>Order Upload</div><p style={descStyle}>eBay CSV 주문 업로드</p><p style={metaStyle}>Last update: {formatDate(lastOrderUpload?.created_at)}</p><p style={metaStyle}>Last order: {formatDate(latestOrder?.sale_date)}</p></Link>
          <Link href="/tracking-upload" style={cardStyle("#2563eb", "#eff6ff")}><div style={titleStyle}>Tracking Upload</div><p style={descStyle}>K-Packet · EGS 운송장 매칭/업데이트</p><p style={metaStyle}>Last update: {formatDate(lastTrackingUpload?.created_at)}</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}><span style={{ background: "#f0fdfa", color: "#0d9488", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 800, letterSpacing: "0.5px" }}>Domestic</span></h2>
        <div style={gridStyle}>
          <Link href="/domestic-upload" style={cardStyle("#0d9488", "#f0fdfa")}><div style={titleStyle}>Domestic Upload</div><p style={descStyle}>국내 주문 텍스트 업로드/엑셀 추출</p></Link>
          <Link href="/domestic-orders" style={cardStyle("#0d9488", "#f0fdfa")}><div style={titleStyle}>Domestic Orders</div><p style={descStyle}>국내 주문 조회 및 상태 관리</p></Link>
          <Link href="/domestic-tracking" style={cardStyle("#0d9488", "#f0fdfa")}><div style={titleStyle}>Domestic Tracking</div><p style={descStyle}>국내 운송장 매칭/업데이트</p></Link>
          <Link href="/archive" style={cardStyle("#0d9488", "#f0fdfa")}><div style={titleStyle}>보관소</div><p style={descStyle}>PDF / 엑셀 파일을 업로드하고 내려받습니다.</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}><span style={{ background: "#f5f3ff", color: "#7c3aed", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 800, letterSpacing: "0.5px" }}>Inventory</span></h2>
        <div style={gridStyle}>
          <Link href="/domestic-inventory-input" style={cardStyle("#7c3aed", "#f5f3ff")}><div style={titleStyle}>Inventory Input</div><p style={descStyle}>주문내역 / 이미지 URL 기반 재고 등록</p></Link>
          <Link href="/domestic-inventory-cards" style={cardStyle("#7c3aed", "#f5f3ff")}><div style={titleStyle}>Inventory Cards</div><p style={descStyle}>카드형 이미지 기반 재고 관리</p></Link>
          <Link href="/domestic-inventory" style={cardStyle("#7c3aed", "#f5f3ff")}><div style={titleStyle}>Inventory DB</div><p style={descStyle}>DB 테이블 형태 전체 재고 관리</p></Link>
          <Link href="/sourcing-research" style={cardStyle("#7c3aed", "#f5f3ff")}><div style={titleStyle}>Sourcing Research</div><p style={descStyle}>사입 전 상품 링크, 원가, 예상 판매가를 저장하고 이윤을 계산합니다.</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}><span style={{ background: "#fff7ed", color: "#ea580c", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 800, letterSpacing: "0.5px" }}>Purchase</span></h2>
        <div style={gridStyle}>
          <Link href="/purchases" style={cardStyle("#ea580c", "#fff7ed")}><div style={titleStyle}>매입관리</div><p style={descStyle}>실제 구매 · 증빙 · 배송 · 입고 관리</p></Link>
          <Link href="/purchases/import" style={cardStyle("#ea580c", "#fff7ed")}><div style={titleStyle}>매입 엑셀 등록</div><p style={descStyle}>Taobao 주문 엑셀을 매입 DB로 등록</p></Link>
          <Link href="/sale-inventory" style={cardStyle("#ea580c", "#fff7ed")}><div style={titleStyle}>방송 판매재고</div><p style={descStyle}>입고완료 상품 · 라인업 · 판매가 · 판매수량 관리</p></Link>
          <Link href="/sales-management" style={cardStyle("#ea580c", "#fff7ed")}><div style={titleStyle}>매출관리</div><p style={descStyle}>와이스 매출 · 매입 사입을 월별/분기별로 분석</p></Link>
        </div>

        <h2 style={sectionTitleMarginStyle}><span style={{ background: "#f1f5f9", color: "#475569", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 800, letterSpacing: "0.5px" }}>STOCK</span></h2>
        <div style={gridStyle}>
          <Link href="/stock" style={cardStyle("#475569", "#f1f5f9")}><div style={titleStyle}>STOCK 조회</div><p style={descStyle}>등록된 상품과 재고를 조회하고 수정합니다.</p></Link>
          <Link href="/stock/import" style={cardStyle("#475569", "#f1f5f9")}><div style={titleStyle}>재고 등록</div><p style={descStyle}>사진을 업로드해 상품 초안을 만들고 등록합니다.</p></Link>
        </div>
      </section>
    </main>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function cardStyle(accent: string, tint: string): React.CSSProperties { return { textDecoration:"none", color:"#111827", padding:"22px 20px", border:"1px solid #e2e8f0", borderLeft:`4px solid ${accent}`, borderRadius:12, background:`linear-gradient(120deg, ${tint} 0%, #ffffff 64%)`, display:"block", transition:"0.15s ease", boxShadow:"0 2px 6px rgba(15, 23, 42, 0.055)", boxSizing:"border-box", minHeight:130 }; }
const sectionTitleMarginStyle:React.CSSProperties={marginTop:35,marginBottom:16};
const gridStyle:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:14};
const titleStyle:React.CSSProperties={fontSize:18,fontWeight:750};
const descStyle:React.CSSProperties={color:"#64748b",marginBottom:8,fontSize:13,lineHeight:1.5};
const metaStyle:React.CSSProperties={color:"#6b7280",fontSize:13,margin:"4px 0 0"};
