import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Shipping Admin (Web)</h1>
        <p>이 앱은 Supabase DB 기반 주문관리 사이트의 기초 구조입니다.</p>
        <p>
          주문 목록은 <Link href="/orders">/orders</Link> 페이지에서 확인할 수 있습니다.
        </p>
      </div>
    </main>
  );
}
