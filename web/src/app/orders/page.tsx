import Link from "next/link";

import { createServiceRoleClient } from "@/lib/supabase/server";
import OrdersClient, { type OrderListRow } from "./OrdersClient";

export const dynamic = "force-dynamic";

type PageSearchParams = Record<string, string | string[] | undefined>;

type EbayOrderRow = {
  id: string;
  sale_date: string | null;
  order_number: string;
  username: string | null;
  name: string | null;
  country: string | null;
  country_code: string | null;
  quantity: number | null;
  shipping_method: string | null;
  order_status: string | null;
  created_at: string | null;
};

type EbayShippingRow = {
  order_number: string;
  shipping_method: string | null;
  shipping_label_status: string | null;
  tracking_number: string | null;
};

type EbayItemRow = {
  order_number: string;
  item_list: string | null;
  stockout_item_indexes: number[] | null;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function orderStatusLabel(value: string | null) {
  const map: Record<string, string> = {
    ready: "처리 가능",
    pending: "확인 필요",
    refund: "환불 필요",
    contact: "문의 필요",
    cancelled: "취소",
    completed: "완료",
  };

  return value ? map[value] || value : "-";
}

function shippingLabelStatusLabel(value: string | null) {
  const map: Record<string, string> = {
    not_exported: "엑셀 미추출",
    exported: "CSV 추출",
    reserved: "예약 완료",
    accepted: "접수 완료",
    tracking_added: "운송장 입력",
    shipped: "발송 완료",
    issue: "문제 있음",
  };

  return value ? map[value] || value : "-";
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: active ? "#fff" : "#111827",
        background: active ? "#111827" : "#fff",
        border: "1px solid #d1d5db",
        padding: "8px 12px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {children}
    </Link>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};

  const method = firstParam(params.method) || "all";
  const orderStatus = firstParam(params.order_status) || "all";
  const labelStatus = firstParam(params.label_status) || "all";
  const q = firstParam(params.q).trim();

  const currentParams = {
    method,
    order_status: orderStatus,
    label_status: labelStatus,
    q,
  };

  function buildHref(updates: Partial<typeof currentParams>) {
    const next = {
      ...currentParams,
      ...updates,
    };

    const urlParams = new URLSearchParams();

    if (next.method && next.method !== "all") {
      urlParams.set("method", next.method);
    }

    if (next.order_status && next.order_status !== "all") {
      urlParams.set("order_status", next.order_status);
    }

    if (next.label_status && next.label_status !== "all") {
      urlParams.set("label_status", next.label_status);
    }

    if (next.q) {
      urlParams.set("q", next.q);
    }

    const query = urlParams.toString();
    return query ? `/orders?${query}` : "/orders";
  }

  const supabase = createServiceRoleClient();

  const { data: orderRows, error: orderError } = await supabase
    .from("ebay_order")
    .select(
      "id, sale_date, order_number, username, name, country, country_code, quantity, shipping_method, order_status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const orders = (orderRows || []) as EbayOrderRow[];
  const orderNumbers = orders.map((row) => row.order_number).filter(Boolean);

  let shippingRows: EbayShippingRow[] = [];
  let itemRows: EbayItemRow[] = [];
  let shippingError: unknown = null;
  let itemError: unknown = null;

  if (orderNumbers.length) {
    const shippingResult = await supabase
      .from("ebay_shipping")
      .select("order_number, shipping_method, shipping_label_status, tracking_number")
      .in("order_number", orderNumbers);

    shippingRows = (shippingResult.data || []) as EbayShippingRow[];
    shippingError = shippingResult.error;

    const itemResult = await supabase
      .from("ebay_order_item")
      .select("order_number, item_list, stockout_item_indexes")
      .in("order_number", orderNumbers);

    itemRows = (itemResult.data || []) as EbayItemRow[];
    itemError = itemResult.error;
  }

  const shippingMap = new Map(
    shippingRows.map((row) => [row.order_number, row])
  );

  const itemMap = new Map(itemRows.map((row) => [row.order_number, row]));

  const mergedRows: OrderListRow[] = orders.map((order) => {
    const shipping = shippingMap.get(order.order_number);
    const item = itemMap.get(order.order_number);

    return {
      id: order.id,
      sale_date: order.sale_date,
      order_number: order.order_number,
      username: order.username,
      name: order.name,
      country: order.country,
      country_code: order.country_code,
      quantity: order.quantity,
      shipping_method: order.shipping_method,
      order_status: order.order_status,
      label_shipping_method: shipping?.shipping_method || order.shipping_method || "check",
      shipping_label_status: shipping?.shipping_label_status || "not_exported",
      tracking_number: shipping?.tracking_number || null,
      item_list: item?.item_list || null,
      stockout_item_indexes: item?.stockout_item_indexes || [],
    };
  });

  const filteredRows = mergedRows.filter((row) => {
    const rowMethod = row.label_shipping_method || row.shipping_method || "check";

    if (method !== "all" && rowMethod !== method) {
      return false;
    }

    if (orderStatus !== "all" && row.order_status !== orderStatus) {
      return false;
    }

    if (labelStatus !== "all" && row.shipping_label_status !== labelStatus) {
      return false;
    }

    if (q) {
      const haystack = [
        row.order_number,
        row.username,
        row.name,
        row.country,
        row.country_code,
        row.item_list,
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(q.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  const totalCount = mergedRows.length;
  const kpacketCount = mergedRows.filter(
    (row) => row.label_shipping_method === "k-packet"
  ).length;
  const egsCount = mergedRows.filter(
    (row) => row.label_shipping_method === "egs"
  ).length;
  const checkCount = mergedRows.filter(
    (row) => row.label_shipping_method === "check"
  ).length;

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: 24 }}>
      <section
        className="card"
        style={{
          padding: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Overseas Order</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>
              eBay 주문 배송관리 화면입니다.
            </p>
          </div>

          <Link
            href="/"
            style={{
              textDecoration: "none",
              border: "1px solid #d1d5db",
              padding: "8px 12px",
              borderRadius: 10,
              color: "#111827",
              fontWeight: 700,
            }}
          >
            메인으로
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginTop: 20,
          }}
        >
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>전체 주문</div>
            <strong style={summaryNumberStyle}>{totalCount}</strong>
          </div>

          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>K-Packet</div>
            <strong style={summaryNumberStyle}>{kpacketCount}</strong>
          </div>

          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>EGS</div>
            <strong style={summaryNumberStyle}>{egsCount}</strong>
          </div>

          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Check</div>
            <strong style={summaryNumberStyle}>{checkCount}</strong>
          </div>
        </div>
      </section>

      <section
        className="card"
        style={{
          marginTop: 16,
          padding: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>필터</h2>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>배송방식</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FilterLink href={buildHref({ method: "all" })} active={method === "all"}>
                전체
              </FilterLink>
              <FilterLink
                href={buildHref({ method: "k-packet" })}
                active={method === "k-packet"}
              >
                K-Packet
              </FilterLink>
              <FilterLink href={buildHref({ method: "egs" })} active={method === "egs"}>
                EGS
              </FilterLink>
              <FilterLink href={buildHref({ method: "check" })} active={method === "check"}>
                Check
              </FilterLink>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>주문상태</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["all", "ready", "pending", "refund", "contact", "cancelled", "completed"].map(
                (status) => (
                  <FilterLink
                    key={status}
                    href={buildHref({ order_status: status })}
                    active={orderStatus === status}
                  >
                    {status === "all" ? "전체" : orderStatusLabel(status)}
                  </FilterLink>
                )
              )}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>라벨상태</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                "all",
                "not_exported",
                "exported",
                "reserved",
                "accepted",
                "tracking_added",
                "shipped",
                "issue",
              ].map((status) => (
                <FilterLink
                  key={status}
                  href={buildHref({ label_status: status })}
                  active={labelStatus === status}
                >
                  {status === "all" ? "전체" : shippingLabelStatusLabel(status)}
                </FilterLink>
              ))}
            </div>
          </div>

          <form
            action="/orders"
            method="get"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            {method !== "all" ? <input type="hidden" name="method" value={method} /> : null}
            {orderStatus !== "all" ? (
              <input type="hidden" name="order_status" value={orderStatus} />
            ) : null}
            {labelStatus !== "all" ? (
              <input type="hidden" name="label_status" value={labelStatus} />
            ) : null}

            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="주문번호, username, 수취인, 국가, 상품 검색"
              style={{
                flex: "1 1 320px",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                fontSize: 14,
              }}
            />

            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "0",
                background: "#111827",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              검색
            </button>

            <Link
              href="/orders"
              style={{
                textDecoration: "none",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                color: "#111827",
                fontWeight: 800,
              }}
            >
              초기화
            </Link>
          </form>
        </div>
      </section>

      {orderError || shippingError || itemError ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#fee2e2",
            color: "#991b1b",
            marginTop: 16,
            fontWeight: 700,
          }}
        >
          주문 데이터를 불러오는 중 일부 오류가 발생했습니다.
        </div>
      ) : null}

      <OrdersClient rows={filteredRows} />
    </main>
  );
}

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 28,
};
