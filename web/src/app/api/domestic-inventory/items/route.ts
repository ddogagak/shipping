import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildInventorySku } from "@/lib/inventorySku";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = createServiceRoleClient();

    const currency = String(body.currency ?? "JPY").toUpperCase();
    const purchasePrice = Number(
      body.purchase_price ?? body.total_price ?? body.yen_price ?? 0
    );
    let sku = buildInventorySku(
      String(body.source_url ?? ""),
      String(body.series_name ?? "기타"),
      body.option_seq ?? 0
    );
    let autoDuplicate = false;

    if (sku) {
      const { data: duplicate, error: duplicateError } = await supabase
        .from("inventory_items")
        .select("id, internal_sku, item_name")
        .eq("internal_sku", sku.internalSku)
        .maybeSingle();

      if (duplicateError) {
        return NextResponse.json({ ok: false, message: duplicateError.message }, { status: 500 });
      }

      if (duplicate) {
        const duplicateSku = buildInventorySku(
          String(body.source_url ?? ""),
          String(body.series_name ?? "기타"),
          99
        );

        if (!duplicateSku) {
          return NextResponse.json({ ok: false, message: "중복 관리번호를 생성하지 못했어." }, { status: 500 });
        }

        const { data: duplicate99, error: duplicate99Error } = await supabase
          .from("inventory_items")
          .select("id, internal_sku, item_name")
          .eq("internal_sku", duplicateSku.internalSku)
          .maybeSingle();

        if (duplicate99Error) {
          return NextResponse.json({ ok: false, message: duplicate99Error.message }, { status: 500 });
        }

        if (duplicate99) {
          return NextResponse.json(
            {
              ok: false,
              code: "DUPLICATE_OPTION_99",
              message: `중복용 관리번호 ${duplicateSku.internalSku}도 이미 존재해. 옵션번호를 직접 지정해줘.`,
            },
            { status: 409 }
          );
        }

        sku = duplicateSku;
        autoDuplicate = true;
      }
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
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
        raw_text: body.raw_text ?? "",
        component_count: body.component_count ? Number(body.component_count) : null,
        unit_sale_price: body.unit_sale_price ? Number(body.unit_sale_price) : null,
        source_site_code: sku?.sourceSiteCode ?? null,
        source_product_id: sku?.sourceProductId ?? null,
        option_seq: sku?.optionSeq ?? 0,
        internal_sku: sku?.internalSku ?? null,
      })
      .select()
      .single();

    if (error) {
      const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
      return NextResponse.json(
        {
          ok: false,
          code: duplicate ? "DUPLICATE_INTERNAL_SKU" : undefined,
          message: duplicate ? "같은 관리번호가 이미 존재해. 옵션번호를 확인해줘." : error.message,
        },
        { status: duplicate ? 409 : 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data,
      duplicate: autoDuplicate,
      message: autoDuplicate
        ? `중복 상품이라 옵션번호 99로 추가했어. (${sku?.internalSku ?? ""})`
        : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "저장 실패" },
      { status: 500 }
    );
  }
}
