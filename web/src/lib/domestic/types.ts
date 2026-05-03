export type Platform = "wise" | "x" | "bunjang";

export type DomesticPreviewRow = {
  selected: boolean;
  platform: Platform;
  order_id: string;
  source_order_dates: string[];
  first_order_date: string;
  nickname: string;
  recipient_name: string;
  phone: string;
  postal_code: string;
  address: string;
  order_count: number;
  item_texts: string[];
  item_total_price: number;
  memo?: string;
};

export type DomesticTrackingPreview = {
  order_id_input?: string;
  recipient_name?: string;
  phone?: string;
  address?: string;
  tracking_number: string;
  match_status:
    | "matched_by_order_id"
    | "matched_by_name_phone"
    | "matched_by_name_address"
    | "duplicate_candidate"
    | "not_found"
    | "missing_tracking";
  matched_order_id?: string;
};
