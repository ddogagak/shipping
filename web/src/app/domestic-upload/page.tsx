"use client";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toDomesticExcelRows } from "@/lib/domestic/parser";
import type { DomesticPreviewRow, Platform } from "@/lib/domestic/types";

export default function DomesticUploadPage() {
  const [platform, setPlatform] = useState<Platform>("wise");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<DomesticPreviewRow[]>([]);
  const [msg, setMsg] = useState("");

  const selected = useMemo(() => rows.filter((r) => r.selected), [rows]);

  async function preview() {
    const fd = new FormData();
    fd.append("platform", platform);
    fd.append("text", text);
    const res = await fetch("/api/domestic/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) return setMsg(json.error || "미리보기 실패");
    setRows(json.rows || []);
  }

  function exportExcel() {
    const aoa = toDomesticExcelRows(selected);
    const ws = XLSX.utils.json_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Domestic");
    XLSX.writeFile(wb, `domestic_export_${Date.now()}.xlsx`);
  }

  async function saveDB() {
    const res = await fetch("/api/domestic/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: selected })
    });
    const json = await res.json();
    if (!res.ok) return setMsg(json.error || "저장 실패");
    setMsg(`저장 완료 inserted=${json.inserted} skipped=${json.skipped}`);
  }

  return <main>
    <div className="card" style={{ marginBottom: 12 }}>
      <h1 style={{ marginTop: 0 }}>Domestic Upload</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setPlatform("wise")} style={{ background: platform === "wise" ? "#3b82f6" : "#e5e7eb", color: platform === "wise" ? "#fff" : "#111" }}>Wise</button>
        <button onClick={() => setPlatform("x")} style={{ background: platform === "x" ? "#3b82f6" : "#e5e7eb", color: platform === "x" ? "#fff" : "#111" }}>X</button>
        <button onClick={() => setPlatform("bunjang")} style={{ background: platform === "bunjang" ? "#3b82f6" : "#e5e7eb", color: platform === "bunjang" ? "#fff" : "#111" }}>번개장터</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="배송정보 텍스트 붙여넣기" style={{ width: "100%", minHeight: 180, marginTop: 8 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={preview}>미리보기</button>
        <button onClick={exportExcel} disabled={!selected.length}>선택 엑셀 추출</button>
        <button onClick={saveDB} disabled={!selected.length}>선택 DB 저장</button>
      </div>
      {msg ? <p>{msg}</p> : null}
    </div>

    <div className="card"><div className="table-wrap"><table><thead><tr>
      <th>선택</th><th>고객주문번호</th><th>받는분성명</th><th>닉네임</th><th>우편번호</th><th>전화번호</th><th>주소</th><th>주문건수</th><th>최초주문일</th><th>아이템</th><th>상품금액합계</th>
    </tr></thead><tbody>
    {rows.map((r, i) => <tr key={`${r.order_id}-${i}`}>
      <td><input type="checkbox" checked={r.selected} onChange={(e)=>setRows(prev=>prev.map((x,idx)=>idx===i?{...x,selected:e.target.checked}:x))}/></td>
      <td><input value={r.order_id} onChange={(e)=>setRows(prev=>prev.map((x,idx)=>idx===i?{...x,order_id:e.target.value}:x))}/></td>
      <td><input value={r.recipient_name} onChange={(e)=>setRows(prev=>prev.map((x,idx)=>idx===i?{...x,recipient_name:e.target.value}:x))}/></td>
      <td><input value={r.nickname} onChange={(e)=>setRows(prev=>prev.map((x,idx)=>idx===i?{...x,nickname:e.target.value}:x))}/></td>
      <td><input value={r.postal_code} onChange={(e)=>setRows(prev=>prev.map((x,idx)=>idx===i?{...x,postal_code:e.target.value}:x))}/></td>
      <td><input value={r.phone} onChange={(e)=>setRows(prev=>prev.map((x,idx)=>idx===i?{...x,phone:e.target.value}:x))}/></td>
      <td><input value={r.address} onChange={(e)=>setRows(prev=>prev.map((x,idx)=>idx===i?{...x,address:e.target.value}:x))}/></td>
      <td>{r.order_count}</td><td>{r.first_order_date}</td><td>{r.item_texts.join(" | ")}</td><td>{r.item_total_price}</td>
    </tr>)}
    </tbody></table></div></div>
  </main>;
}
