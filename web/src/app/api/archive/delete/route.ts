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

    const { error } = await supabase.storage
      .from("archive-files")
      .remove([path]);

    if (error) {
      return NextResponse.json(
        { error: "삭제 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: "삭제 처리 중 오류", detail: error?.message },
      { status: 500 }
    );
  }
}
