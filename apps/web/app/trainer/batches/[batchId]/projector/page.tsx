import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import ProjectorClient from './ProjectorClient';

export default async function ProjectorPage({params}:{params:Promise<{batchId:string}>}){
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true}});
  if(!batch)redirect('/dashboard');
  try{
    await assertPermission('SESSION_CONTROL',{tenantId:batch.tenantId,batchId});
  }catch(error){
    if(error instanceof AuthError)redirect('/dashboard');
    throw error;
  }
  return <ProjectorClient batchId={batchId}/>;
}
