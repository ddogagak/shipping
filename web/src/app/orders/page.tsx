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

const SHIPPING_METHOD_OPTIONS = [
  { value: "k-packet", label: "K-Packet" },
  { value: "egs", label: "EGS" },
  { value: "check", label: "Check" },
];

const ORDER_STATUS_OPTIONS = [
  { value: "accepted", label: "주문 업로드" },
  { value: "check", label: "재고 확인" },
  { value: "pending", label: "확인 필요" },
  { value: "refund", label: "환불/취소" },
  { value: "done", label: "완료" },
];

const SHIPPING_LABEL_STATUS_OPTIONS = [
  { value: "start", label: "시작" },
  { value: "csv_exported", label: "CSV 추출" },
  { value: "created", label: "라벨작업 완료" },
  { value: "printed", label: "출력 완료" },
  { value: "uploaded", label: "운송장 업로드" },
  { value: "done", label: "배송 완료" },
];

const DEFAULT_ORDER_STATUSES = ["accepted", "check", "pending"];
const DEFAULT_LABEL_STATUSES = [
  "start",
  "csv_exported",
  "created",
  "printed",
  "uploaded",
];

const LABEL_SORT_ORDER = [
  "start",
  "csv_exported",
  "created",
  "printed",
  "uploaded",
  "done",
];

const ORDER_SORT_ORDER = ["accepted", "check", "pending", "done", "refund"];

function paramValues(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];

  return raw
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function sameValues(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((item) => bSet.has(item));
}

function orderStatusLabel(value: string | null) {
  const option = ORDER_STATUS_OPTIONS.find((item) => item.value === value);
  return option?.label || value || "-";
}

function shippingLabelStatusLabel(value: string | null) {
  const option = SHIPPING_LABEL_STATUS_OPTIONS.find((item) => item.value === value);
  return option?.label || value || "-";
}

function FilterButton({
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
        background: active ? "#2563eb" : "#fff",
        border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
        padding: "8px 12px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 800,
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

  const methodParams = paramValues(params.method);
  const orderStatusParams = paramValues(params.order_status);
  const labelStatusParams = paramValues(params.label_status);
  const q = firstParam(params.q).trim();

  const selectedMethods = methodParams;
  const selectedOrderStatuses = orderStatusParams.length
    ? orderStatusParams
    : DEFAULT_ORDER_STATUSES;
  const selectedLabelStatuses = labelStatusParams.length
    ? labelStatusParams
    : DEFAULT_LABEL_STATUSES;

  const currentParams = {
    methods: selectedMethods,
    orderStatuses: selectedOrderStatuses,
    labelStatuses: selectedLabelStatuses,
    q,
  };

  function buildHref(nextParams: {
    methods?: string[];
    orderStatuses?: string[];
    labelStatuses?: string[];
    q?: string;
  }) {
    const next = {
      ...currentParams,
      ...nextParams,
    };

    const urlParams = new URLSearchParams();

    next.methods.forEach((value) => urlParams.append("method", value));

    if (!sameValues(next.orderStatuses, DEFAULT_ORDER_STATUSES)) {
      next.orderStatuses.forEach((value) => urlParams.append("order_status", value));
    }

    if (!sameValues(next.labelStatuses, DEFAULT_LABEL_STATUSES)) {
      next.labelStatuses.forEach((value) => urlParams.append("label_status", value));
    }

    if (next.q) {
      urlParams.set("q", next.q);
    }

    const query = urlParams.toString();
    return query ? `/orders?${query}` : "/orders";
  }

  function toggleValue(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
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

  const shippingMap = new Map(shippingRows.map((row) => [row.order_number, row]));
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
      shipping_label_status: shipping?.shipping_label_status || "start",
      tracking_number: shipping?.tracking_number || null,
      item_list: item?.item_list || null,
      stockout_item_indexes: item?.stockout_item_indexes || [],
    };
  });

  const filteredRows = mergedRows
    .filter((row) => {
      const rowMethod = row.label_shipping_method || row.shipping_method || "check";
      const rowOrderStatus = row.order_status || "accepted";
      const rowLabelStatus = row.shipping_label_status || "start";

      if (selectedMethods.length && !selectedMethods.includes(rowMethod)) return false;
      if (!selectedOrderStatuses.includes(rowOrderStatus)) return false;
      if (!selectedLabelStatuses.includes(rowLabelStatus)) return false;

      if (q) {
        const haystack = [
          row.order_number,
          row.username,
          row.name,
          row.country,
          row.country_code,
          row.item_list,
          row.tracking_number,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q.toLowerCase())) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const labelA = LABEL_SORT_ORDER.indexOf(a.shipping_label_status || "start");
      const labelB = LABEL_SORT_ORDER.indexOf(b.shipping_label_status || "start");
      if (labelA !== labelB) return labelA - labelB;

      const orderA = ORDER_SORT_ORDER.indexOf(a.order_status || "accepted");
      const orderB = ORDER_SORT_ORDER.indexOf(b.order_status || "accepted");
      if (orderA !== orderB) return orderA - orderB;

      const nameCompare = String(a.name || "").localeCompare(String(b.name || ""));
      if (nameCompare !== 0) return nameCompare;

      return String(a.sale_date || "").localeCompare(String(b.sale_date || ""));
    });

  const totalCount = mergedRows.length;
  const kpacketCount = mergedRows.filter((row) => row.label_shipping_method === "k-packet").length;
  const egsCount = mergedRows.filter((row) => row.label_shipping_method === "egs").length;
  const checkCount = mergedRows.filter((row) => row.label_shipping_method === "check").length;

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: 24 }}>
      <section className="card" style={sectionStyle}>
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

      <section className="card" style={{ ...sectionStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>필터</h2>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>배송방식</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FilterButton
                href={buildHref({ methods: [] })}
                active={selectedMethods.length === 0}
              >
                전체
              </FilterButton>
              {SHIPPING_METHOD_OPTIONS.map((option) => (
                <FilterButton
                  key={option.value}
                  href={buildHref({
                    methods: toggleValue(selectedMethods, option.value),
                  })}
                  active={selectedMethods.includes(option.value)}
                >
                  {option.label}
                </FilterButton>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>주문상태</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FilterButton
                href={buildHref({ orderStatuses: DEFAULT_ORDER_STATUSES })}
                active={sameValues(selectedOrderStatuses, DEFAULT_ORDER_STATUSES)}
              >
                기본값
              </FilterButton>
              {ORDER_STATUS_OPTIONS.map((option) => (
                <FilterButton
                  key={option.value}
                  href={buildHref({
                    orderStatuses: toggleValue(selectedOrderStatuses, option.value),
                  })}
                  active={selectedOrderStatuses.includes(option.value)}
                >
                  {option.label}
                </FilterButton>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>라벨상태</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FilterButton
                href={buildHref({ labelStatuses: DEFAULT_LABEL_STATUSES })}
                active={sameValues(selectedLabelStatuses, DEFAULT_LABEL_STATUSES)}
              >
                기본값
              </FilterButton>
              {SHIPPING_LABEL_STATUS_OPTIONS.map((option) => (
                <FilterButton
                  key={option.value}
                  href={buildHref({
                    labelStatuses: toggleValue(selectedLabelStatuses, option.value),
                  })}
                  active={selectedLabelStatuses.includes(option.value)}
                >
                  {option.label}
                </FilterButton>
              ))}
            </div>
          </div>

          <form
            action="/orders"
            method="get"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            {selectedMethods.map((value) => (
              <input key={`method-${value}`} type="hidden" name="method" value={value} />
            ))}

            {!sameValues(selectedOrderStatuses, DEFAULT_ORDER_STATUSES)
              ? selectedOrderStatuses.map((value) => (
                  <input
                    key={`order-${value}`}
                    type="hidden"
                    name="order_status"
                    value={value}
                  />
                ))
              : null}

            {!sameValues(selectedLabelStatuses, DEFAULT_LABEL_STATUSES)
              ? selectedLabelStatuses.map((value) => (
                  <input
                    key={`label-${value}`}
                    type="hidden"
                    name="label_status"
                    value={value}
                  />
                ))
              : null}

            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="주문번호, username, 수취인, 국가, 상품, 운송장 검색"
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

const sectionStyle: React.CSSProperties = {
  padding: 20,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
};

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
