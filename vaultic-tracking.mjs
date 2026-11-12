import {randomUUID} from 'node:crypto';
import {waitUntil} from '@vercel/functions';
import {syncUtmify,utcDate} from './utmify.mjs';
import {sendMetaPurchase} from './meta.mjs';
export function createVaulticTracking({store,env,fetcher=fetch,now=Date.now}){
 if(!env.UTMIFY_API_TOKEN&&!env.META_ACCESS_TOKEN)return ()=>{};
 async function sync(id){
  const owner=randomUUID();const order=await store.transaction(id,o=>{if(!o)return;const status=o.status==='paid'?'paid':o.status==='refunded'?'refunded':o.status==='pending'?'waiting_payment':null;if(!status||o.trackingSent?.[status]||o.trackingLease?.until>now())return;o.trackingLease={owner,until:now()+60000};return o;});
  if(order?.trackingLease?.owner!==owner)return;
  const state=order.status==='paid'?'paid':order.status==='refunded'?'refunded':'waiting_payment';
  const p=order.payload,t=order.tracking||{},customer=p.customer;
  const utmOrder={orderId:order.id,platform:'Vaultic',paymentMethod:'pix',status:state,createdAt:utcDate(order.createdAt),approvedDate:order.paidAt?utcDate(order.paidAt):null,refundedAt:state==='refunded'?utcDate():null,customer:{name:customer.name,email:customer.email,phone:customer.phone,document:customer.document,country:'BR',ip:p.payerIp},products:p.items.map((x,i)=>({id:order.id+'-'+i,name:x.title,planId:null,planName:null,quantity:x.quantity,priceInCents:x.unitPrice})),trackingParameters:Object.fromEntries(['src','sck','utm_source','utm_campaign','utm_medium','utm_content','utm_term'].map(k=>[k,t[k]||null])),commission:{totalPriceInCents:order.amount,gatewayFeeInCents:0,userCommissionInCents:order.amount,currency:'BRL'}};
  const u=await syncUtmify({order:utmOrder,status:state,token:env.UTMIFY_API_TOKEN,fetcher});
  let meta={status:'sem_configuracao'};
  if(state==='paid'&&env.META_PIXEL_ID&&env.META_ACCESS_TOKEN){
   // Meta's external contract uses BRL decimals; order/gateway amounts stay cents.
   const {createHash}=await import('node:crypto');const hash=v=>createHash('sha256').update(v.trim().toLowerCase()).digest('hex');
   meta=await sendMetaPurchase({token:env.META_ACCESS_TOKEN,fetcher,purchase:{pixelId:env.META_PIXEL_ID,event:{event_name:'Purchase',event_id:'vaultic-'+order.id,event_time:Math.floor(Date.parse(order.paidAt)/1000),action_source:'website',event_source_url:p.sourceUrl,user_data:{em:[hash(customer.email)],country:[hash('br')],client_ip_address:p.payerIp,client_user_agent:t.user_agent,...(t.fbp?{fbp:t.fbp}:{}),...(t.fbc?{fbc:t.fbc}:{})},custom_data:{currency:'BRL',value:order.amount/100,content_type:'product',contents:p.items.map((x,i)=>({id:order.id+'-'+i,quantity:x.quantity,item_price:x.unitPrice/100}))}}}});
  }
  await store.transaction(id,o=>{if(o.trackingLease?.owner!==owner)return;o.trackingLease=null;o.trackingSent||={};if(['enviado','sem_credencial'].includes(u.status)&&(state!=='paid'||['enviado','sem_configuracao'].includes(meta.status)))o.trackingSent[state]=true;return o;});
 }
 return id=>{const task=sync(id).catch(()=>console.warn('[Vaultic]',{code:'tracking_retry_pending'}));if(env.VERCEL)waitUntil(task);};
}
