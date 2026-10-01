import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import ImportClient from './ImportClient';
export default async function Page({params}:{params:Promise<{batchId:string}>}){if(!await getCurrentUser())redirect('/login');const {batchId}=await params;const batch=await prisma.batch.findUnique({where:{id:batchId},include:{tenant:{select:{name:true}},_count:{select:{memberships:true}}}});if(!batch)redirect('/dashboard');return <Shell title={`Peserta — ${batch.name}`} eyebrow={`${batch.tenant.name} · ${batch.code}`}><div className="mb-5 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Join code: <strong>{batch.joinCode}</strong></span><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Membership: <strong>{batch._count.memberships}</strong></span></div><ImportClient batchId={batchId}/></Shell>}
