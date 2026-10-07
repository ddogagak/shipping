import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("domestic_checklist")
    .select("id,text,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "CHECK 조회 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: data || [] });
}

export async function POST(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();
  const text = String(body.text || "").trim();

  if (!text) {
    return NextResponse.json({ error: "CHECK 내용을 입력해줘." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("domestic_checklist")
    .insert({ text })
    .select("id,text,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "CHECK 저장 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: Request) {
  const supabase = createServiceRoleClient();
  const body = await req.json();
  const id = String(body.id || "").trim();

  if (!id) {
    return NextResponse.json({ error: "CHECK id가 없습니다." }, { status: 400 });
  }

  const { error } = await supabase
    .from("domestic_checklist")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "CHECK 삭제 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
