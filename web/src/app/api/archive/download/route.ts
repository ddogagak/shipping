import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const path = String(body.path || "");

    if (!path) {
      return NextResponse.json({ error: "파일 경로가 없어." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.storage
      .from("archive-files")
      .createSignedUrl(path, 60);

    if (error) {
      return NextResponse.json(
        { error: "다운로드 링크 생성 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  } catch (error: any) {
    return NextResponse.json(
      { error: "다운로드 처리 중 오류", detail: error?.message },
      { status: 500 }
    );
  }
}
