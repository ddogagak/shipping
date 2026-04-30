import Link from "next/link";

import { createServiceRoleClient } from "@/lib/supabase/server";

type OrderRow = {
  id: string;
  order_no: string | null;
  order_date: string | null;
  platform: string | null;
  order_type: string | null;
  workflow_status: string | null;
  process_status: string | null;
  shipping_status: string | null;
  customer_nickname: string | null;
  item_summary: string | null;
  recipient_name: string | null;
  country_code: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return date.toISOString().slice(0, 10);
}

function platformLabel(value: string | null) {
  const map: Record<string, string> = {
    wise: "와이스",
    bunjang: "번개장터",
    x: "X",
    ebay: "eBay",
  };

  return value ? map[value] || value : "-";
}

function domesticStatusLabel(value: string | null) {
  const map: Record<string, string> = {
    order_input: "주문 입력",
    address_input: "주소입력",
    tracking_input: "운송장입력",
    delivered: "배송완료",
  };

  return value ? map[value] || value : "-";
}

function overseasStatusLabel(order: OrderRow) {
  if (order.shipping_status && order.shipping_status !== "not_exported") {
    const map: Record<string, string> = {
      exported: "엑셀출력",
      reserved: "예약완료",
      accepted: "접수완료",
      tracking_added: "운송장입력",
      shipped: "발송완료",
      issue: "배송문제",
    };

    return map[order.shipping_status] || order.shipping_status;
  }

  const map: Record<string, string> = {
    ready: "바로처리",
    pending: "보류",
    refund: "환불필요",
    contact: "문의중",
    cancelled: "취소완료",
    completed: "처리완료",
  };

  return order.process_status ? map[order.process_status] || order.process_status : "-";
}

function OrderPreviewList({
  orders,
  type,
}: {
  orders: OrderRow[];
  type: "domestic" | "overseas";
}) {
  if (!orders.length) {
    return <p style={{ color: "#6b7280", margin: 0 }}>현재 처리할 주문이 없습니다.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10, maxHeight: 260, overflowY: "auto" }}>
      {orders.map((order) => (
        <div
          key={order.id}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong>
              {type === "domestic"
                ? order.customer_nickname || order.recipient_name || "이름 없음"
                : order.order_no || order.recipient_name || "주문번호 없음"}
            </strong>
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              {formatDate(order.order_date || order.created_at)}
            </span>
          </div>

          <div style={{ marginTop: 6, color: "#374151", fontSize: 14 }}>
            {type === "domestic" ? (
              <>
                <span>{platformLabel(order.platform)}</span>
                {" · "}
                <span>{order.item_summary || "상품요약 없음"}</span>
              </>
            ) : (
              <>
                <span>{order.recipient_name || "수취인 없음"}</span>
                {" · "}
                <span>{order.country_code || "-"}</span>
              </>
            )}
          </div>

          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            상태:{" "}
            {type === "domestic"
              ? domesticStatusLabel(order.workflow_status)
              : overseasStatusLabel(order)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function HomePage() {
  const supabase = createServiceRoleClient();

  const { data: domesticRows, error: domesticError } = await supabase
    .from("orders")
    .select(
      "id, order_no, order_date, platform, order_type, workflow_status, process_status, shipping_status, customer_nickname, item_summary, recipient_name, country_code, created_at"
    )
    .eq("order_type", "domestic")
    .neq("workflow_status", "delivered")
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: domesticCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("order_type", "domestic")
    .neq("workflow_status", "delivered");

  const { data: overseasRows, error: overseasError } = await supabase
    .from("orders")
    .select(
      "id, order_no, order_date, platform, order_type, workflow_status, process_status, shipping_status, customer_nickname, item_summary, recipient_name, country_code, created_at"
    )
    .or("order_type.eq.overseas,order_type.is.null")
    .not("shipping_status", "in", "(shipped)")
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: overseasCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .or("order_type.eq.overseas,order_type.is.null")
    .not("shipping_status", "in", "(shipped)");

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Shipping Admin</h1>
        <p style={{ color: "#6b7280" }}>주문 입력, 주문 처리, 배송 상태를 관리합니다.</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 24,
          }}
        >
          <Link
            href="/domestic"
            className="card"
            style={{
              textDecoration: "none",
              color: "inherit",
              padding: 20,
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Domestic Order</div>
            <p style={{ color: "#6b7280", marginBottom: 0 }}>
              국내 주문 조회 및 배송완료 처리
            </p>
          </Link>

          <Link
            href="/orders"
            className="card"
            style={{
              textDecoration: "none",
              color: "inherit",
              padding: 20,
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Overseas Order</div>
            <p style={{ color: "#6b7280", marginBottom: 0 }}>
              해외 주문 조회 및 배송상태 처리
            </p>
          </Link>

          <Link
            href="/domestic"
            className="card"
            style={{
              textDecoration: "none",
              color: "inherit",
              padding: 20,
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              background: "#f9fafb",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Domestic Input</div>
            <p style={{ color: "#6b7280", marginBottom: 0 }}>
              와이스 · 번개장터 · X 주문 입력
            </p>
          </Link>

          <a
            href="https://ddogagak.github.io/shipping/"
            target="_blank"
            rel="noreferrer"
            className="card"
            style={{
              textDecoration: "none",
              color: "inherit",
              padding: 20,
              border: "1px solid #fde68a",
              borderRadius: 16,
              background: "#fff8d7",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Overseas Import</div>
            <p style={{ color: "#6b7280", marginBottom: 0 }}>
              eBay CSV/PDF 입력 및 K-Packet 출력
            </p>
          </a>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 16,
          marginTop: 18,
        }}
      >
        <div
          className="card"
          style={{
            padding: 20,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ marginTop: 0 }}>처리할 국내 주문</h2>
            <strong style={{ fontSize: 28 }}>{domesticCount ?? 0}</strong>
          </div>

          {domesticError ? (
            <p style={{ color: "#b91c1c" }}>국내 주문을 불러오지 못했습니다.</p>
          ) : (
            <OrderPreviewList orders={(domesticRows || []) as OrderRow[]} type="domestic" />
          )}
        </div>

        <div
          className="card"
          style={{
            padding: 20,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ marginTop: 0 }}>처리할 해외 주문</h2>
            <strong style={{ fontSize: 28 }}>{overseasCount ?? 0}</strong>
          </div>

          {overseasError ? (
            <p style={{ color: "#b91c1c" }}>해외 주문을 불러오지 못했습니다.</p>
          ) : (
            <OrderPreviewList orders={(overseasRows || []) as OrderRow[]} type="overseas" />
          )}
        </div>
      </section>
    </main>
  );
}
