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

  return order.process_status
    ? map[order.process_status] || order.process_status
    : "-";
}

function OrderPreviewList({
  orders,
  type,
}: {
  orders: OrderRow[];
  type: "domestic" | "overseas";
}) {
  if (!orders.length) {
    return <p style={{ color: "#6b7280" }}>현재 처리할 주문이 없습니다.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {orders.map((order) => (
        <div key={order.id} style={{ border: "1px solid #e5e7eb", padding: 12 }}>
          <strong>
            {type === "domestic"
              ? order.customer_nickname || order.recipient_name
              : order.order_no || order.recipient_name}
          </strong>

          <div style={{ fontSize: 13, color: "#6b7280" }}>
            {formatDate(order.order_date || order.created_at)}
          </div>

          <div style={{ marginTop: 6 }}>
            {type === "domestic" ? (
              <>
                {platformLabel(order.platform)} · {order.item_summary}
              </>
            ) : (
              <>
                {order.recipient_name} · {order.country_code}
              </>
            )}
          </div>

          <div style={{ fontSize: 13, color: "#6b7280" }}>
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

  const { data: domesticRows } = await supabase
    .from("orders")
    .select("*")
    .eq("order_type", "domestic")
    .neq("workflow_status", "delivered")
    .limit(5);

  const { data: overseasRows } = await supabase
    .from("orders")
    .select("*")
    .or("order_type.eq.overseas,order_type.is.null")
    .not("shipping_status", "in", "(shipped)")
    .limit(5);

  return (
    <main style={{ padding: 32 }}>
      <h1>Shipping Admin</h1>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <Link href="/domestic">Domestic Order</Link>
        <Link href="/orders">Overseas Order</Link>
        <Link href="/domestic">Domestic Input</Link>
        <Link href="/order-upload">Overseas Import</Link>
      </div>

      <h2>국내 주문</h2>
      <OrderPreviewList orders={(domesticRows || []) as any} type="domestic" />

      <h2>해외 주문</h2>
      <OrderPreviewList orders={(overseasRows || []) as any} type="overseas" />
    </main>
  );
}
