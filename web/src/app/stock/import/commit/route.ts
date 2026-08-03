import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "stock-images";

type UploadedImage = {
  image_id: string;
  image_url: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
};

type VariantInput = { name: string; code: string; quantity: number };
type DraftInput = {
  id: string;
  image_ids: string[];
  cover_image_id: string;
  title: string;
  category: string;
  group_name: string;
  collection: string;
  item_type: string;
  mode: "single" | "variants";
  variants: VariantInput[];
};

type Metadata = {
  work_name: string;
  uploaded_images: UploadedImage[];
  drafts: DraftInput[];
};

function safe(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  const supabase = createServiceRoleClient();
  const createdProductIds: string[] = [];
  let uploadedPaths: string[] = [];

  try {
    const metadata = (await req.json()) as Metadata;
    if (!Array.isArray(metadata.drafts) || !metadata.drafts.length) {
      return NextResponse.json({ error: "등록할 상품 초안이 없습니다." }, { status: 400 });
    }
    if (!Array.isArray(metadata.uploaded_images)) {
      return NextResponse.json({ error: "업로드 이미지 정보가 없습니다." }, { status: 400 });
    }

    uploadedPaths = metadata.uploaded_images.map((image) => image.storage_path).filter(Boolean);
    const imageMap = new Map(metadata.uploaded_images.map((image) => [image.image_id, image]));

    const [{ data: categories, error: categoryError }, { data: defaultLocation, error: locationError }] = await Promise.all([
      supabase.from("stock_category").select("id,code,name"),
      supabase.from("stock_location").select("id,name").eq("name", "미지정").maybeSingle(),
    ]);
    if (categoryError) throw categoryError;
    if (locationError) throw locationError;

    let locationId = defaultLocation?.id || "";
    if (!locationId) {
      const { data: insertedLocation, error } = await supabase
        .from("stock_location")
        .insert({ name: "미지정", sort_order: 0 })
        .select("id")
        .single();
      if (error) throw error;
      locationId = insertedLocation.id;
    }

    const { data: batch, error: batchError } = await supabase
      .from("stock_batch")
      .insert({ name: safe(metadata.work_name) || "STOCK Import", source: "photo_import" })
      .select("id")
      .single();
    if (batchError) throw batchError;

    const results: Array<{ id: string; sku: string }> = [];

    for (let draftIndex = 0; draftIndex < metadata.drafts.length; draftIndex += 1) {
      const draft = metadata.drafts[draftIndex];
      if (!safe(draft.title)) throw new Error(`초안 ${draftIndex + 1}: 상품명이 없습니다.`);

      const category = (categories || []).find((row) => row.code === draft.category || row.name === draft.category);
      const cover = imageMap.get(draft.cover_image_id);
      const { data: product, error: productError } = await supabase
        .from("stock_product")
        .insert({
          category_id: category?.id || null,
          batch_id: batch.id,
          title: safe(draft.title),
          collection_name: safe(draft.collection) || null,
          folder_name: safe(draft.group_name) || null,
          item_type: safe(draft.item_type) || null,
          primary_image_url: cover?.image_url || null,
        })
        .select("id,sku")
        .single();
      if (productError) throw productError;
      createdProductIds.push(product.id);

      const variantRows = Array.isArray(draft.variants) && draft.variants.length
        ? draft.variants
        : [{ name: "기본", code: "BASE", quantity: 0 }];

      for (let variantIndex = 0; variantIndex < variantRows.length; variantIndex += 1) {
        const variantInput = variantRows[variantIndex];
        const { data: variant, error: variantError } = await supabase
          .from("stock_variant")
          .insert({
            product_id: product.id,
            variant_name: safe(variantInput.name) || "기본",
            variant_code: (safe(variantInput.code) || `V${variantIndex + 1}`).toUpperCase(),
            member_name: draft.category === "SKZ" ? safe(variantInput.name) || null : null,
            sort_order: variantIndex,
          })
          .select("id")
          .single();
        if (variantError) throw variantError;

        const quantity = Math.max(0, Math.floor(Number(variantInput.quantity || 0)));
        const { error: quantityError } = await supabase.from("stock_quantity").insert({
          variant_id: variant.id,
          location_id: locationId,
          quantity,
        });
        if (quantityError) throw quantityError;

        if (quantity > 0) {
          await supabase.from("stock_history").insert({
            variant_id: variant.id,
            location_id: locationId,
            action: "initial",
            quantity_change: quantity,
            quantity_after: quantity,
            reason: "사진 Import 최초 등록",
          });
        }
      }

      for (let imageIndex = 0; imageIndex < draft.image_ids.length; imageIndex += 1) {
        const imageId = draft.image_ids[imageIndex];
        const image = imageMap.get(imageId);
        if (!image) throw new Error(`초안 ${draftIndex + 1}: 업로드 이미지 정보 누락`);
        const isCover = imageId === draft.cover_image_id;
        const { error: imageError } = await supabase.from("stock_image").insert({
          product_id: product.id,
          variant_id: null,
          image_type: isCover ? "cover" : "original",
          image_url: image.image_url,
          storage_path: image.storage_path,
          sort_order: imageIndex,
          original_file_name: image.file_name,
          file_size: image.file_size,
          mime_type: image.mime_type || null,
        });
        if (imageError) throw imageError;
      }

      results.push({ id: product.id, sku: product.sku });
    }

    return NextResponse.json({ ok: true, product_count: results.length, products: results });
  } catch (error) {
    if (createdProductIds.length) {
      await supabase.from("stock_product").delete().in("id", createdProductIds);
    }
    if (uploadedPaths.length) {
      await supabase.storage.from(BUCKET).remove(uploadedPaths);
    }
    return NextResponse.json(
      { error: "STOCK 최종 등록 실패", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
