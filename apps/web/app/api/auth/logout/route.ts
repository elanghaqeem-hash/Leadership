import { NextResponse } from 'next/server';
import { getCurrentUser, revokeCurrentSession } from '@/lib/auth';
import { prisma } from '@ltw/db';
export async function POST(){
 const user=await getCurrentUser();
 await revokeCurrentSession();
 if(user) await prisma.auditLog.create({data:{actorUserId:user.id,action:'LOGOUT',resourceType:'User',resourceId:user.id}});
 return NextResponse.json({ok:true});
}
