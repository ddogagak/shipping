import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Shipping Admin (Web)</h1>
        <p>메뉴를 선택하세요.</p>
        <div style={{ display: "grid", gap: 12 }}>
          <h2>Domestic</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Link href="/domestic-upload" className="card" style={{ textDecoration: "none", fontSize: 20, fontWeight: 700, textAlign: "center" }}>국내 주문업로드</Link>
            <Link href="/domestic-orders" className="card" style={{ textDecoration: "none", fontSize: 20, fontWeight: 700, textAlign: "center" }}>국내 주문조회</Link>
            <Link href="/domestic-tracking" className="card" style={{ textDecoration: "none", fontSize: 20, fontWeight: 700, textAlign: "center" }}>국내 트랙킹 업로드</Link>
          </div>
          <h2>Overseas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Link href="/import" className="card" style={{ textDecoration: "none", fontSize: 20, fontWeight: 700, textAlign: "center" }}>해외 주문업로드</Link>
            <Link href="/orders" className="card" style={{ textDecoration: "none", fontSize: 20, fontWeight: 700, textAlign: "center" }}>해외 주문조회</Link>
            <Link href="/orders" className="card" style={{ textDecoration: "none", fontSize: 20, fontWeight: 700, textAlign: "center" }}>해외 트랙킹 업로드</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
