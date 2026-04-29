import { NextResponse } from "next/server";

import { parseEbayOrdersCsv } from "@/lib/import/ebay-orders";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV 파일이 필요합니다." }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseEbayOrdersCsv(text);

  return NextResponse.json({ orders: parsed });
}
