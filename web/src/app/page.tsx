import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Shipping Admin (Web)</h1>
        <p>메뉴를 선택하세요.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Link href="/domestic" className="card" style={{ textDecoration: "none", fontSize: 24, fontWeight: 700, textAlign: "center" }}>
            Domestic Order
          </Link>
          <Link href="/orders" className="card" style={{ textDecoration: "none", fontSize: 24, fontWeight: 700, textAlign: "center" }}>
            Overseas Order
          </Link>
        </div>
      </div>
    </main>
  );
}
