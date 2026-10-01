import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { hashToken } from '@/lib/auth';
import { jsonError } from '@/lib/http';

const schema=z.object({email:z.string().email().transform(v=>v.toLowerCase())});
export async function POST(req:Request){
 try{
  const {email}=schema.parse(await req.json());
  const user=await prisma.user.findUnique({where:{email},include:{batchMemberships:{where:{role:'LINE_MANAGER',isActive:true},take:1}}});
  let devMagicLink:string|undefined;
  if(user&&user.isActive&&user.batchMemberships.length){
    const token=randomBytes(32).toString('base64url');
    const ttl=Number(process.env.MAGIC_LINK_TTL_MINUTES||20);
    await prisma.magicLinkToken.create({data:{userId:user.id,purpose:'MANAGER_LOGIN',tokenHash:hashToken(token),expiresAt:new Date(Date.now()+ttl*60_000)}});
    const base=process.env.APP_URL||'http://localhost:3000';
    const link=`${base}/api/auth/magic-link/consume?token=${encodeURIComponent(token)}`;
    // Sprint 1 creates the secure token. Email/WhatsApp adapters are wired in Sprint 4.
    if(process.env.NODE_ENV!=='production') devMagicLink=link;
  }
  return NextResponse.json({ok:true,message:'Jika email terdaftar sebagai Line Manager, tautan login akan dikirim.',...(devMagicLink?{devMagicLink}:{})});
 }catch(e){return jsonError(e)}
}
