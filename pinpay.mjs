export const PINPAY_BASE='https://api.usepinpay.com/functions/v1/api-v1';
export function pinpayFetcher({secretKey,fetcher=fetch}){
 return async(url,options={})=>{
  if(!url.startsWith('https://uruspaypagamentos.com/api/v1/'))return fetcher(url,options);
  const creating=url.endsWith('/charge');
  const path=creating?'/pix':'/transactions/'+encodeURIComponent(url.split('/').at(-1));
  let body;
  if(creating){const p=JSON.parse(options.body);body={amount:Math.round(p.valor*100),description:p.descricao.slice(0,160),customer:{name:p.nome,email:p.email,document:{number:p.cpf}},items:p.itens.map(x=>({id:x.id,title:x.nome,quantity:x.quantidade,unit_price:Math.round(x.preco_unitario*100)})),metadata:{external_reference:p.evento_id,checkout_url:p.checkout_url,utm_source:p.utm_source,utm_medium:p.utm_medium,utm_campaign:p.utm_campaign,utm_content:p.utm_content,utm_term:p.utm_term},webhook_url:p.webhook_url};}
  const response=await fetcher(PINPAY_BASE+path,{method:creating?'POST':'GET',headers:{Authorization:'Bearer '+secretKey,'Content-Type':'application/json',...(creating?{'Idempotency-Key':body.metadata.external_reference}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:options.signal||AbortSignal.timeout(20000)});
  const raw=await response.json();const d=raw.data||raw;
  const state={approved:'paid',completed:'paid',pending:'pending',waiting_payment:'pending',expired:'cancelled',canceled:'cancelled',refunded:'refunded'}[d.status]||d.status;
  if(!response.ok||d.error){console.warn('[PinPay] solicitação recusada',{http:response.status,code:d.error?.code||d.code});return {ok:false,status:response.status,json:async()=>({ok:false})}}
  return {ok:true,status:response.status,json:async()=>({ok:true,venda_id:d.id,status:state,pago:state==='paid',valor:Number(d.amount)/100,email:d.customer?.email,evento_id:d.external_reference||d.metadata?.external_reference,pago_em:d.paid_at||d.approved_at,pix_code:d.pix?.qr_code||d.qr_code,expira_em:d.pix?.expires_at||d.expires_at,check_status_url:'https://uruspaypagamentos.com/api/v1/status/'+d.id})};
 };
}
