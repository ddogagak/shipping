import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BUCKET = "purchase-files";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const allowedKinds = ["invoice", "payment"] as const;
const categories = ["매입", "비용", "세금"] as const;
function validCategory(v: unknown): v is typeof categories[number] { return typeof v === "string" && categories.some(c => c === v); }

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}
function isSimple(row: any) {
  return row?.raw_data?.simple_purchase === true;
}
function isConverted(row: any) {
  return row?.raw_data?.converted_from_simple === true;
}
function isSimpleHistory(row: any) {
  return !row?.raw_data?.simple_merged_into && (isSimple(row) || isConverted(row));
}
function photoPaths(row: any, kind: typeof allowedKinds[number]): string[] {
  const extra = row.raw_data?.simple_merged_images?.[kind];
  return [...new Set([row.raw_data?.simple_images?.[kind], ...(Array.isArray(extra) ? extra : [])].filter((p): p is string => typeof p === "string" && p.length > 0))];
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
    const columns = "id,order_number,ordered_at,paid_amount,local_shipping,memo,shop_name,raw_data,created_at,source_site";
    const [{data: simpleRows,error: simpleError},{data: convertedRows,error: convertedError}] = await Promise.all([
      sb.from("purchase_orders").select(columns).eq("source_site","간이").order("created_at",{ascending:false}),
      sb.from("purchase_orders").select(columns).eq("source_site","Domestic").contains("raw_data",{converted_from_simple:true}).order("created_at",{ascending:false})
    ]);
    if (simpleError) throw simpleError;
    if (convertedError) throw convertedError;
    const rows = [...(simpleRows??[]),...(convertedRows??[])].filter(isSimpleHistory)
      .sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
    const splitParents = new Set(rows.map(row => row.raw_data?.split_from_order_id).filter(Boolean));
    const entries = await Promise.all(rows.map(async (row: any) => {
      const images: Record<string, string | null> = { invoice: null, payment: null };
      const image_lists: Record<string, string[]> = { invoice: [], payment: [] };
      await Promise.all(allowedKinds.map(async kind => {
        const signedUrls = await Promise.all(photoPaths(row, kind).map(async path => {
          const { data: signed, error: signError } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
          return signError ? null : signed?.signedUrl ?? null;
        }));
        image_lists[kind] = signedUrls.filter((url): url is string => !!url);
        images[kind] = image_lists[kind][0] ?? null;
      }));
      return { split_kind: row.raw_data?.split_from_order_id ? "remaining" : splitParents.has(row.id) ? "partial" : null, original_amount: row.raw_data?.previous_simple_snapshot?.paid_amount ?? null, id: row.id, order_number: row.order_number, ordered_at: row.ordered_at, paid_amount: row.paid_amount, local_shipping: row.local_shipping, memo: row.memo, shop_name: row.shop_name === "간이 매입" ? "" : (row.shop_name || ""), invoice_check_needed: row.raw_data?.invoice_check_needed === true, purchase_registered: isConverted(row) || row.raw_data?.purchase_registered === true, converted: isConverted(row), category: validCategory(row.raw_data?.purchase_category) ? row.raw_data.purchase_category : "매입", images, image_lists, merged_count: Array.isArray(row.raw_data?.simple_merge_payments) ? row.raw_data.simple_merge_payments.length : 1 };
    }));
    return NextResponse.json({ ok: true, entries });
  } catch(e) {
    return bad(e instanceof Error ? e.message : "간이 매입 조회 실패", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.category !== undefined && !validCategory(body.category)) return bad("분류는 매입, 비용, 세금 중 하나여야 해.");
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
      raw_data: { simple_purchase: true, invoice_total_confirmed: true, payment_currency: "KRW", simple_images: {}, invoice_check_needed: body.invoice_check_needed === true, purchase_registered: body.purchase_registered === true, purchase_category: body.category ?? "매입" }
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
      if (body.action === "merge") {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length < 2 || ids.length > 100 || new Set(ids).size !== ids.length || !ids.every((id: unknown) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return bad("합칠 간이 매입을 2~100건 선택해줘.");
        const { data, error } = await sb.rpc("merge_simple_purchases", { p_ids: ids });
        if (error) return bad(error.message, 409);
        return NextResponse.json({ ok: true, id: data });
      }
      const id = String(body.id ?? "");
      if (body.category !== undefined && !validCategory(body.category)) return bad("분류는 매입, 비용, 세금 중 하나여야 해.");
      if (!id || (typeof body.invoice_check_needed !== "boolean" && typeof body.shop_name !== "string" && body.category === undefined && typeof body.purchase_registered !== "boolean" && body.total_amount === undefined && body.paid_at === undefined && typeof body.memo !== "string")) return bad("수정할 정보를 확인해줘.");
      const { data: row, error: readError } = await sb.from("purchase_orders").select("id,raw_data,updated_at").eq("id", id).single();
      if (readError || !isSimpleHistory(row)) return bad("간이 매입을 찾을 수 없어.", 404);
      if (isConverted(row) && body.purchase_registered === false) return bad("정식 매입으로 전환된 건은 N으로 되돌릴 수 없어.", 409);
      const update: Record<string, unknown> = {};
      if (body.total_amount !== undefined || body.paid_at !== undefined) {
        if (body.total_amount !== undefined) {
          const amount = parseAmount(body.total_amount);
          if (amount === null) return bad("총금액은 0보다 큰 숫자로 입력해줘.");
          update.paid_amount = amount;
        }
        if (body.paid_at !== undefined) {
          const date = body.paid_at ? parseDate(body.paid_at) : null;
          if (!date) return bad("입금 날짜를 확인해줘.");
          update.ordered_at = date;
        }
      }
      if (typeof body.memo === "string") update.memo = body.memo.slice(0, 5000) || null;
      if (typeof body.invoice_check_needed === "boolean") {
        update.raw_data = { ...row.raw_data, invoice_check_needed: body.invoice_check_needed };
      }
      if (body.category !== undefined) {
        update.raw_data = { ...(update.raw_data as Record<string,unknown> || row.raw_data), purchase_category: body.category };
      }
      if (typeof body.purchase_registered === "boolean") {
        update.raw_data = { ...((update.raw_data as Record<string,unknown>) || row.raw_data), purchase_registered: body.purchase_registered };
      }
      if (typeof body.shop_name === "string") {
        update.shop_name = body.shop_name.trim().slice(0, 200) || null;
      }
      const { data: updated, error } = await sb.from("purchase_orders").update({...update, updated_at: new Date().toISOString()}).eq("id", id).eq("updated_at", row.updated_at).select("id").maybeSingle();
      if (error) throw error;
      if (!updated) return bad("다른 변경사항이 있어. 새로고침 후 다시 수정해줘.",409);
      return NextResponse.json({ ok: true });
    }
    const fd = await req.formData();
    const id = String(fd.get("id") ?? "");
    const kind = String(fd.get("kind") ?? "");
    const file = fd.get("file");
    if (!id || !allowedKinds.some(x=>x===kind)) return bad("매입 ID 또는 사진 유형이 잘못됐어.");
    if (!(file instanceof File) || !file.type.startsWith("image/")) return bad("사진 파일만 첨부할 수 있어.");
    if (file.size > MAX_IMAGE_BYTES) return bad("사진은 12MB 이하만 첨부할 수 있어.");
    const { data: row, error: readError } = await sb.from("purchase_orders").select("id,raw_data,updated_at").eq("id", id).single();
    if (readError || !isSimpleHistory(row)) return bad("간이 매입을 찾을 수 없어.",404);
    const suffix = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8) || "jpg";
    const path = `simple/${id}/${kind}-${crypto.randomUUID()}.${suffix}`;
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file, { contentType:file.type, upsert: false });
    if (uploadError) throw uploadError;
    const oldPath = row.raw_data?.simple_images?.[kind];
    const merged = Array.isArray(row.raw_data?.simple_merge_payments);
    const rawData = merged ? { ...row.raw_data, simple_merged_images: { ...row.raw_data.simple_merged_images, [kind]: [...photoPaths(row, kind as typeof allowedKinds[number]), path] } } : { ...row.raw_data, simple_images: { ...(row.raw_data?.simple_images ?? {}), [kind]: path } };
    const { data: updated, error: updateError } = await sb.from("purchase_orders").update({ raw_data:rawData, updated_at: new Date().toISOString() }).eq("id",id).eq("updated_at",row.updated_at).select("id").maybeSingle();
    if (updateError || !updated) {
      await sb.storage.from(BUCKET).remove([path]);
      return bad(updateError?.message || "다른 변경사항이 있어. 새로고침 후 다시 첨부해줘.",409);
    }
    if (!merged && oldPath && oldPath !== path) await sb.storage.from(BUCKET).remove([oldPath]);
    return NextResponse.json({ ok: true });
  } catch(e) {
    return bad(e instanceof Error ? e.message : "사진 업로드 실패",500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    const sb = createServiceRoleClient();
    const { data: row, error } = await sb.from("purchase_orders").select("id,raw_data,updated_at").eq("id", id).single();
    if (error || !isSimpleHistory(row)) return bad("간이 매입을 찾을 수 없어.",404);
    if (isConverted(row)) return bad("전환 완료된 간이 기록은 정식 매입과 같은 주문이라 여기서 삭제할 수 없어.",409);
    if (Array.isArray(row.raw_data?.simple_merge_payments)) return bad("합친 매입은 원본 이력 보존을 위해 삭제할 수 없어.",409);
    const { data: deleted, error: delError } = await sb.from("purchase_orders").delete().eq("id",id).eq("updated_at",row.updated_at).select("id").maybeSingle();
    if (delError) throw delError;
    if (!deleted) return bad("다른 변경사항이 있어. 새로고침 후 다시 확인해줘.",409);
    const paths = allowedKinds.map(k=>row.raw_data?.simple_images?.[k]).filter((p):p is string=>typeof p==="string"&&p.length>0);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    return NextResponse.json({ok:true});
  } catch(e) {
    return bad(e instanceof Error ? e.message : "간이 매입 삭제 실패",500);
  }
}
