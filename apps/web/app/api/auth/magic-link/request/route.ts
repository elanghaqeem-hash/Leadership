import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { hashToken } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { sendAccountNotification } from '@/lib/notifications';
import { consumeRateLimit, rateLimitHeaders, requestIp } from '@/lib/rate-limit';

const schema=z.object({email:z.string().email().transform(v=>v.toLowerCase())});
export async function POST(req:Request){
 try{
  const {email}=schema.parse(await req.json());
  const limit=await consumeRateLimit({scope:'MANAGER_MAGIC_LINK',identifier:requestIp(req)+'|'+email,limit:5,windowMs:15*60_000});
  if(!limit.allowed)return NextResponse.json({error:'Terlalu banyak permintaan. Coba lagi nanti.'},{status:429,headers:rateLimitHeaders(limit)});
  const user=await prisma.user.findUnique({where:{email},include:{batchMemberships:{where:{role:'LINE_MANAGER',isActive:true},take:1}}});
  let devMagicLink:string|undefined;
  if(user&&user.isActive&&user.batchMemberships.length){
    const token=randomBytes(32).toString('base64url');
    const ttl=Number(process.env.MAGIC_LINK_TTL_MINUTES||20);
    const expiresAt=new Date(Date.now()+ttl*60_000);
    await prisma.magicLinkToken.create({data:{userId:user.id,purpose:'MANAGER_LOGIN',tokenHash:hashToken(token),expiresAt}});
    const base=process.env.APP_URL||'http://localhost:3000';
    const link=`${base}/api/auth/magic-link/consume?token=${encodeURIComponent(token)}`;
    await sendAccountNotification({
      event:'MANAGER_MAGIC_LINK',
      recipient:{userId:user.id,name:user.name,email:user.email,role:'LINE_MANAGER'},
      link,
      expiresAt:expiresAt.toISOString(),
    });
    if(process.env.NODE_ENV!=='production') devMagicLink=link;
  }
  return NextResponse.json({ok:true,message:'Jika email terdaftar sebagai Line Manager, tautan login akan dikirim.',...(devMagicLink?{devMagicLink}:{})});
 }catch(e){return jsonError(e)}
}
