import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.storage
      .from("archive-files")
      .list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      return NextResponse.json(
        { error: "목록 조회 실패", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, files: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: "목록 처리 중 오류", detail: error?.message },
      { status: 500 }
    );
  }
}
