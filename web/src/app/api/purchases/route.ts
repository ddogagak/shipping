import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 매입 목록 조회
 * GET /api/purchases
 */
export async function GET() {
  try {
    const sb = createServiceRoleClient();

    const { data, error } = await sb
      .from("purchase_orders")
      .select(`
        *,
        purchase_items(*),
        purchase_costs(*),
        purchase_files(*)
      `)
      .order("ordered_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      orders: data ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : "매입 목록을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}

/**
 * 매입 주문 수정
 * PATCH /api/purchases
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "매입 주문 ID가 없습니다.",
        },
        { status: 400 }
      );
    }

    const sb = createServiceRoleClient();

    const updateData: Record<string, unknown> = {};

    // 전달된 값만 수정
    if (body.order_status !== undefined) {
      updateData.order_status = body.order_status;
    }

    if (body.memo !== undefined) {
      updateData.memo = body.memo;
    }

    const { data, error } = await sb
      .from("purchase_orders")
      .update(updateData)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      order: data,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : "매입 정보를 수정하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
