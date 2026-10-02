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
  return <Shell title={`Peserta — ${batch.name}`} eyebrow={`${batch.tenant.name} · ${batch.code}`}><div className="mb-5 flex flex-wrap items-center gap-3 text-sm"><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Join code: <strong>{batch.joinCode}</strong></span><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Membership: <strong>{batch._count.memberships}</strong></span><Link href={`/admin/batches/${batchId}/staff`} className="rounded-full bg-navy px-3 py-1.5 font-semibold text-white">Kelola trainer & observer →</Link><Link href={`/admin/batches/${batchId}/teams`} className="rounded-full bg-teal px-3 py-1.5 font-semibold text-white">Kelola tim →</Link><Link href={`/admin/batches/${batchId}/observers`} className="rounded-full bg-sky-700 px-3 py-1.5 font-semibold text-white">Observer assignment →</Link><Link href={`/admin/batches/${batchId}/readiness`} className="rounded-full bg-slate-800 px-3 py-1.5 font-semibold text-white">Readiness →</Link><Link href={`/admin/batches/${batchId}/audit`} className="rounded-full bg-white px-3 py-1.5 font-semibold text-navy ring-1 ring-slate-300">Audit trail →</Link><a href={`/api/admin/batches/${batchId}/export-xlsx`} className="rounded-full border border-navy px-3 py-1.5 font-semibold text-navy">Export XLSX ↓</a><a href={`/api/reports/batches/${batchId}/evaluation`} className="rounded-full border border-navy px-3 py-1.5 font-semibold text-navy">Batch PDF ↓</a></div><ImportClient batchId={batchId}/></Shell>
}
