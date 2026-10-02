import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import next from 'next';

const port=Number(process.env.PORT||3000);
const hostname=process.env.HOSTNAME||'0.0.0.0';
const dev=process.env.NODE_ENV!=='production';
const app=next({dev,hostname,port});
await app.prepare();
const handle=app.getRequestHandler();

function bus(){
  if(!globalThis.__ltwRealtimeBus){
    const emitter=new EventEmitter();
    emitter.setMaxListeners(500);
    globalThis.__ltwRealtimeBus=emitter;
  }
  return globalThis.__ltwRealtimeBus;
}

function verify(token){
  const secret=process.env.APP_SECRET;
  if(!secret||secret.length<32)return null;
  const [body,sig]=String(token||'').split('.');
  if(!body||!sig)return null;
  const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if(!payload.batchId||!payload.userId||!payload.exp||payload.exp<Math.floor(Date.now()/1000))return null;
    return payload;
  }catch{return null;}
}

function frameText(text){
  const payload=Buffer.from(text,'utf8');
  if(payload.length<126)return Buffer.concat([Buffer.from([0x81,payload.length]),payload]);
  if(payload.length<65536){
    const head=Buffer.alloc(4);head[0]=0x81;head[1]=126;head.writeUInt16BE(payload.length,2);
    return Buffer.concat([head,payload]);
  }
  const head=Buffer.alloc(10);head[0]=0x81;head[1]=127;head.writeBigUInt64BE(BigInt(payload.length),2);
  return Buffer.concat([head,payload]);
}

function reject(socket,status='401 Unauthorized'){
  socket.write('HTTP/1.1 '+status+'\r\nConnection: close\r\n\r\n');
  socket.destroy();
}

const server=http.createServer((req,res)=>handle(req,res));

server.on('upgrade',(req,socket)=>{
  try{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(url.pathname!=='/ws/realtime')return reject(socket,'404 Not Found');
    const payload=verify(url.searchParams.get('token'));
    if(!payload)return reject(socket);
    const key=req.headers['sec-websocket-key'];
    if(typeof key!=='string')return reject(socket,'400 Bad Request');
    const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: '+accept,
      '\r\n',
    ].join('\r\n'));

    const channel='batch:'+payload.batchId;
    const send=(event,data)=>{
      if(socket.destroyed)return;
      socket.write(frameText(JSON.stringify({event,data})));
    };
    const listener=(event)=>{
      if(payload.activityId&&event.resourceId&&event.resourceId!==payload.activityId&&event.type!=='ACTIVITY_STATUS')return;
      send('change',event);
    };
    bus().on(channel,listener);
    send('ready',{batchId:payload.batchId,activityId:payload.activityId||null,at:new Date().toISOString()});

    const cleanup=()=>bus().off(channel,listener);
    socket.on('close',cleanup);
    socket.on('end',cleanup);
    socket.on('error',cleanup);
    socket.on('data',(chunk)=>{
      if(chunk.length>0&&(chunk[0]&0x0f)===0x8){cleanup();socket.end();}
    });
  }catch{reject(socket,'400 Bad Request');}
});

server.listen(port,hostname,()=>console.log(`Leadership realtime server listening on http://${hostname}:${port}`));
