import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {isIPv4} from 'node:net';
import QRCode from 'qrcode';
import {createVaulticClient,vaulticError} from './vaultic-api.mjs';
import {createVaulticStore} from './vaultic-store.mjs';
import {validCPF} from './payments.mjs';
import {productFor,validItem,pixUnitPrice} from './assets/bexley/catalog.mjs';
import {createVaulticTracking} from './vaultic-tracking.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const statuses=new Set(['pending','under_review','paid','expired','failed','canceled','refunded','partially_refunded','med','chargeback']);
const messages={pending:'Aguardando pagamento',under_review:'Pagamento recebido, em análise',paid:'Pagamento confirmado',expired:'PIX expirado',failed:'Pagamento recusado',canceled:'Pagamento cancelado',refunded:'Pagamento estornado',partially_refunded:'Pagamento parcialmente estornado',med:'Pagamento em revisão manual',chargeback:'Pagamento contestado'};
export async function rawBody(req,limit=65536){
 // On Vercel req.body is a lazy JSON helper. Read the original stream before
 // touching that property; concatenating buffers also preserves UTF-8 boundaries.
 let chunks=[],length=0;
 if(req[Symbol.asyncIterator]){for await(const c of req){const b=Buffer.isBuffer(c)?c:Buffer.from(c);length+=b.length;if(length>limit)throw vaulticError('body_too_large','Dados excedem o limite.',413);chunks.push(b);}return Buffer.concat(chunks).toString('utf8');}
 const body=req.body;if(Buffer.isBuffer(body)||typeof body==='string'){if(Buffer.byteLength(body)>limit)throw vaulticError('body_too_large','Dados excedem o limite.',413);return body.toString('utf8');}
 throw vaulticError('raw_body_required','A rota exige o corpo bruto.',400);
}
export function verifyVaulticSignature(raw,header,secret,now=Date.now()){
 if(!secret)throw vaulticError('configuration_error','VAULTIC_WEBHOOK_SECRET não configurado.',503);
 const parts=String(header||'').split(','),t=parts.find(p=>p.startsWith('t='))?.slice(2),v=parts.find(p=>p.startsWith('v1='))?.slice(3);
 if(!/^\d+$/.test(t||'')||!/^([a-fA-F0-9]{64})$/.test(v||'')||Math.abs(Math.floor(now/1000)-Number(t))>300)throw vaulticError('invalid_signature','Assinatura inválida.',401);
 const expected=createHmac('sha256',secret).update(t+'.'+raw).digest();if(!timingSafeEqual(expected,Buffer.from(v,'hex')))throw vaulticError('invalid_signature','Assinatura inválida.',401);
}
export function buyerIPv4(req,{trustProxy=false}={}){
 const raw=String(trustProxy?(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||''):(req.socket?.remoteAddress||'' )).split(',')[0].trim();
 const ip=raw.startsWith('::ffff:')?raw.slice(7):raw;
 if(!isIPv4(ip)){console.warn('[Vaultic]',{code:'ipv4_required'});throw vaulticError('ipv4_required','Não foi possível identificar uma conexão IPv4 para o PIX. Tente outra conexão ou forma de pagamento.',422)}return ip;
}
export function prepareVaulticOrder(b,req,{trustProxy=false}={}){
 if(!/^ev_[A-Za-z0-9_-]{8,110}$/.test(b.evento_id||''))throw vaulticError('invalid_order','Identificação do pedido inválida. Atualize o checkout.');
 if(!validCPF(b.cpf))throw vaulticError('validation_error','CPF inválido. Confira os 11 números.');
 const name=String(b.nome||'').trim(),email=String(b.email||'').trim(),phone=String(b.telefone||'').replace(/\D/g,'');
 if(name.length<3||name.length>120)throw vaulticError('validation_error','Informe o nome completo.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw vaulticError('validation_error','Informe um e-mail válido.');
 if(!/^55[1-9]\d{9,10}$/.test(phone))throw vaulticError('validation_error','Informe o telefone com 55, DDD e número.');
 const a=b.endereco||{},zipCode=String(a.cep||'').replace(/\D/g,''),state=String(a.uf||'').toUpperCase();
 if(!/^\d{8}$/.test(zipCode)||!/^[A-Z]{2}$/.test(state)||!String(a.logradouro||'').trim()||!String(a.numero||'').trim()||!String(a.cidade||'').trim())throw vaulticError('validation_error','Confira CEP, rua, número, cidade e UF.');
 if(!['free','sedex'].includes(b.frete)||!Array.isArray(b.itens)||!b.itens.length||b.itens.length>5||b.itens.some(x=>!validItem(x))||b.itens.reduce((n,x)=>n+x.quantity,0)>99)throw vaulticError('validation_error','Confira os produtos e a opção de frete.');
 const items=b.itens.map(x=>({title:(productFor(x).shortName+' — '+x.color+(x.size?' · Tamanho '+x.size:'')).slice(0,120),quantity:x.quantity,unitPrice:pixUnitPrice(x)}));
 if(b.frete==='sedex')items.push({title:'Frete Sedex',quantity:1,unitPrice:1790});
 const amount=items.reduce((n,x)=>n+x.quantity*x.unitPrice,0);if(!Number.isSafeInteger(amount)||amount<1500||amount>10000000||items.some(x=>!Number.isSafeInteger(x.unitPrice)||x.unitPrice<1))throw vaulticError('amount_below_minimum','Valor do pedido fora dos limites do PIX.',422);
 const customer={name,email,document:String(b.cpf).replace(/\D/g,''),phone,address:{street:String(a.logradouro).trim(),number:String(a.numero).trim(),zipCode,city:String(a.cidade).trim(),state,...(a.complemento?{complement:String(a.complemento).slice(0,100)}:{}),...(a.bairro?{neighborhood:String(a.bairro).slice(0,100)}:{})}};
 const id=digest(b.evento_id),fingerprint=digest({items,customer,frete:b.frete});
 const proto=req.headers['x-forwarded-proto']==='https'?'https':'http',host=String(req.headers.host||'');
 return {id,fingerprint,amount,createdAt:Date.now(),orderItems:b.itens.map(x=>({name:productFor(x).shortName,color:x.color,size:x.size||'',quantity:x.quantity,unitPrice:pixUnitPrice(x),image:productFor(x).images[x.color]})),shippingAmount:b.frete==='sedex'?1790:0,status:'pending',order_status:'aguardando pagamento',events:{},releaseCount:0,fulfillment:'awaiting_payment',idempotencyKey:'pedido-'+id,payload:{method:'pix',amount,description:'Pedido '+id,isPhysicalProduct:true,payerIp:buyerIPv4(req,{trustProxy}),customer,items,metadata:{orderId:id},...(host?{sourceUrl:proto+'://'+host+'/checkout'}:{})}};
}
// Applied only after a verified webhook or an authenticated server GET.
export function applyVaulticPayment(order,payment,{eventId,now=Date.now()}={}){
 if(!statuses.has(payment.status)||payment.method!=='pix'||payment.currency!=='BRL'||!Number.isSafeInteger(payment.amount)||payment.amount!==order.amount||payment.metadata?.orderId!==order.id||(order.vaultic_payment_id&&order.vaultic_payment_id!==payment.id))throw vaulticError('payment_mismatch','Cobrança não corresponde ao pedido.',409);
 if(eventId&&Object.hasOwn(order.events,eventId))return;
 if(eventId)order.events[eventId]=now;
 const updated=Date.parse(payment.updatedAt);if(!Number.isFinite(updated))throw vaulticError('invalid_payment','Data da cobrança inválida.',409);
 const finalAfterPaid=['refunded','partially_refunded','med','chargeback'];
 if(updated<(order.paymentUpdatedAt||0)||(['paid',...finalAfterPaid].includes(order.status)&&['pending','under_review','expired','failed','canceled'].includes(payment.status))||(finalAfterPaid.includes(order.status)&&payment.status==='paid'))return order;
 order.vaultic_payment_id=payment.id;order.paymentUpdatedAt=updated;order.status=payment.status;order.order_status=messages[payment.status];order.lastCheckedAt=now;
 if(payment.status==='paid'&&!order.paidAt){order.paidAt=payment.paidAt||new Date(now).toISOString();order.releaseCount=1;order.fulfillment='ready';}
 if(payment.status==='under_review')order.fulfillment='awaiting_review';
 if(['expired','failed','canceled'].includes(payment.status))order.fulfillment='canceled';
 if(payment.status==='refunded'){order.fulfillment='refunded';order.refundedAmount=order.amount;}
 if(payment.status==='partially_refunded'){order.fulfillment='manual_review';order.refundedAmount=null;order.refundAmountNeedsReview=true;}
 if(['med','chargeback'].includes(payment.status)){order.fulfillment='on_hold';order.manualReview=true;}
 return order;
}
export function createVaulticPayments({env=process.env,root,fetcher=fetch,store=createVaulticStore({root,token:env.BLOB_READ_WRITE_TOKEN,production:!!env.VERCEL}),now=Date.now,trustProxy=!!env.VERCEL}={}){
 const client=createVaulticClient({key:env.VAULTIC_API_KEY,url:env.VAULTIC_API_URL,fetcher});
 const track=createVaulticTracking({store,env,fetcher,now});
 const configured=()=>{if(!env.VAULTIC_API_KEY||!env.VAULTIC_WEBHOOK_SECRET)throw vaulticError('configuration_error','PIX indisponível: configure VAULTIC_API_KEY e VAULTIC_WEBHOOK_SECRET no servidor.',503)};
 const tokenFor=id=>id+'_'+createHmac('sha256',env.VAULTIC_WEBHOOK_SECRET).update('vaultic-status:'+id).digest('hex');
 function orderId(token){if(!/^[a-f0-9]{64}_[a-f0-9]{64}$/.test(token))return null;const id=token.slice(0,64),expected=tokenFor(id);return timingSafeEqual(Buffer.from(expected),Buffer.from(token))?id:null;}
 const view=o=>({ok:true,gateway:'vaultic',amount:o.amount,valor_centavos:o.amount,venda_id:o.vaultic_payment_id,evento_id:'vaultic-'+o.id,payment_method:'pix',status:o.status,pago:o.status==='paid'&&!!o.paidAt,status_message:messages[o.status],pix_code:o.copyPaste,order_summary:{items:o.orderItems||o.payload.items.filter(x=>x.title!=='Frete Sedex').map(x=>({name:x.title,quantity:x.quantity,unitPrice:x.unitPrice})),shipping:o.shippingAmount??o.payload.items.filter(x=>x.title==='Frete Sedex').reduce((n,x)=>n+x.quantity*x.unitPrice,0),total:o.amount},check_status_url:'/api/vaultic/status/'+tokenFor(o.id)});
 async function handle(req,res,route){
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   configured();
   if(route==='/api/vaultic/webhook'&&req.method==='POST'){
    const raw=await rawBody(req);verifyVaulticSignature(raw,req.headers['vaultic-signature'],env.VAULTIC_WEBHOOK_SECRET,now());
    let e;try{e=JSON.parse(raw)}catch{throw vaulticError('invalid_json','JSON inválido.');}
    if(!/^evt_[A-Za-z0-9_-]{1,120}$/.test(e.id||'')||req.headers['vaultic-event-id']!==e.id||req.headers['vaultic-event-type']!==e.type||e.livemode!==env.VAULTIC_API_KEY.startsWith('vk_live_'))throw vaulticError('invalid_event','Evento inválido.',400);
    if(e.type==='ping'||!e.type?.startsWith('payment.'))return send(200,{ok:true});
    const p=e.data?.object,id=p?.metadata?.orderId;if(p?.livemode!==env.VAULTIC_API_KEY.startsWith('vk_live_'))throw vaulticError('payment_mismatch','Ambiente divergente.',409);if(!/^[a-f0-9]{64}$/.test(id||''))throw vaulticError('unknown_order','Pedido não encontrado.',404);
    await store.transaction(id,o=>{if(!o)throw vaulticError('unknown_order','Pedido não encontrado.',503);return applyVaulticPayment(o,p,{eventId:e.id,now:now()});});
    console.info('[Vaultic]',{vaultic_payment_id:p.id,event_id:e.id});send(200,{ok:true});track(id);return;
   }
   if(route==='/api/charge'&&req.method==='POST'){
    const origin=req.headers.origin;if(origin&&origin!=='https://'+req.headers.host&&origin!=='http://'+req.headers.host)throw vaulticError('invalid_origin','Origem não autorizada.',403);
    let b;try{b=JSON.parse(await rawBody(req,16384))}catch(e){if(e.code)throw e;throw vaulticError('invalid_json','Dados inválidos.');}
    const prepared=prepareVaulticOrder(b,req,{trustProxy});prepared.createdAt=now();prepared.tracking=Object.fromEntries(['src','sck','utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbp','fbc','user_agent'].map(k=>[k,String(b[k]||'').slice(0,500)]));
    let order=await store.transaction(prepared.id,o=>{if(o){if(o.fingerprint!==prepared.fingerprint)throw vaulticError('idempotency_conflict','O pedido foi alterado. Inicie uma nova tentativa.',409,{retryNewOrder:true});return;}return prepared;});
    if(order.vaultic_payment_id&&order.copyPaste){send(200,view(order));track(order.id);return;}
    if(order.creationBlocked)throw vaulticError(order.creationBlocked.code,order.creationBlocked.message,order.creationBlocked.status,{retryNewOrder:order.creationBlocked.retryNewOrder});
    let result;try{result=await client.createPixCharge(order)}catch(e){if(['provider_unavailable','payment_rejected','idempotency_conflict'].includes(e.code))await store.transaction(order.id,o=>{o.creationBlocked={code:e.code,message:e.message,status:e.status,retryNewOrder:!!e.retryNewOrder};return o;});throw e;}
    const p=result.payment;if(typeof p.id!=='string'||p.method!=='pix'||p.currency!=='BRL'||p.amount!==order.amount||p.metadata?.orderId!==order.id||p.livemode!==env.VAULTIC_API_KEY.startsWith('vk_live_')||typeof p.pix?.copyPaste!=='string')throw vaulticError('invalid_response','Resposta PIX não corresponde ao pedido.',502);
    order=await store.transaction(order.id,o=>{if(o.vaultic_payment_id&&o.vaultic_payment_id!==p.id)throw vaulticError('payment_mismatch','Cobrança divergente.',409);o.vaultic_payment_id=p.id;o.copyPaste=p.pix.copyPaste;if(!o.paymentUpdatedAt&&p.status!=='paid'&&statuses.has(p.status)){o.status=p.status;o.order_status=messages[p.status];}return o;});
    console.info('[Vaultic]',{vaultic_payment_id:p.id,replayed:result.replayed});send(200,view(order));track(order.id);return;
   }
   const match=route.match(/^\/api\/vaultic\/(status|qr)\/([a-f0-9_]+)$/);if(match&&req.method==='GET'){
    const id=orderId(match[2]);let order=id&&await store.read(id);if(!order)throw vaulticError('not_found','Pedido não encontrado.',404);
    if(match[1]==='qr'){if(!order.copyPaste)throw vaulticError('not_found','QR Code não encontrado.',404);const png=await QRCode.toBuffer(order.copyPaste,{type:'png',width:360,margin:4,errorCorrectionLevel:'M'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(png);}
    const age=now()-order.createdAt;
    if(order.vaultic_payment_id&&age>=120000&&age<48*3600000&&['pending','under_review'].includes(order.status)&&now()-(order.lastCheckedAt||0)>=30000){
     const owner=randomUUID();const claimed=await store.transaction(id,o=>{if(now()-(o.lastCheckedAt||0)<30000)return;o.reconcileOwner=owner;o.lastCheckedAt=now();return o;});
     if(claimed.reconcileOwner===owner){const p=await client.getPayment(order.vaultic_payment_id);if(p.livemode!==env.VAULTIC_API_KEY.startsWith('vk_live_'))throw vaulticError('payment_mismatch','Ambiente divergente.',409);await store.transaction(id,o=>applyVaulticPayment(o,p,{now:now()}));}
     order=await store.read(id);
    }
    send(200,view(order));track(order.id);return;
   }
   return send(404,{ok:false,error:'Rota não encontrada.'});
  }catch(e){console.warn('[Vaultic]',{code:e.code||'internal_error',event_id:req.headers['vaultic-event-id']||undefined});return send(e.status||500,{ok:false,error:e.code?e.message:'Não foi possível processar o PIX.',code:e.code||'internal_error',...(e.fields?{fields:e.fields}:{}),...(e.retryNewOrder?{retryNewOrder:true}:{})});}
 }
 return {handle,store};
}
