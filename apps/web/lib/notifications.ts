export type ReminderChannel = 'EMAIL_WEBHOOK' | 'WHATSAPP_WEBHOOK';

export type ReminderPayload = {
  event: 'FOLLOW_UP_REMINDER';
  checkpoint: 'D7' | 'D14' | 'D30';
  dueAt: string;
  recipient: {
    userId: string;
    name: string;
    email: string;
    role: 'PARTICIPANT' | 'LINE_MANAGER';
  };
  participant: {
    userId: string;
    name: string;
    email: string;
  };
  batch: {
    id: string;
    code: string;
    name: string;
  };
  destinationPath: string;
};

export type AccountNotificationPayload = {
  event: 'ACCOUNT_ACTIVATION' | 'MANAGER_MAGIC_LINK';
  recipient: {
    userId: string;
    name: string;
    email: string;
    role?: string;
  };
  link: string;
  expiresAt: string;
  batch?: {
    id: string;
    code: string;
    name: string;
  };
};

async function postJson(url:string,payload:unknown){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10_000);
  try{
    const response=await fetch(url,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        ...(process.env.NOTIFICATION_WEBHOOK_TOKEN?{'authorization':'Bearer '+process.env.NOTIFICATION_WEBHOOK_TOKEN}:{}),
      },
      body:JSON.stringify(payload),
      signal:controller.signal,
    });
    if(!response.ok)throw new Error('Notification webhook returned HTTP '+response.status);
  }finally{clearTimeout(timeout);}
}

export async function sendReminder(payload:ReminderPayload){
  const deliveries:Array<{channel:ReminderChannel;ok:boolean;error?:string}>=[];
  const emailUrl=process.env.NOTIFICATION_WEBHOOK_URL;
  if(emailUrl){
    try{await postJson(emailUrl,{channel:'email',...payload});deliveries.push({channel:'EMAIL_WEBHOOK',ok:true});}
    catch(error){deliveries.push({channel:'EMAIL_WEBHOOK',ok:false,error:error instanceof Error?error.message:'UNKNOWN'});}
  }
  const waUrl=process.env.WHATSAPP_WEBHOOK_URL;
  if(waUrl){
    try{await postJson(waUrl,{channel:'whatsapp',...payload});deliveries.push({channel:'WHATSAPP_WEBHOOK',ok:true});}
    catch(error){deliveries.push({channel:'WHATSAPP_WEBHOOK',ok:false,error:error instanceof Error?error.message:'UNKNOWN'});}
  }
  return deliveries;
}

export async function sendAccountNotification(payload:AccountNotificationPayload){
  const deliveries:Array<{channel:'EMAIL_WEBHOOK';ok:boolean;error?:string}>=[];
  const emailUrl=process.env.NOTIFICATION_WEBHOOK_URL;
  if(!emailUrl)return deliveries;
  try{
    await postJson(emailUrl,{channel:'email',...payload});
    deliveries.push({channel:'EMAIL_WEBHOOK',ok:true});
  }catch(error){
    deliveries.push({channel:'EMAIL_WEBHOOK',ok:false,error:error instanceof Error?error.message:'UNKNOWN'});
  }
  return deliveries;
}
