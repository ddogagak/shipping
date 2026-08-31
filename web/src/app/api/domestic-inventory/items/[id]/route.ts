import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildInventorySku } from "@/lib/inventorySku";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = createServiceRoleClient();

    const currency = String(body.currency ?? "JPY").toUpperCase();
    const purchasePrice = Number(body.purchase_price ?? body.total_price ?? body.yen_price ?? 0);
    const sku = buildInventorySku(
      String(body.source_url ?? ""),
      String(body.series_name ?? "기타"),
      body.option_seq === "" || body.option_seq == null ? 0 : body.option_seq
    );

    if (sku) {
      const { data: duplicate, error: duplicateError } = await supabase
        .from("inventory_items")
        .select("id, internal_sku, item_name")
        .eq("internal_sku", sku.internalSku)
        .neq("id", id)
        .maybeSingle();

      if (duplicateError) {
        return NextResponse.json({ ok: false, message: duplicateError.message }, { status: 500 });
      }
      if (duplicate) {
        return NextResponse.json(
          {
            ok: false,
            code: "DUPLICATE_INTERNAL_SKU",
            message: `관리번호 ${sku.internalSku}가 이미 존재해. 옵션번호를 다른 번호로 지정해줘.`,
          },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        item_name: body.item_name ?? "",
        item_type: body.item_type ?? "기타",
        series_name: body.series_name ?? "기타",
        image_url: body.image_url ?? "",
        lineup_image_url: body.lineup_image_url ?? "",
        source_url: body.source_url ?? "",
        order_number: body.order_number ?? "",
        order_date: body.order_date ?? "",
        tracking_number: body.tracking_number ?? "",
        quantity: Number(body.quantity ?? 1),
        currency,
        purchase_price: purchasePrice,
        yen_price: currency === "JPY" ? purchasePrice : 0,
        shipping_fee: Number(body.shipping_fee ?? 0),
        domestic_shipping_fee: Number(body.domestic_shipping_fee ?? 0),
        total_price: Number(body.total_price ?? purchasePrice),
        status: body.status ?? "입고전",
        memo: body.memo ?? "",
        component_count: body.component_count ? Number(body.component_count) : null,
        unit_sale_price: body.unit_sale_price ? Number(body.unit_sale_price) : null,
        source_site_code: sku?.sourceSiteCode ?? null,
        source_product_id: sku?.sourceProductId ?? null,
        option_seq: sku?.optionSeq ?? 0,
        internal_sku: sku?.internalSku ?? null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
      return NextResponse.json(
        {
          ok: false,
          code: duplicate ? "DUPLICATE_INTERNAL_SKU" : undefined,
          message: duplicate ? "같은 관리번호가 이미 존재해. 옵션번호를 다른 번호로 지정해줘." : error.message,
        },
        { status: duplicate ? 409 : 500 }
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.from("inventory_items").delete().eq("id", id).select("id").maybeSingle();
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, message: "삭제할 재고를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "삭제 실패" }, { status: 500 });
  }
}
