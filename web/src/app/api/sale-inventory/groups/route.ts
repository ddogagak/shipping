import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status = 400) => NextResponse.json({ok:false,message},{status});
export async function GET() {
  const sb = createServiceRoleClient();
  const { data, error } = await sb.from('sale_inventory_groups').select('id,title,active,group_kind,sale_price,sale_inventory_group_members(purchase_item_id)').order('created_at',{ascending:false});
  if(error) return fail(error.message,500);
  return NextResponse.json({ok:true,groups:data || []});
}
export async function POST(request: Request) {
  try {
    const body=await request.json(), action=String(body.action||''), group=body.group_id==null?null:String(body.group_id), title=String(body.title||'').trim();
    const ids=Array.isArray(body.member_ids)?body.member_ids.map(String):[];
    const sourceGroupIds=Array.isArray(body.source_group_ids)?body.source_group_ids.map(String):[];
    const creating=['create','create_pool'].includes(action);
    const selection=action==='create_selection';
    if(!['create','create_pool','create_selection','add','dissolve','merge'].includes(action)
      || (creating ? (!title||title.length>200||ids.length<2)
        : selection ? (!title||title.length>200||ids.length+sourceGroupIds.length<2)
        : !group||!uuid.test(group))
      || ids.length>100 || ids.some((id:string)=>!uuid.test(id))
      || (selection && (ids.length+sourceGroupIds.length>100
        || sourceGroupIds.some((id:string)=>!uuid.test(id))
        || new Set(ids).size!==ids.length
        || new Set(sourceGroupIds).size!==sourceGroupIds.length))
      || (action==='add'&&!ids.length)) return fail('묶음 선택을 확인해줘.');
    const sb=createServiceRoleClient();
    if(action==='merge'){
      if(!group||!uuid.test(group)||ids.length<1)return fail('합칠 재고풀을 선택해줘.');
      const {data,error}=await sb.rpc('merge_sale_inventory_pools',{p_target:group,p_sources:ids});
      if(error)return fail(error.message,409);
      return NextResponse.json({ok:true,id:data});
    }
    if(action==='create_pool'||action==='create_selection'){
      const price=Number(body.sale_price);
      if(!Number.isSafeInteger(price)||price<0)return fail('판매가격은 0원 이상의 정수로 입력해줘.');
      const {data,error}=action==='create_selection'
        ? await sb.rpc('create_sale_inventory_pool_from_selection',{
            p_title:title,p_sale_price:price,p_member_ids:ids,p_source_group_ids:sourceGroupIds
          })
        : await sb.rpc('create_sale_inventory_pool',{p_title:title,p_sale_price:price,p_member_ids:ids});
      if(error)return fail(error.message,409);
      return NextResponse.json({ok:true,id:data});
    }
    const {data,error}=await sb.rpc('manage_sale_inventory_group',{p_action:action,p_group_id:group,p_title:title||null,p_member_ids:ids});
    if(error) return fail(error.message,409);
    return NextResponse.json({ok:true,id:data});
  } catch(error) {return fail(error instanceof Error?error.message:'묶음 저장 실패',500);}
}
