import crypto from 'node:crypto';

export type RealtimeTokenPayload={
  batchId:string;
  activityId?:string;
  userId:string;
  exp:number;
};

function secret(){
  const value=process.env.APP_SECRET;
  if(!value||value.length<32)throw new Error('APP_SECRET minimal 32 karakter untuk realtime token');
  return value;
}

export function signRealtimeToken(payload:RealtimeTokenPayload){
  const body=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
  const sig=crypto.createHmac('sha256',secret()).update(body).digest('base64url');
  return body+'.'+sig;
}

export function verifyRealtimeToken(token:string):RealtimeTokenPayload|null{
  const [body,sig]=token.split('.');
  if(!body||!sig)return null;
  const expected=crypto.createHmac('sha256',secret()).update(body).digest('base64url');
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as RealtimeTokenPayload;
    if(!payload.batchId||!payload.userId||!payload.exp||payload.exp<Math.floor(Date.now()/1000))return null;
    return payload;
  }catch{return null;}
}
