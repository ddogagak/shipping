"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

type Entry = {
  id: string;
  order_number: string;
  ordered_at: string | null;
  paid_amount: number;
  memo: string | null;
  images: { invoice: string | null; payment: string | null };
};

const field: CSSProperties = { padding: "11px 12px", border: "1px solid #d7dce2", borderRadius: 9, background: "#fff", color: "#171717", fontSize: 15, width: "100%", boxSizing: "border-box" };
const button: CSSProperties = { border: 0, borderRadius: 9, padding: "12px 18px", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer" };
const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 };
const money = (v: unknown) => Number(v || 0).toLocaleString("ko-KR");

export default function SimplePurchasesPage() {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [invoice, setInvoice] = useState<File | null>(null);
  const [payment, setPayment] = useState<File | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/purchases/simple", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "조회 실패");
      setEntries(body.entries || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function upload(id: string, kind: "invoice" | "payment", file: File) {
    const fd = new FormData();
    fd.append("id", id);
    fd.append("kind", kind);
    fd.append("file", file);
    const res = await fetch("/api/purchases/simple", { method: "PATCH", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "이미지 저장 실패");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const total = Number(amount.replace(/,/g, "").trim());
    if (!Number.isFinite(total) || total <= 0) { setMessage("총금액은 0보다 크게 입력해줘."); return; }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/purchases/simple", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ total_amount: total, paid_at: date, memo }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "저장 실패");
      const failures: string[] = [];
      for (const [kind, file] of [["invoice", invoice], ["payment", payment]] as const) {
        if (file) {
          try { await upload(body.id, kind, file); }
          catch (err) { failures.push(`${kind === "invoice" ? "명세서" : "입금내역"}: ${err instanceof Error ? err.message : "첨부 실패"}`); }
        }
      }
      setAmount(""); setDate(""); setMemo(""); setInvoice(null); setPayment(null);
      const invoiceInput = document.getElementById("simple-invoice") as HTMLInputElement | null;
      const paymentInput = document.getElementById("simple-payment") as HTMLInputElement | null;
      if (invoiceInput) invoiceInput.value = "";
      if (paymentInput) paymentInput.value = "";
      await load();
      setMessage(failures.length ? `매입금액은 저장됐지만 사진 첨부 실패: ${failures.join(" / ")}. 아래 기록에서 다시 첨부할 수 있어.` : "간이 매입 저장 완료! 매출관리의 매입 투입비용에도 포함돼.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "간이 매입 저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function replaceImage(id: string, kind: "invoice" | "payment", file?: File) {
    if (!file) return;
    setBusy(true); setMessage("");
    try { await upload(id, kind, file); await load(); setMessage("사진 저장 완료"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "사진 저장 실패"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("이 간이 매입 기록과 첨부사진을 삭제할까?")) return;
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/purchases/simple", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({id}) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "삭제 실패");
      await load(); setMessage("간이 매입 삭제 완료");
    } catch (e) { setMessage(e instanceof Error ? e.message : "삭제 실패"); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px 70px", color: "#171717" }}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:16}}>
      <div><h1 style={{margin:0,fontSize:27}}>매입관리</h1><p style={{color:"#6b7280",margin:"4px 0 0",fontSize:13}}>상품 등록 없이 입금금액만 빠르게 기록</p></div>
      <Link href="/purchases" style={{...button,textDecoration:"none",background:"#fff",color:"#111827",border:"1px solid #d1d5db"}}>전체 매입 보기</Link>
    </header>
    <nav style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:15}}>
      {[{name:"전체",href:"/purchases"},{name:"🇨🇳 중국",href:"/purchases?country=CN"},{name:"🇯🇵 일본",href:"/purchases?country=JP"},{name:"🇰🇷 한국",href:"/purchases?country=KR"}].map(t=><Link key={t.name} href={t.href} style={{padding:"9px 13px",border:"1px solid #d1d5db",borderRadius:9,color:"#374151",background:"#fff",textDecoration:"none",fontWeight:700,fontSize:13}}>{t.name}</Link>)}
      <span style={{...button,padding:"9px 14px",fontSize:13}}>🧾 간이</span>
    </nav>
    <form onSubmit={submit} style={{...card,display:"grid",gap:16}}>
      <h2 style={{fontSize:18,margin:0}}>간이 매입 등록</h2>
      <label style={{display:"grid",gap:6,fontWeight:700,fontSize:14}}>총금액 (원) <span style={{color:"#be123c",fontSize:12}}>필수</span>
        <input style={field} inputMode="decimal" required placeholder="예: 150000" value={amount} onChange={e=>setAmount(e.target.value)} />
      </label>
      <label style={{display:"grid",gap:6,fontWeight:700,fontSize:14}}>입금 날짜 <span style={{fontWeight:400,color:"#6b7280"}}>(선택 · 비우면 등록일)</span>
        <input style={field} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      </label>
      <label style={{display:"grid",gap:6,fontWeight:700,fontSize:14}}>명세서 사진 (선택)
        <input id="simple-invoice" style={field} type="file" accept="image/*" onChange={e=>setInvoice(e.target.files?.[0] || null)}/>
      </label>
      <label style={{display:"grid",gap:6,fontWeight:700,fontSize:14}}>입금내역 사진 (선택)
        <input id="simple-payment" style={field} type="file" accept="image/*" onChange={e=>setPayment(e.target.files?.[0] || null)}/>
      </label>
      <label style={{display:"grid",gap:6,fontWeight:700,fontSize:14}}>메모 (선택)
        <textarea style={{...field,minHeight:85,resize:"vertical"}} value={memo} onChange={e=>setMemo(e.target.value)} placeholder="예: 한스지몰 일부 매입, 계좌이체"/>
      </label>
      <button style={{...button,opacity:busy?0.6:1}} type="submit" disabled={busy}>{busy?"저장 중...":"간이 매입 저장"}</button>
    </form>
    {message&&<div role="status" style={{...card,marginTop:12,fontSize:13,whiteSpace:"pre-wrap"}}>{message}</div>}
    <section style={{marginTop:24}}>
      <h2 style={{fontSize:19}}>등록 내역 ({entries.length}건)</h2>
      {loading&&<p style={{fontSize:13,color:"#6b7280"}}>불러오는 중...</p>}
      {!loading&&!entries.length&&<p style={{fontSize:13,color:"#6b7280"}}>아직 등록된 간이 매입이 없어.</p>}
      <div style={{display:"grid",gap:12}}>
      {entries.map(entry=><article key={entry.id} style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:12}}>
          <div><strong style={{fontSize:20}}>{money(entry.paid_amount)}원</strong><p style={{fontSize:13,color:"#6b7280",margin:"5px 0 0"}}>{entry.ordered_at ? new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(entry.ordered_at)) : "날짜 없음"}</p></div>
          <button disabled={busy} onClick={()=>void remove(entry.id)} style={{padding:"6px 9px",border:"1px solid #fecdd3",background:"#fff1f2",color:"#be123c",borderRadius:7,cursor:"pointer"}}>삭제</button>
        </div>
        {entry.memo&&<p style={{fontSize:13,whiteSpace:"pre-wrap"}}>{entry.memo}</p>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginTop:12}}>
          {(["invoice","payment"] as const).map(kind=><div key={kind} style={{display:"grid",gap:7}}>
            <b style={{fontSize:13}}>{kind==="invoice"?"명세서":"입금내역"}</b>
            {entry.images[kind]?<a href={entry.images[kind]!} target="_blank" rel="noopener noreferrer"><img src={entry.images[kind]!} alt={kind==="invoice"?"명세서 사진":"입금내역 사진"} style={{width:"100%",maxHeight:200,objectFit:"contain",borderRadius:8,border:"1px solid #e5e7eb"}}/></a>:<span style={{fontSize:12,color:"#9ca3af"}}>사진 없음</span>}
            <input type="file" accept="image/*" disabled={busy} aria-label={kind==="invoice"?"명세서 사진 첨부":"입금내역 사진 첨부"} onChange={e=>{void replaceImage(entry.id,kind,e.target.files?.[0]);e.target.value="";}} style={{maxWidth:"100%",fontSize:12}}/>
          </div>)}
        </div>
      </article>)}
      </div>
    </section>
  </main>;
}
