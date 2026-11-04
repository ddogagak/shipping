import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BUCKET = "purchase-files";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const allowedKinds = ["invoice", "payment"] as const;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
function isSimple(row: any) {
  return row?.raw_data?.simple_purchase === true;
}
function parseAmount(value: unknown) {
  const amount = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
function parseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const dt = new Date(raw + "T12:00:00+09:00");
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== new Date(Date.UTC(Number(raw.slice(0,4)),Number(raw.slice(5,7))-1,Number(raw.slice(8,10)))).toISOString().slice(0,10) ? null : dt.toISOString();
}

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb.from("purchase_orders").select("id,order_number,ordered_at,paid_amount,memo,shop_name,raw_data,created_at").eq("source_site", "간이").order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []).filter(isSimple);
    const entries = await Promise.all(rows.map(async (row: any) => {
      const images: Record<string, string | null> = { invoice: null, payment: null };
      await Promise.all(allowedKinds.map(async kind => {
        const path = row.raw_data?.simple_images?.[kind];
        if (typeof path === "string" && path) {
          const { data: signed, error: signError } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
          if (!signError) images[kind] = signed?.signedUrl ?? null;
        }
      }));
      return { id: row.id, order_number: row.order_number, ordered_at: row.ordered_at, paid_amount: row.paid_amount, memo: row.memo, shop_name: row.shop_name === "간이 매입" ? "" : (row.shop_name || ""), invoice_check_needed: row.raw_data?.invoice_check_needed === true, images };
    }));
    return NextResponse.json({ ok: true, entries });
  } catch(e) {
    return bad(e instanceof Error ? e.message : "간이 매입 조회 실패", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const amount = parseAmount(body.total_amount);
    if (amount === null) return bad("총금액은 0보다 큰 숫자로 입력해줘.");
    const date = parseDate(body.paid_at);
    if (!date) return bad("입금 날짜가 잘못됐어.");
    const sb = createServiceRoleClient();
    const { data, error } = await sb.from("purchase_orders").insert({
      country: "KR", source_site: "간이", shop_name: String(body.shop_name ?? "").trim().slice(0, 200) || null,
      order_number: "SIMPLE-" + crypto.randomUUID(),
      ordered_at: date, paid_amount: amount, currency: "KRW",
      local_shipping: 0, order_status: "입고완료",
      memo: String(body.memo ?? "").slice(0, 5000) || null,
      raw_data: { simple_purchase: true, invoice_total_confirmed: true, payment_currency: "KRW", simple_images: {}, invoice_check_needed: body.invoice_check_needed === true }
    }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch(e) {
    return bad(e instanceof Error ? e.message : "간이 매입 저장 실패", 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const sb = createServiceRoleClient();
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      const id = String(body.id ?? "");
      if (!id || (typeof body.invoice_check_needed !== "boolean" && typeof body.shop_name !== "string")) return bad("수정할 정보를 확인해줘.");
      const { data: row, error: readError } = await sb.from("purchase_orders").select("id,raw_data").eq("id", id).single();
      if (readError || !isSimple(row)) return bad("간이 매입을 찾을 수 없어.", 404);
      const update: Record<string, unknown> = {};
      if (typeof body.invoice_check_needed === "boolean") {
        update.raw_data = { ...row.raw_data, invoice_check_needed: body.invoice_check_needed };
      }
      if (typeof body.shop_name === "string") {
        update.shop_name = body.shop_name.trim().slice(0, 200) || null;
      }
      const { error } = await sb.from("purchase_orders").update(update).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const fd = await req.formData();
    const id = String(fd.get("id") ?? "");
    const kind = String(fd.get("kind") ?? "");
    const file = fd.get("file");
    if (!id || !allowedKinds.some(x=>x===kind)) return bad("매입 ID 또는 사진 유형이 잘못됐어.");
    if (!(file instanceof File) || !file.type.startsWith("image/")) return bad("사진 파일만 첨부할 수 있어.");
    if (file.size > MAX_IMAGE_BYTES) return bad("사진은 12MB 이하만 첨부할 수 있어.");
    const { data: row, error: readError } = await sb.from("purchase_orders").select("id,raw_data").eq("id", id).single();
    if (readError || !isSimple(row)) return bad("간이 매입을 찾을 수 없어.",404);
    const suffix = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8) || "jpg";
    const path = `simple/${id}/${kind}-${crypto.randomUUID()}.${suffix}`;
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file, { contentType:file.type, upsert: false });
    if (uploadError) throw uploadError;
    const oldPath = row.raw_data?.simple_images?.[kind];
    const rawData = { ...row.raw_data, simple_images: { ...(row.raw_data?.simple_images ?? {}), [kind]: path } };
    const { error: updateError } = await sb.from("purchase_orders").update({ raw_data:rawData }).eq("id",id);
    if (updateError) {
      await sb.storage.from(BUCKET).remove([path]);
      throw updateError;
    }
    if (oldPath && oldPath !== path) await sb.storage.from(BUCKET).remove([oldPath]);
    return NextResponse.json({ ok: true });
  } catch(e) {
    return bad(e instanceof Error ? e.message : "사진 업로드 실패",500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    const sb = createServiceRoleClient();
    const { data: row, error } = await sb.from("purchase_orders").select("id,raw_data").eq("id", id).single();
    if (error || !isSimple(row)) return bad("간이 매입을 찾을 수 없어.",404);
    const { error: delError } = await sb.from("purchase_orders").delete().eq("id",id);
    if (delError) throw delError;
    const paths = allowedKinds.map(k=>row.raw_data?.simple_images?.[k]).filter((p):p is string=>typeof p==="string"&&p.length>0);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    return NextResponse.json({ok:true});
  } catch(e) {
    return bad(e instanceof Error ? e.message : "간이 매입 삭제 실패",500);
  }
}
