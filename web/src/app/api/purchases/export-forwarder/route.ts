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
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    const supabase = createServiceRoleClient();

    let query = supabase
      .from("purchase_orders")
      .select("*, purchase_items(*)")
      .eq("country", "CN");

    if (ids.length > 0) query = query.in("id", ids);

    const { data: orders, error } = await query;
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
    if (!fs.existsSync(templatePath)) {
      throw new Error("배대지 템플릿이 없어. public/templates/basic_upload_sample_ko.xlsx 경로를 확인해줘.");
    }

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

        // A~AF: 사용자 지정 배대지 업로드 고정 매핑
        const values: Array<string | number> = [
          customs.name,                              // A 상품명(영문)
          customs.code,                              // B 품목분류코드
          "",                                        // C 색상
          "",                                        // D 사이즈
          String(order.order_number || ""),          // E 주문번호
          Number(item.unit_price || 0),              // F 단가
          Number(item.quantity || 1),                // G 수량
          String(order.order_number || ""),          // H 관리코드
          String(item.product_name || ""),           // I 상품코드 = 중국어 상품명
          1,                                         // J 포장박스수량
          String(item.product_url || ""),            // K 상품URL
          imageUrl,                                   // L 이미지URL
          "",                                        // M 쇼핑몰명
          "",                                        // N 쇼핑몰명(기타)
          "",                                        // O 쇼핑몰관리번호
          "",                                        // P 요청메시지
          "",                                        // Q 원산지작업
          "",                                        // R 포장보완
          "",                                        // S 정밀검수
          "케이템즈",                                 // T 수취인명
          "KTEMS",                                   // U 수취인영문이름
          "010-6452-8842",                           // V 휴대폰번호
          "케이템즈5212011",                          // W 개인통관고유부호/사업자등록번호
          "06736",                                   // X 우편번호
          "서울 서초구 강남대로 224 (양재동, 양재한신휴플러스) B1층 에이-24호", // Y 주소
          "",                                        // Z 상세주소
          "",                                        // AA 택배사 요청사항
          "",                                        // AB 자동배송요청
          "",                                        // AC 팀머니 자동결제
          "",                                        // AD 사업자 출고 알림톡
          1,                                         // AE 검수
          1,                                         // AF 포장
        ];

        values.forEach((value, columnIndex) => setCell(worksheet, rowNumber, columnIndex, value));
        rowNumber += 1;
      }
    }

    worksheet["!ref"] = `A1:AF${Math.max(1, rowNumber - 1)}`;

    const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
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
