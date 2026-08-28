import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parseTaobaoWorkbook } from "@/lib/purchases/taobao";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") || "preview");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "엑셀 파일이 없어." },
        { status: 400 }
      );
    }

    // 타오바오 주문 엑셀 분석
    const orders = parseTaobaoWorkbook(await file.arrayBuffer());

    // 미리보기만 요청한 경우
    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        orders,
      });
    }

    // 실제 DB 저장
    const sb = createServiceRoleClient();
    let saved = 0;

    for (const o of orders) {
      const { data: order, error } = await sb
        .from("purchase_orders")
        .upsert(
          {
            country: "CN",
            source_site: o.source_site,
            order_number: o.order_number,
            ordered_at: o.ordered_at,
            shop_name: o.shop_name,
            paid_amount: o.paid_amount,
            local_shipping: o.local_shipping,
            currency: "CNY",
            tracking_company: o.tracking_company,
            tracking_number: o.tracking_number,
            raw_data: {
              source_status: o.source_status,
            },
          },
          {
            onConflict: "source_site,order_number",
          }
        )
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      // 같은 주문을 다시 저장하는 경우 기존 상품 삭제 후 재등록
      await sb
        .from("purchase_items")
        .delete()
        .eq("purchase_order_id", order.id);

      if (o.items.length) {
        const { error: itemError } = await sb
          .from("purchase_items")
          .insert(
            o.items.map((i) => ({
              ...i,
              purchase_order_id: order.id,
            }))
          );

        if (itemError) {
          throw itemError;
        }
      }

      saved++;
    }

    return NextResponse.json({
      ok: true,
      saved,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "저장 실패",
      },
      { status: 500 }
    );
  }
}
