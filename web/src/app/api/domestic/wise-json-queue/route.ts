import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export async function GET() {
 const db = createServiceRoleClient();
 const { data, error } = await db.from("domestic_wise_import_queue").select("*").eq("review_status","pending").order("ordered_at",{ascending:false});
 return error ? NextResponse.json({error:error.message},{status:500}) : NextResponse.json({orders:data??[]});
}
