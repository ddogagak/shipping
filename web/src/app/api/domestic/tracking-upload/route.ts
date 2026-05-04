import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일이 없어." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    const parsed = rows
      .map((row) => ({
        order_id: safeText(row["고객주문번호"]),
        tracking_number: safeText(row["운송장번호"]),
      }))
      .filter((row) => row.order_id && row.tracking_number);

    if (!parsed.length) {
      return NextResponse.json(
        { error: "매칭 가능한 운송장 데이터가 없어." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    const orderIds = parsed.map((row) => row.order_id);

    const { data: existing, error: existingError } = await supabase
      .from("domestic_order")
      .select("order_id")
      .in("order_id", orderIds);

    if (existingError) {
      return NextResponse.json(
        { error: "기존 주문 조회 실패", detail: existingError.message },
        { status: 500 }
      );
    }

    const existingSet = new Set((existing || []).map((row) => row.order_id));

    const matched = parsed.filter((row) => existingSet.has(row.order_id));
    const unmatched = parsed.filter((row) => !existingSet.has(row.order_id));

    for (const row of matched) {
      const { error } = await supabase
        .from("domestic_shipping")
        .update({
          tracking_number: row.tracking_number,
          shipping_status: "uploaded",
        })
        .eq("order_id", row.order_id);

      if (error) {
        return NextResponse.json(
          {
            error: "운송장 등록 실패",
            order_id: row.order_id,
            detail: error.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      total: parsed.length,
      matched_count: matched.length,
      unmatched_count: unmatched.length,
      unmatched,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "운송장 엑셀 처리 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
