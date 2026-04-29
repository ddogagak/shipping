"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  platform: string | null;
  platform_order_no: string | null;
  customer_nickname: string | null;
  item_summary: string | null;
  item_count: number | null;
  recipient_name: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  workflow_status: string | null;
  tracking_number: string | null;
  domestic_memo: string | null;
  created_at: string;
};

export default function DomesticPage() {
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<any>({ platform: "wise", item_count: 1 });

  async function load() {
    const q = new URLSearchParams({ status, platform }).toString();
    const res = await fetch(`/api/domestic?${q}`);
    const json = await res.json();
    if (!res.ok) return setMsg(json.error || "조회 오류");
    setRows(json.orders || []);
  }

  useEffect(() => { void load(); }, [status, platform]);

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/domestic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const json = await res.json();
    if (!res.ok) return setMsg(json.error || "저장 오류");
    setMsg("저장 완료");
    await load();
  }

  async function setWorkflow(id: string, workflow_status: string) {
    const res = await fetch("/api/domestic", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, workflow_status }) });
    const json = await res.json();
    if (!res.ok) return setMsg(json.error || "상태 변경 오류");
    await load();
  }

  return <main>
    <div className="card" style={{ marginBottom: 16 }}>
      <h1 style={{ marginTop: 0 }}>Domestic Order</h1>
      <form onSubmit={createOrder} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        <select value={form.platform || "wise"} onChange={e=>setForm((f:any)=>({...f,platform:e.target.value}))}>
          <option value="wise">와이스</option><option value="bunjang">번개장터</option><option value="x">X</option>
        </select>
        <input placeholder="플랫폼 주문번호" onChange={e=>setForm((f:any)=>({...f,platform_order_no:e.target.value}))} />
        <input placeholder="구매자 닉네임" onChange={e=>setForm((f:any)=>({...f,customer_nickname:e.target.value}))} />
        <input placeholder="상품 요약" onChange={e=>setForm((f:any)=>({...f,item_summary:e.target.value}))} />
        <input type="number" placeholder="상품 개수" defaultValue={1} onChange={e=>setForm((f:any)=>({...f,item_count:Number(e.target.value||0)}))} />
        <input placeholder="수취인명" onChange={e=>setForm((f:any)=>({...f,recipient_name:e.target.value}))} />
        <input placeholder="전화번호" onChange={e=>setForm((f:any)=>({...f,phone:e.target.value}))} />
        <input placeholder="우편번호" onChange={e=>setForm((f:any)=>({...f,postal_code:e.target.value}))} />
        <input placeholder="주소1" onChange={e=>setForm((f:any)=>({...f,address1:e.target.value}))} />
        <input placeholder="주소2" onChange={e=>setForm((f:any)=>({...f,address2:e.target.value}))} />
        <input placeholder="메모" onChange={e=>setForm((f:any)=>({...f,domestic_memo:e.target.value}))} />
        <button type="submit">저장</button>
      </form>
      {msg ? <p>{msg}</p> : null}
    </div>

    <div className="card">
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="all">전체</option>
          <option value="order_input">주문 입력</option>
          <option value="address_input">주소입력</option>
          <option value="tracking_input">운송장입력</option>
          <option value="delivered">배송완료</option>
        </select>
        <select value={platform} onChange={e=>setPlatform(e.target.value)}>
          <option value="all">전체</option>
          <option value="wise">와이스</option>
          <option value="bunjang">번개장터</option>
          <option value="x">X</option>
        </select>
      </div>
      <div className="table-wrap"><table><thead><tr>
        <th>선택</th><th>플랫폼</th><th>플랫폼 주문번호</th><th>구매자 닉네임</th><th>상품 요약</th><th>상품 개수</th><th>수취인명</th><th>전화번호</th><th>주소</th><th>workflow_status</th><th>tracking_number</th><th>메모</th><th>생성일</th><th>상태변경</th>
      </tr></thead><tbody>
      {rows.map(r=><tr key={r.id}>
        <td><input type="checkbox"/></td><td>{r.platform||""}</td><td>{r.platform_order_no||""}</td><td>{r.customer_nickname||""}</td><td>{r.item_summary||""}</td><td>{r.item_count??""}</td><td>{r.recipient_name||""}</td><td>{r.phone||""}</td><td>{[r.address1,r.address2].filter(Boolean).join(" ")}</td><td>{r.workflow_status||""}</td><td>{r.tracking_number||""}</td><td>{r.domestic_memo||""}</td><td>{r.created_at}</td>
        <td><button onClick={()=>setWorkflow(r.id,"address_input")}>주소입력 처리</button><button onClick={()=>setWorkflow(r.id,"tracking_input")}>운송장입력 처리</button><button onClick={()=>setWorkflow(r.id,"delivered")}>배송완료</button></td>
      </tr>)}
      </tbody></table></div>
    </div>
  </main>;
}
