import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status = 400) => NextResponse.json({ok:false,message},{status});
export async function GET() {
  const sb = createServiceRoleClient();
  const { data, error } = await sb.from('sale_inventory_groups').select('id,title,active,sale_inventory_group_members(purchase_item_id)').order('created_at',{ascending:false});
  if(error) return fail(error.message,500);
  return NextResponse.json({ok:true,groups:data || []});
}
export async function POST(request: Request) {
  try {
    const body=await request.json(), action=String(body.action||''), group=body.group_id==null?null:String(body.group_id), title=String(body.title||'').trim();
    const ids=Array.isArray(body.member_ids)?body.member_ids.map(String):[];
    if(!['create','add','dissolve'].includes(action)|| (action==='create'?(!title||title.length>200||ids.length<2):!group||!uuid.test(group)) || ids.length>100 || ids.some((id:string)=>!uuid.test(id)) || (action==='add'&&!ids.length)) return fail('묶음 선택을 확인해줘.');
    const sb=createServiceRoleClient();
    const {data,error}=await sb.rpc('manage_sale_inventory_group',{p_action:action,p_group_id:group,p_title:title||null,p_member_ids:ids});
    if(error) return fail(error.message,409);
    return NextResponse.json({ok:true,id:data});
  } catch(error) {return fail(error instanceof Error?error.message:'묶음 저장 실패',500);}
}
