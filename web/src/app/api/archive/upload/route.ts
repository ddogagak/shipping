
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function safeFileName(name: string) {
  return name.replace(/[^\w.\-가-힣\s]/g, "_");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없어." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "PDF, XLS, XLSX 파일만 업로드 가능해." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = safeFileName(file.name);
    const path = `${Date.now()}_${fileName}`;

    const { error } = await supabase.storage
      .from("archive-files")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      return NextResponse.json(
        { error: "업로드 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, path });
  } catch (error: any) {
    return NextResponse.json(
      { error: "업로드 처리 중 오류", detail: error?.message },
      { status: 500 }
    );
  }
}
