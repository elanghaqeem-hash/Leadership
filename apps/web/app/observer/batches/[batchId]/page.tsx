import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import ObserverRubricClient from './ObserverRubricClient';

export default async function ObserverRubricPage({params}:{params:Promise<{batchId:string}>}){
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true}});
  if(!batch)redirect('/dashboard');
  try{
    await assertPermission('BATCH_ACTIVITY_READ',{tenantId:batch.tenantId,batchId});
  }catch(error){
    if(error instanceof AuthError)redirect('/dashboard');
    throw error;
  }
  return <ObserverRubricClient batchId={batchId}/>;
}
