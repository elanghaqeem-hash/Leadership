import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { createSession, hashIp } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { headers } from 'next/headers';

const schema=z.object({email:z.string().email().transform(v=>v.toLowerCase()),password:z.string().min(8)});
export async function POST(req:Request){
 try{
  const input=schema.parse(await req.json());
  const user=await prisma.user.findUnique({where:{email:input.email}});
  const valid=Boolean(user?.passwordHash) && await argon2.verify(user!.passwordHash!,input.password).catch(()=>false);
  if(!user||!valid||!user.isActive) return NextResponse.json({error:'Email atau password tidak valid'},{status:401});
  if(user.mfaEnabled) return NextResponse.json({error:'MFA_REQUIRED',message:'Akun ini mewajibkan MFA. Endpoint verifikasi TOTP akan diaktifkan pada hardening auth.'},{status:428});
  await createSession(user.id);
  const h=await headers(); const ip=h.get('x-forwarded-for')?.split(',')[0]?.trim()??h.get('x-real-ip');
  await prisma.auditLog.create({data:{actorUserId:user.id,action:'LOGIN',resourceType:'User',resourceId:user.id,ipHash:hashIp(ip),metadata:{method:'PASSWORD'}}});
  return NextResponse.json({ok:true,user:{id:user.id,email:user.email,name:user.name,platformRole:user.platformRole}});
 }catch(e){return jsonError(e)}
}
