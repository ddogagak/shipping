import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

type CustomsCategory = {
  name: "doll" | "figure" | "postcard" | "poster" | "toy";
  code: "110" | "480" | "80" | "515" | "108";
};

const DOLL_KEYWORDS = ["毛绒", "毛絨", "玩偶", "娃娃", "布偶"];
const FIGURE_KEYWORDS = ["手办", "手辦", "模型", "人偶", "雕像", "PVC手办", "PVC手辦", "盒蛋"];
const POSTCARD_KEYWORDS = ["明信片", "明信卡"];
const POSTER_KEYWORDS = ["海报", "海報", "挂画", "掛畫"];

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyCustomsItem(productName: string, optionText: string): CustomsCategory {
  const text = `${productName || ""} ${optionText || ""}`;
  if (containsAny(text, DOLL_KEYWORDS)) return { name: "doll", code: "110" };
  if (containsAny(text, FIGURE_KEYWORDS)) return { name: "figure", code: "480" };
  if (containsAny(text, POSTCARD_KEYWORDS)) return { name: "postcard", code: "80" };
  if (containsAny(text, POSTER_KEYWORDS)) return { name: "poster", code: "515" };
  return { name: "toy", code: "108" };
}

function setCell(ws: XLSX.WorkSheet, rowNumber: number, columnIndex: number, value: string | number) {
  const address = XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnIndex });
  ws[address] = { t: typeof value === "number" ? "n" : "s", v: value };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, message: "배대지 엑셀로 추출할 주문을 체크해줘." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: orders, error } = await supabase
      .from("purchase_orders")
      .select("*, purchase_items(*)")
      .eq("country", "CN")
      .in("id", ids);
    if (error) throw error;

    const { data: sourcingRows, error: sourcingError } = await supabase
      .from("inventory_items")
      .select("id, source_url, image_url");
    if (sourcingError) throw sourcingError;

    const sourcingById = new Map<string, any>();
    const sourcingByProductId = new Map<string, any>();
    for (const row of sourcingRows ?? []) {
      sourcingById.set(String(row.id), row);
      const productId = extractSourceProductId(row.source_url);
      if (productId && !sourcingByProductId.has(productId)) sourcingByProductId.set(productId, row);
    }

    const templatePath = path.join(process.cwd(), "public/templates/basic_upload_sample_ko.xlsx");
    if (!fs.existsSync(templatePath)) throw new Error("배대지 템플릿이 없어. public/templates/basic_upload_sample_ko.xlsx 경로를 확인해줘.");

    const workbook = XLSX.read(fs.readFileSync(templatePath), { type: "buffer" });
    const worksheet = workbook.Sheets["업로드"];
    if (!worksheet) throw new Error("배대지 템플릿에 '업로드' 시트가 없어.");

    let rowNumber = 2;
    for (const order of orders ?? []) {
      for (const item of order.purchase_items ?? []) {
        const customs = classifyCustomsItem(String(item.product_name || ""), String(item.option_text || ""));
        const productId = String(item.source_product_id || "") || extractSourceProductId(item.product_url);
        const sourcing =
          (item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null) ||
          (productId ? sourcingByProductId.get(productId) : null);
        const imageUrl = String(item.image_url || "").trim() || String(sourcing?.image_url || "").trim();

        const values: Array<string | number> = [
          customs.name, customs.code, "", "",
          String(order.order_number || ""), Number(item.unit_price || 0), Number(item.quantity || 1),
          String(order.order_number || ""), String(item.product_name || ""), 1,
          String(item.product_url || ""), imageUrl,
          "", "", "", "", "", "", "",
          "케이템즈", "KTEMS", "010-6452-8842", "케이템즈5212011", "06736",
          "서울 서초구 강남대로 224 (양재동, 양재한신휴플러스) B1층 에이-24호",
          "", "", "", "", "", 1, 1,
        ];

        values.forEach((value, columnIndex) => setCell(worksheet, rowNumber, columnIndex, value));
        rowNumber += 1;
      }
    }

    worksheet["!ref"] = `A1:AF${Math.max(1, rowNumber - 1)}`;
    const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // 엑셀 생성에 성공한 선택 주문만 배대지 단계로 전환한다.
    const { error: statusError } = await supabase
      .from("purchase_orders")
      .update({ order_status: "배대지" })
      .in("id", ids);
    if (statusError) throw statusError;

    return new NextResponse(output, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=purchase_forwarder_upload.xlsx",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "엑셀 생성 실패" },
      { status: 500 }
    );
  }
}
