import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {createPinpayClient} from './pinpay-api.mjs';
import {createVaulticStore} from './vaultic-store.mjs';
import {rawBody,prepareVaulticOrder,applyVaulticPayment} from './vaultic-payments.mjs';
import {vaulticError as paymentError} from './vaultic-api.mjs';
import {createVaulticTracking} from './vaultic-tracking.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const labels={pending:'Aguardando pagamento',under_review:'Pagamento recebido, em análise',paid:'Pagamento confirmado',expired:'Pix expirado',failed:'Pagamento recusado',canceled:'Pagamento cancelado',refunded:'Pagamento estornado',chargeback:'Pagamento contestado'};
const statusMap={pending:'pending',processing:'under_review',paid:'paid',approved:'paid',refunded:'refunded',chargeback:'chargeback',failed:'failed',expired:'expired'};
export function verifyPinpaySignature(raw,header,secret){
 if(!secret)throw paymentError('configuration_error','Configure PINPAY_WEBHOOK_SECRET no servidor.',503);
 const match=/^sha256=([a-f0-9]{64})$/i.exec(String(header||''));
 if(!match||!timingSafeEqual(createHmac('sha256',secret).update(raw).digest(),Buffer.from(match[1],'hex')))throw paymentError('invalid_signature','Assinatura inválida.',401);
}
export function applyPinpayPayment(order,payment,{eventId,now=Date.now()}={}){
 const status=statusMap[String(payment.status||'').toLowerCase()];
 if(!status||payment.id!==order.pinpay_payment_id||!Number.isSafeInteger(payment.amount)||payment.amount!==order.amount)throw paymentError('payment_mismatch','Cobrança não corresponde ao pedido.',409);
 const reference=payment.external_reference||payment.metadata?.external_reference;
 if(reference&&reference!==order.id)throw paymentError('payment_mismatch','Referência do pedido divergente.',409);
 const internal={...order,vaultic_payment_id:order.pinpay_payment_id};
 const result=applyVaulticPayment(internal,{id:payment.id,amount:payment.amount,status,method:'pix',currency:'BRL',metadata:{orderId:order.id},updatedAt:payment.updated_at||new Date(now).toISOString(),paidAt:payment.paid_at},{eventId,now});
 if(!result)return;delete result.vaultic_payment_id;return result;
}
export function createPinpayPayments({env=process.env,root,fetcher=fetch,now=Date.now,store=createVaulticStore({root,token:env.BLOB_READ_WRITE_TOKEN,production:!!env.VERCEL,namespace:'pinpay'})}={}){
 const client=createPinpayClient({key:env.PINPAY_SECRET_KEY,url:env.PINPAY_API_URL,fetcher});
 const track=createVaulticTracking({store,env,fetcher,now,platform:'PinPay',eventPrefix:'pinpay'});
 const configured=()=>{if(!env.PINPAY_SECRET_KEY||!env.PINPAY_STATUS_SECRET)throw paymentError('configuration_error','Pix indisponível: configure as credenciais PinPay no servidor.',503);};
 const tokenFor=id=>id+'_'+createHmac('sha256',env.PINPAY_STATUS_SECRET).update('pinpay-status:'+id).digest('hex');
 function orderId(token){if(!/^[a-f0-9]{64}_[a-f0-9]{64}$/.test(token))return null;const id=token.slice(0,64);return timingSafeEqual(Buffer.from(tokenFor(id)),Buffer.from(token))?id:null;}
 const view=o=>({ok:true,gateway:'pinpay',amount:o.amount,valor_centavos:o.amount,venda_id:o.pinpay_payment_id,evento_id:'pinpay-'+o.id,payment_method:'pix',status:o.status,pago:o.status==='paid'&&!!o.paidAt,status_message:labels[o.status],pix_code:o.copyPaste,expira_em:o.expiresAt,order_summary:{items:o.orderItems,shipping:o.shippingAmount,total:o.amount},check_status_url:'/api/pinpay/status/'+tokenFor(o.id)});
 async function handle(req,res,route){
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(JSON.stringify(data));};
  try{
   configured();
   if(route==='/api/pinpay/webhook'&&req.method==='POST'){
    const raw=await rawBody(req);verifyPinpaySignature(raw,req.headers['x-webhook-signature'],env.PINPAY_WEBHOOK_SECRET);
    let e;try{e=JSON.parse(raw);}catch{throw paymentError('invalid_json','JSON inválido.');}
    if(!['payment_pending','payment_approved','pix_received','payment_failed','payment_refunded'].includes(e.event))return send(200,{ok:true,ignored:true});
    const paymentId=String(e.data?.transaction_id||e.data?.id||'');if(!/^[A-Za-z0-9_.:-]{1,160}$/.test(paymentId))throw paymentError('invalid_event','Cobrança ausente.',400);
    const index=await store.read(hash('payment:'+paymentId));if(!index?.orderId)return send(200,{ok:true,ignored:true});
    const id=index.orderId,eventId=hash(raw),order=await store.read(id);if(!order)throw paymentError('not_found','Pedido não encontrado.',503);
    if(Object.hasOwn(order.events,eventId))return send(200,{ok:true});
    // A signed notification is only a trigger: GET authenticates ID, amount and current status.
    const payment=await client.getPayment(paymentId);
    await store.transaction(id,o=>applyPinpayPayment(o,payment,{eventId,now:now()}));
    console.info('[PinPay]',{pinpay_payment_id:paymentId,event_id:eventId});send(200,{ok:true});track(id);return;
   }
   if(route==='/api/charge'&&req.method==='POST'){
    const origin=req.headers.origin;if(origin&&origin!=='https://'+req.headers.host&&origin!=='http://'+req.headers.host)throw paymentError('invalid_origin','Origem não autorizada.',403);
    let body;try{body=JSON.parse(await rawBody(req,16384));}catch(e){if(e.code)throw e;throw paymentError('invalid_json','Dados inválidos.');}
    const prepared=prepareVaulticOrder(body,req,{requireIPv4:false,minimumAmount:100});prepared.createdAt=now();prepared.idempotencyKey=randomUUID();
    prepared.tracking=Object.fromEntries(['src','sck','utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbp','fbc','user_agent'].map(k=>[k,String(body[k]||'').slice(0,500)]));
    let order=await store.transaction(prepared.id,o=>{if(o){if(o.fingerprint!==prepared.fingerprint)throw paymentError('idempotency_conflict','O pedido foi alterado. Inicie uma nova tentativa.',409,{retryNewOrder:true});return;}return prepared;});
    if(order.pinpay_payment_id&&order.copyPaste){send(200,view(order));track(order.id);return;}
    const result=await client.createPixCharge(order),p=result.payment;
    if(!/^[A-Za-z0-9_.:-]{1,160}$/.test(p.id||'')||p.amount!==order.amount||!Number.isSafeInteger(p.amount)||typeof p.pix?.qr_code!=='string'||!p.pix.qr_code||!(p.external_reference===order.id||p.metadata?.external_reference===order.id))throw paymentError('invalid_response','Resposta Pix não corresponde ao pedido.',502);
    order=await store.transaction(order.id,o=>{if(o.pinpay_payment_id&&o.pinpay_payment_id!==p.id)throw paymentError('payment_mismatch','Cobrança divergente.',409);o.pinpay_payment_id=p.id;o.copyPaste=p.pix.qr_code;o.expiresAt=p.pix.expires_at;return o;});
    await store.transaction(hash('payment:'+p.id),index=>{if(index?.orderId&&index.orderId!==order.id)throw paymentError('payment_mismatch','Cobrança divergente.',409);return {orderId:order.id};});
    // Creation alone never confirms payment. Only the authenticated status GET does.
    console.info('[PinPay]',{pinpay_payment_id:p.id,replayed:result.replayed});send(200,view(order));track(order.id);return;
   }
   const match=route.match(/^\/api\/pinpay\/(status|qr)\/([a-f0-9_]+)$/);
   if(match&&req.method==='GET'){
    const id=orderId(match[2]);let order=id&&await store.read(id);if(!order)throw paymentError('not_found','Pedido não encontrado.',404);
    if(match[1]==='qr'){const png=await QRCode.toBuffer(order.copyPaste,{type:'png',width:360,margin:4,errorCorrectionLevel:'M'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(png);}
    if(order.pinpay_payment_id&&['pending','under_review'].includes(order.status)&&now()-order.createdAt<48*3600000&&now()-(order.lastCheckedAt||0)>=5000){
     const owner=randomUUID(),claimed=await store.transaction(id,o=>{if(now()-(o.lastCheckedAt||0)<5000)return;o.reconcileOwner=owner;o.lastCheckedAt=now();return o;});
     if(claimed.reconcileOwner===owner){const payment=await client.getPayment(order.pinpay_payment_id);await store.transaction(id,o=>applyPinpayPayment(o,payment,{now:now()}));}order=await store.read(id);
    }
    send(200,view(order));track(id);return;
   }
   return send(404,{ok:false,error:'Rota não encontrada.'});
  }catch(e){console.warn('[PinPay]',{code:e.code||'internal_error'});return send(e.status||500,{ok:false,error:e.code?e.message:'Não foi possível processar o Pix.',code:e.code||'internal_error',...(e.retryNewOrder?{retryNewOrder:true}:{})});}
 }
 return {handle,store};
}
