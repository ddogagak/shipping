import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SNAPSHOT_ID = "latest";
type Row = {
  nickname: string;
  order_id: string;
  days: number;
  status: "unshipped" | "pending" | "confirmed" | "urgent";
  source: "wise";
};

export async function GET() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("domestic_wise_snapshot")
    .select("rows,updated_at")
    .eq("id", SNAPSHOT_ID)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, snapshot: data || null });
}

export async function POST(request: Request) {
  let body: { rows?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 }); }

  if (!Array.isArray(body.rows) || body.rows.length > 20000) {
    return NextResponse.json({ error: "유효하지 않은 주문 목록" }, { status: 400 });
  }
  const rows: Row[] = [];
  for (const item of body.rows) {
    if (!item || typeof item !== "object") {
      return NextResponse.json({ error: "유효하지 않은 주문 데이터" }, { status: 400 });
    }
    const row = item as Record<string, unknown>;
    if (typeof row.nickname !== "string" || typeof row.order_id !== "string" ||
        typeof row.days !== "number" || !Number.isFinite(row.days) ||
        !["unshipped", "pending", "confirmed", "urgent"].includes(String(row.status)) ||
        row.source !== "wise") {
      return NextResponse.json({ error: "유효하지 않은 주문 필드" }, { status: 400 });
    }
    rows.push({
      nickname: row.nickname.slice(0, 120),
      order_id: row.order_id.slice(0, 100),
      days: row.days,
      status: row.status as Row["status"],
      source: "wise"
    });
  }
  const supabase = createServiceRoleClient();
  // A partial Wise scan must not be interpreted as receipt confirmation.
  if ((body as { complete?: unknown }).complete !== true) {
    return NextResponse.json({ error: "일부 주문 조회 실패: 이전 목록 유지" }, { status: 422 });
  }
  const { data: previous, error: readError } = await supabase
    .from("domestic_wise_snapshot").select("rows").eq("id", SNAPSHOT_ID).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  const previousRows: Row[] = Array.isArray(previous?.rows) ? previous.rows as Row[] : [];
  const present = new Set(rows.map(row => row.order_id));
  const confirmed = previousRows.filter(row =>
    (row.status === "pending" || row.status === "confirmed") &&
    !present.has(row.order_id)
  ).map(row => ({ ...row, status: "confirmed" as const }));
  rows.push(...confirmed);
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from("domestic_wise_snapshot")
    .upsert({ id: SNAPSHOT_ID, rows, updated_at }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updatedAt: updated_at, rows });
}
