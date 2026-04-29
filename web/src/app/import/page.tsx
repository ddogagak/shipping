"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PreviewOrder = {
  order_no: string;
  recipient_name: string;
  buyer_username: string;
  country_code: string;
  postal_code: string;
  quantity_total: number;
  subtotal: number;
  export_price: number;
  tax_code: string;
  process_status: string;
  items: Array<unknown>;
};

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [orders, setOrders] = useState<PreviewOrder[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalOrders = useMemo(() => orders.length, [orders]);

  async function onPreview() {
    if (!file) {
      setMessage("CSV 파일을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: formData
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error || "미리보기 생성 중 오류가 발생했습니다.");
        setOrders([]);
        return;
      }
      setOrders(json.orders || []);
      setMessage(`미리보기 완료: ${json.orders?.length || 0}건`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "미리보기 처리 중 오류가 발생했습니다.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!orders.length) {
      setMessage("저장할 주문이 없습니다.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders })
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error || "DB 저장 중 오류가 발생했습니다.");
        return;
      }
      setMessage(`저장 완료: ${json.saved}건`);
      router.push("/orders");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "DB 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>/import</h1>
        <p style={{ color: "#6b7280" }}>
          eBay Orders Report CSV를 업로드하면 Order Number 기준으로 그룹화하여 주문 미리보기를 생성합니다.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button onClick={onPreview} disabled={loading}>
            {loading ? "미리보기 생성 중..." : "미리보기"}
          </button>
          <button onClick={onSave} disabled={saving || !orders.length}>
            {saving ? "저장 중..." : "DB에 저장"}
          </button>
        </div>
        {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Preview ({totalOrders})</h2>
        {!orders.length ? (
          <p>미리보기 데이터가 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>order_no</th>
                  <th>recipient_name</th>
                  <th>buyer_username</th>
                  <th>country_code</th>
                  <th>postal_code</th>
                  <th>quantity_total</th>
                  <th>subtotal</th>
                  <th>export_price</th>
                  <th>tax_code</th>
                  <th>process_status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.order_no}>
                    <td>{order.order_no}</td>
                    <td>{order.recipient_name}</td>
                    <td>{order.buyer_username}</td>
                    <td>{order.country_code}</td>
                    <td>{order.postal_code}</td>
                    <td>{order.quantity_total}</td>
                    <td>{order.subtotal}</td>
                    <td>{order.export_price}</td>
                    <td>{order.tax_code}</td>
                    <td>{order.process_status}</td>
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
