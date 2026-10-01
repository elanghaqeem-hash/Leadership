import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import ImportClient from './ImportClient';

export default async function Page({params}:{params:Promise<{batchId:string}>}){
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({where:{id:batchId},include:{tenant:{select:{name:true}},_count:{select:{memberships:true}}}});
  if(!batch)redirect('/dashboard');
  try{await assertPermission('BATCH_MANAGE',{tenantId:batch.tenantId,batchId});}catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
  return <Shell title={`Peserta — ${batch.name}`} eyebrow={`${batch.tenant.name} · ${batch.code}`}><div className="mb-5 flex flex-wrap items-center gap-3 text-sm"><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Join code: <strong>{batch.joinCode}</strong></span><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Membership: <strong>{batch._count.memberships}</strong></span><Link href={`/admin/batches/${batchId}/staff`} className="rounded-full bg-navy px-3 py-1.5 font-semibold text-white">Kelola trainer & observer →</Link></div><ImportClient batchId={batchId}/></Shell>
}
