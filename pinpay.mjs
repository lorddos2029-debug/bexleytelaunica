export const PINPAY_BASE='https://api.usepinpay.com/functions/v1/api-v1';
export async function pinpayNotification(req,res,{secretKey,fetcher=fetch,handle}){
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 if(req.method!=='POST')return send(405,{ok:false});
 try{
  let body=req.body;if(Buffer.isBuffer(body))body=body.toString();if(typeof body==='string')body=JSON.parse(body);if(!body){let raw='';for await(const c of req){raw+=c;if(raw.length>64000)return send(413,{ok:false})}body=JSON.parse(raw)}
  const id=String(body.data?.transaction_id||body.data?.id||body.transaction_id||'');if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return send(400,{ok:false});
  // Never trust a posted status or callback reference: retrieve both from PinPay.
  const r=await fetcher(PINPAY_BASE+'/transactions/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+secretKey},signal:AbortSignal.timeout(15000)});if(!r.ok)return send(502,{ok:false});const json=await r.json(),data=json.data||json;
  const reference=data.metadata?.bexley_webhook_reference;if(!/^r_[A-Za-z0-9_-]{43}$/.test(reference||''))return send(200,{ok:true,ignored:true});
  return handle({headers:req.headers,body:{data:{transaction_id:id}}},res,'/api/urus/webhook/'+reference);
 }catch{return send(502,{ok:false})}
}
export function pinpayFetcher({secretKey,fetcher=fetch}){
 return async(url,options={})=>{
  if(!url.startsWith('https://uruspaypagamentos.com/api/v1/'))return fetcher(url,options);
  const creating=url.endsWith('/charge');
  const path=creating?'/pix':'/transactions/'+encodeURIComponent(url.split('/').at(-1));
  let body;
  if(creating){const p=JSON.parse(options.body);body={amount:Math.round(p.valor*100),description:p.descricao.slice(0,160),customer:{name:p.nome,email:p.email,document:{number:p.cpf}},items:p.itens.map(x=>({id:x.id,title:x.nome,quantity:x.quantidade,unit_price:Math.round(x.preco_unitario*100)})),metadata:{bexley_webhook_reference:p.webhook_url?.split('/').at(-1),external_reference:p.evento_id,checkout_url:p.checkout_url,utm_source:p.utm_source,utm_medium:p.utm_medium,utm_campaign:p.utm_campaign,utm_content:p.utm_content,utm_term:p.utm_term},webhook_url:p.webhook_url};}
  const response=await fetcher(PINPAY_BASE+path,{method:creating?'POST':'GET',headers:{Authorization:'Bearer '+secretKey,'Content-Type':'application/json',...(creating?{'Idempotency-Key':body.metadata.external_reference}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:options.signal||AbortSignal.timeout(20000)});
  const raw=await response.json();const d=raw.data||raw;
  const state={approved:'paid',completed:'paid',pending:'pending',waiting_payment:'pending',expired:'cancelled',canceled:'cancelled',refunded:'refunded'}[d.status]||d.status;
  if(!response.ok||d.error){console.warn('[PinPay] solicitação recusada',{http:response.status,code:d.error?.code||d.code});return {ok:false,status:response.status,json:async()=>({ok:false})}}
  return {ok:true,status:response.status,json:async()=>({ok:true,venda_id:d.id,status:state,pago:state==='paid',valor:Number(d.amount)/100,email:d.customer?.email,evento_id:d.external_reference||d.metadata?.external_reference,pago_em:d.paid_at||d.approved_at,pix_code:d.pix?.qr_code||d.qr_code,expira_em:d.pix?.expires_at||d.expires_at,check_status_url:'https://uruspaypagamentos.com/api/v1/status/'+d.id})};
 };
}
