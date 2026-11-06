import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const isValidUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !/^(localhost|.*\.localhost|.*\.local|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(url.hostname) &&
      url.port === "";
  } catch { return false; }
};

export async function POST(req: Request) {
  try {
    const { image_url: imageUrl } = await req.json();
    const url = String(imageUrl || "").trim();
    if (!isValidUrl(url) || url.length > 2000)
      return NextResponse.json({ ok: false, message: "이미지 URL을 확인해줘." }, { status: 400 });

    // Fetch only images previously recorded on a purchase or inventory item.
    // Never accept arbitrary external destinations as a server-side image proxy.
    const sb = createServiceRoleClient();
    const [{ data: a }, { data: b }, { data: c }] = await Promise.all([
      sb.from("purchase_items").select("id").eq("image_url", url).limit(1),
      sb.from("inventory_items").select("id").eq("image_url", url).limit(1),
      sb.from("purchase_sale_inventory").select("purchase_item_id").eq("image_url_override", url).limit(1),
    ]);
    if (!a?.length && !b?.length && !c?.length)
      return NextResponse.json({ ok: false, message: "등록된 대표이미지만 합성할 수 있어." }, { status: 403 });

    const remote = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "image/png,image/jpeg,image/webp,image/*;q=0.8" },
    });
    if (!remote.ok) throw new Error(`이미지 가져오기 실패 (${remote.status})`);
    const type = String(remote.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!["image/png","image/jpeg","image/webp","image/gif"].includes(type))
      throw new Error("지원하지 않는 이미지 형식이야.");
    if (Number(remote.headers.get("content-length") || 0) > 6 * 1024 * 1024)
      throw new Error("이미지 용량이 6MB를 넘었어.");
    const buffer = await remote.arrayBuffer();
    if (buffer.byteLength > 6 * 1024 * 1024)
      throw new Error("이미지 용량이 6MB를 넘었어.");
    return new Response(buffer, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=120", "X-Content-Type-Options": "nosniff" }
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "이미지 처리 오류" }, { status: 400 });
  }
}
