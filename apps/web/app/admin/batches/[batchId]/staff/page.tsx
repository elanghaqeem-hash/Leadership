import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import StaffClient from './StaffClient';

export default async function Page({params}:{params:Promise<{batchId:string}>}){
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({where:{id:batchId},include:{tenant:{select:{name:true}}}});
  if(!batch)redirect('/dashboard');
  try{await assertPermission('BATCH_MANAGE',{tenantId:batch.tenantId,batchId});}catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
  return <Shell title={`Tim fasilitasi — ${batch.name}`} eyebrow={`${batch.tenant.name} · ${batch.code}`}><StaffClient batchId={batchId}/></Shell>;
}
