import { NextResponse } from 'next/server';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { buildTeamLeaderboard } from '@/lib/team-leaderboard';

export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const data=await buildTeamLeaderboard(batchId);
    if(!data)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
    await assertPermission('BATCH_ACTIVITY_READ',{tenantId:data.batch.tenantId,batchId});
    return NextResponse.json(data);
  }catch(e){return jsonError(e)}
}
