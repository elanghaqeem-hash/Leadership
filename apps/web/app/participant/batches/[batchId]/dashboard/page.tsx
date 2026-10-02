import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError, getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import ParticipantImpactDashboardClient from './ParticipantImpactDashboardClient';

export default async function ParticipantImpactDashboardPage({params}:{params:Promise<{batchId:string}>}){
  const {batchId}=await params;
  const user=await getCurrentUser();if(!user)redirect('/login');
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
  if(!batch)redirect('/dashboard');
  try{await assertPermission('INDIVIDUAL_DASHBOARD_READ',{tenantId:batch.tenantId,batchId,resourceUserId:user.id});}
  catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
  return <Shell title="My Leadership Impact" eyebrow={batch.code+' · '+batch.name}><ParticipantImpactDashboardClient batchId={batchId} userId={user.id}/></Shell>;
}
