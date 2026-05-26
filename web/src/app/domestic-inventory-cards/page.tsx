import InventoryCardsClient from "./InventoryCardsClient";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DomesticInventoryCardsPage() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return <main style={{ padding: 24 }}>DB 조회 실패: {error.message}</main>;
  }

  return <InventoryCardsClient initialItems={data ?? []} />;
}
