import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "stock-images";

function safe(value: unknown) {
  return String(value ?? "").trim();
}

function cleanSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").slice(0, 100);
}

export async function POST(req: Request) {
  try {
    const supabase = createServiceRoleClient();
    const form = await req.formData();
    const file = form.get("file");
    const workId = cleanSegment(safe(form.get("work_id")) || "work");
    const imageId = cleanSegment(safe(form.get("image_id")) || crypto.randomUUID());

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "이미지 파일이 없습니다." }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "압축 후 이미지가 4MB를 넘습니다." }, { status: 413 });
    }

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) throw listError;
    if (!(buckets || []).some((bucket) => bucket.name === BUCKET)) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
      });
      if (createError) throw createError;
    }

    const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
    const path = `imports/${workId}/${imageId}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || "image/webp",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({
      ok: true,
      image: {
        image_id: safe(form.get("image_id")),
        image_url: publicData.publicUrl,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || "image/webp",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "이미지 업로드 실패", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
