import { createServiceRoleClient } from "@/lib/supabase/server";

type OrderRow = {
  order_no: string;
  recipient_name: string | null;
  country_code: string | null;
  quantity_total: number | null;
  export_price: number | null;
  process_status: string | null;
  shipping_status: string | null;
  created_at: string;
};

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_no, recipient_name, country_code, quantity_total, export_price, process_status, shipping_status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const orders: OrderRow[] = data ?? [];

  return (
    <main>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>주문 목록</h1>
        <p style={{ marginTop: 0, color: "#6b7280" }}>
          Supabase <code>orders</code> 테이블 최근 100건
        </p>

        {error ? (
          <p style={{ color: "#b91c1c" }}>주문 조회 중 오류가 발생했습니다: {error.message}</p>
        ) : orders.length === 0 ? (
          <p>아직 저장된 주문이 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>order_no</th>
                  <th>recipient_name</th>
                  <th>country_code</th>
                  <th>quantity_total</th>
                  <th>export_price</th>
                  <th>process_status</th>
                  <th>shipping_status</th>
                  <th>created_at</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={`${order.order_no}-${order.created_at}`}>
                    <td>{order.order_no}</td>
                    <td>{order.recipient_name ?? ""}</td>
                    <td>{order.country_code ?? ""}</td>
                    <td>{order.quantity_total ?? ""}</td>
                    <td>{order.export_price ?? ""}</td>
                    <td>{order.process_status ?? ""}</td>
                    <td>{order.shipping_status ?? ""}</td>
                    <td>{order.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
