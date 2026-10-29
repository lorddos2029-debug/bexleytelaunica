import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {utmifyOrder,syncUtmify,utcDate} from './utmify.mjs';
import {metaPurchase,sendMetaPurchase} from './meta.mjs';
import {createWebhookStore} from './webhook-store.mjs';

export function createUrusWebhook({key,utmifyToken,metaPixelId,metaToken,fetcher=fetch,webhookStore=createWebhookStore(),platform='UrusPay',webhookPath='/api/urus/webhook/'}){
 const cipherKey=createHash('sha256').update('bexley-webhook-v1:'+key).digest();
 async function prepare(payload,eventId,origin){
  const order={...utmifyOrder(payload,'pending'),platform};
  const purchase=metaPixelId?metaPurchase({payload,eventId,pixelId:metaPixelId,sourceURL:origin+'/checkout'}):null;
  const context={order,purchase,reference:payload.evento_id,expires:Date.now()+7*86400000};
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cipherKey,iv);
  const encrypted=Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(context)))),cipher.final()]);
  const token=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  // Keep the gateway URL short: its webhook_url database column has a strict limit.
  // Customer data is encrypted in private durable storage, never placed in this URL.
  let url=null;
  if(webhookStore){try{const reference=randomBytes(32).toString('base64url');await webhookStore.write(reference,token);url=origin+webhookPath+'r_'+reference}catch{console.error('[Bexley webhook] armazenamento indisponível; consulta do checkout permanece ativa')}}
  else console.warn('[Bexley webhook] armazenamento não configurado; consulta do checkout permanece ativa');
  return {order,purchase,url};
 }
 async function decode(token){
  if(/^r_[A-Za-z0-9_-]{43}$/.test(token)){if(!webhookStore)return null;token=await webhookStore.read(token.slice(2))}
  if(!token||token.length>12000)return null;
  try{const raw=Buffer.from(token,'base64url'),decipher=createDecipheriv('aes-256-gcm',cipherKey,raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));const data=JSON.parse(inflateRawSync(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]),{maxOutputLength:60000}).toString());return data.expires>Date.now()?data:null}catch{return null}
 }
 const sent=new Map();
 async function handle(req,res,token){
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  const context=await decode(token);if(!context)return send(401,{ok:false,error:'Aviso não autorizado.'});
  let body=req.body;
  if(Buffer.isBuffer(body))body=body.toString();
  if(typeof body==='string'){try{body=JSON.parse(body)}catch{return send(400,{ok:false})}}
  if(!body||typeof body!=='object'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>64000)return send(413,{ok:false})}try{body=JSON.parse(raw)}catch{return send(400,{ok:false})}}
  const id=String(body.venda_id||body.transacao?.id||body.data?.transaction_id||body.data?.id||'');if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return send(400,{ok:false,error:'Venda inválida.'});
  const response=await fetcher('https://uruspaypagamentos.com/api/v1/status/'+id,{headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
  const status=await response.json();if(!response.ok||status.ok!==true)return send(502,{ok:false,error:'Não foi possível consultar o pagamento.'});
  if(String(status.venda_id)!==id||Math.round(Number(status.valor)*100)!==context.order.commission.totalPriceInCents||(status.email?String(status.email).trim().toLowerCase()!==context.order.customer.email.trim().toLowerCase():!context.reference||status.evento_id!==context.reference))return send(409,{ok:false,error:'Pagamento não corresponde ao pedido.'});
  // The encrypted callback URL is a private capability supplied only to UrusPay.
  // Payment state is always fetched independently; the POST cannot declare a sale paid.
  if(status.pago!==true&&status.status!=='paid')return send(200,{ok:true,status:'waiting_payment'});
  if(!status.pago_em)return send(502,{ok:false,error:'Data do pagamento ausente.'});
  const paidAt=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(status.pago_em)?status.pago_em.replace(' ','T')+'-03:00':status.pago_em;
  if(!Number.isFinite(Date.parse(paidAt)))return send(502,{ok:false,error:'Data do pagamento inválida.'});
  const approvedDate=utcDate(paidAt);
  const state=sent.get(id)||{};
  const order={...context.order,orderId:(platform==='PinPay'?'pinpay_':'')+id,approvedDate};
  const purchase=context.purchase?{...context.purchase,event:{...context.purchase.event,event_time:Math.floor(Date.parse(approvedDate.replace(' ','T')+'Z')/1000)}}:null;
  const [utmify,facebook]=await Promise.all([
   state.utmify?{status:'enviado',via:'cache'}:syncUtmify({order,status:'paid',token:utmifyToken,fetcher}),
   state.facebook?{status:'enviado'}:sendMetaPurchase({purchase,token:metaToken,fetcher})
  ]);
  state.utmify=utmify.status==='enviado';state.facebook=facebook.status==='enviado';sent.set(id,state);if(sent.size>1000)sent.delete(sent.keys().next().value);
  const ok=state.utmify&&state.facebook;
  console.info('[Bexley webhook]',{saleId:id,status:'paid',utmify:utmify.status,facebook:facebook.status});
  // A failed destination returns non-2xx so UrusPay retries the callback.
  return send(ok?200:502,{ok,status:'paid',utmify:utmify.status,facebook:facebook.status});
 }
 return {prepare,handle};
}
