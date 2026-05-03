import type { DomesticPreviewRow, Platform } from "./types";

const PREFIX: Record<Platform, string> = { wise: "W", x: "X", bunjang: "B" };

function toIntKRW(line: string): number {
  const m = line.replace(/,/g, "").match(/(\d{1,9})\s*원?/);
  return m ? Number(m[1]) : 0;
}

function cleanName(raw: string): { recipient_name: string; nickname: string } {
  const m = raw.match(/^(.+?)\((.+?)\)/);
  if (!m) return { recipient_name: raw.trim(), nickname: raw.trim() };
  return { recipient_name: m[1].trim(), nickname: m[2].trim() };
}

function normPhone(phone: string): string {
  return phone.replace(/\(안심번호\)/g, "").trim();
}

function makeOrderId(platform: Platform, nickname: string): string {
  return `${PREFIX[platform]}${nickname}`;
}

export function parseDomesticText(text: string, platform: Platform): DomesticPreviewRow[] {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((v) => v.trim()).filter(Boolean);
  const dateRe = /^\d{4}\.\s*\d{2}\.\s*\d{2}\s*\/\s*\d{2}:\d{2}$/;
  const starts: number[] = [];
  lines.forEach((l, i) => { if (dateRe.test(l)) starts.push(i); });
  if (!starts.length) starts.push(0);

  const blocks: string[][] = starts.map((s, idx) => lines.slice(s, idx + 1 < starts.length ? starts[idx + 1] : lines.length));

  const rows: DomesticPreviewRow[] = blocks.map((block) => {
    const dateLine = block.find((l) => dateRe.test(l)) || "";
    const shipIdx = block.findIndex((l) => l.includes("배송 정보"));
    const contactIdx = block.findIndex((l) => l.includes("연락처"));
    const shipFeeIdx = block.findIndex((l) => l.includes("배송비"));

    const nameLine = shipIdx >= 0 ? block[shipIdx + 1] || "" : "";
    const { recipient_name, nickname } = cleanName(nameLine);

    const addrLine = shipIdx >= 0 ? block[shipIdx + 2] || "" : "";
    const postMatch = addrLine.match(/^\[(\d{5})\]\s*(.+)$/);
    const postal = postMatch ? postMatch[1] : "";
    const address = postMatch ? postMatch[2] : addrLine;

    const phoneLine = contactIdx >= 0 ? block[contactIdx + 1] || "" : "";
    const phone = normPhone(phoneLine);

    const items: string[] = [];
    let itemTotal = 0;
    block.forEach((line, i) => {
      if (!line.startsWith("#")) return;
      items.push(line);
      const priceLine = block[i + 1] || "";
      itemTotal += toIntKRW(priceLine);
    });

    // 배송비 줄 제외 보정: item price 추출이 배송비 라인을 타는 경우 방지
    if (shipFeeIdx >= 0) {
      const feeLine = block[shipFeeIdx + 1] || "";
      const fee = toIntKRW(feeLine);
      if (fee > 0 && itemTotal >= fee && /배송비|합배송/.test(feeLine)) itemTotal -= fee;
    }

    return {
      selected: true,
      platform,
      order_id: makeOrderId(platform, nickname || recipient_name),
      source_order_dates: dateLine ? [dateLine] : [],
      first_order_date: dateLine,
      nickname,
      recipient_name,
      phone,
      postal_code: postal,
      address,
      order_count: 1,
      item_texts: items,
      item_total_price: itemTotal,
      memo: ""
    };
  });

  const grouped = new Map<string, DomesticPreviewRow>();
  for (const r of rows) {
    const key = `${r.platform}|${r.nickname}|${r.recipient_name}|${r.phone}|${r.address}`;
    const cur = grouped.get(key);
    if (!cur) {
      grouped.set(key, { ...r });
      continue;
    }
    cur.source_order_dates = [...cur.source_order_dates, ...r.source_order_dates].filter(Boolean);
    cur.first_order_date = [cur.first_order_date, r.first_order_date].filter(Boolean).sort()[0] || "";
    cur.order_count += 1;
    cur.item_texts = [...cur.item_texts, ...r.item_texts];
    cur.item_total_price += r.item_total_price;
  }

  return [...grouped.values()];
}

export function toDomesticExcelRows(rows: DomesticPreviewRow[]) {
  return rows.map((r) => ({
    "받는분성명": r.recipient_name,
    "받는분우편번호": r.postal_code ? `'${r.postal_code}` : "",
    "받는분전화번호": r.phone ? `'${r.phone}` : "",
    "받는분주소(전체)": r.address,
    "받는분주소(분할)": r.address,
    "고객주문번호": r.order_id,
    "품목명": "피규어",
    "내품명": `도파민베이커리-${r.nickname}`,
    "박스수량": 1,
    "박스타입": 1,
    "기본운임": "",
    "주문건수": r.order_count,
    "최초주문일": r.first_order_date,
    "아이템": r.item_texts.join(" | "),
    "상품금액합계": r.item_total_price
  }));
}
