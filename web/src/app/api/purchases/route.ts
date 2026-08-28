import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";

export const runtime = "nodejs";

/**
 * 매입 목록 조회
 * GET /api/purchases
 *
 * 상품 URL의 product id를 기준으로 sourcing inventory와 매칭해서
 * 한국어 상품명/이미지/시리즈/타입을 화면용으로 함께 내려준다.
 */
export async function GET() {
  try {
    const sb = createServiceRoleClient();

    const [{ data, error }, { data: sourcingRows, error: sourcingError }] = await Promise.all([
      sb
        .from("purchase_orders")
        .select(`
          *,
          purchase_items(*),
          purchase_costs(*),
          purchase_files(*)
        `)
        .order("ordered_at", { ascending: false }),
      sb
        .from("inventory_items")
        .select("id,item_name,item_type,series_name,image_url,lineup_image_url,source_url,memo"),
    ]);

    if (error) throw error;
    if (sourcingError) throw sourcingError;

    const sourcingByProductId = new Map<string, any>();
    const sourcingById = new Map<string, any>();

    for (const row of sourcingRows ?? []) {
      sourcingById.set(String(row.id), row);
      const productId = extractSourceProductId(row.source_url);
      if (productId && !sourcingByProductId.has(productId)) {
        sourcingByProductId.set(productId, row);
      }
    }

    const orders = (data ?? []).map((order: any) => ({
      ...order,
      purchase_items: (order.purchase_items ?? []).map((item: any) => {
        const productId =
          String(item.source_product_id || "").trim() ||
          extractSourceProductId(item.product_url) ||
          "";

        const sourcing =
          (item.sourcing_inventory_id
            ? sourcingById.get(String(item.sourcing_inventory_id))
            : null) ||
          (productId ? sourcingByProductId.get(productId) : null) ||
          null;

        return {
          ...item,
          source_product_id: item.source_product_id || productId || null,
          sourcing_inventory_id: item.sourcing_inventory_id || sourcing?.id || null,
          matched_name_ko: sourcing?.item_name || null,
          display_name_ko: item.display_name_ko || sourcing?.item_name || null,
          matched_image_url: sourcing?.image_url || null,
          matched_lineup_image_url: sourcing?.lineup_image_url || null,
          matched_series_name: sourcing?.series_name || null,
          matched_item_type: sourcing?.item_type || null,
          matched_memo: sourcing?.memo || null,
        };
      }),
    }));

    return NextResponse.json({
      ok: true,
      orders,
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
 * 매입 주문 / 상품 수정
 * PATCH /api/purchases
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const sb = createServiceRoleClient();

    // 상품 단위 저장
    if (body.item_id) {
      const updateData: Record<string, unknown> = {};

      if (body.display_name_ko !== undefined) {
        updateData.display_name_ko = String(body.display_name_ko || "").trim() || null;
      }

      if (body.sourcing_inventory_id !== undefined) {
        updateData.sourcing_inventory_id = body.sourcing_inventory_id || null;
      }

      if (body.source_product_id !== undefined) {
        updateData.source_product_id = body.source_product_id || null;
      }

      const { data: item, error: itemError } = await sb
        .from("purchase_items")
        .update(updateData)
        .eq("id", body.item_id)
        .select()
        .single();

      if (itemError) throw itemError;

      return NextResponse.json({ ok: true, item });
    }

    // 주문 단위 저장
    if (!body.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "매입 주문 ID가 없습니다.",
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.order_status !== undefined) {
      updateData.order_status = body.order_status;
    }

    if (body.memo !== undefined) {
      updateData.memo = body.memo;
    }

    const { data: order, error } = await sb
      .from("purchase_orders")
      .update(updateData)
      .eq("id", body.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      order,
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
