import {vaulticError as paymentError} from './vaultic-api.mjs';
export const PINPAY_API_URL='https://api.usepinpay.com/functions/v1/api-v1';
export function createPinpayClient({key,url=PINPAY_API_URL,fetcher=fetch}={}){
 if(new URL(url).protocol!=='https:')throw paymentError('configuration_error','PINPAY_API_URL precisa usar HTTPS.',503);
 async function call(path,body,idempotencyKey){
  if(!/^sk_(live|test)_/.test(key||''))throw paymentError('configuration_error','Configure PINPAY_SECRET_KEY no servidor.',503);
  let r;try{r=await fetcher(url.replace(/\/$/,'')+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}catch{throw paymentError('network_error','Não foi possível confirmar a resposta do Pix. Tente novamente para recuperar a mesma cobrança.',502);}
  let raw;try{raw=await r.json();}catch{throw paymentError('invalid_response','O serviço Pix retornou uma resposta inválida.',502);}
  if(!r.ok){const code=String(raw.error?.code||raw.code||'provider_error');console.warn('[PinPay]',{code,http:r.status});const message=r.status===401||r.status===403?'Pix temporariamente indisponível. A loja precisa conferir a configuração.':r.status===422?'Não foi possível gerar o Pix. Confira os dados do comprador.':r.status===409?'O pedido foi alterado. Inicie uma nova tentativa.':'O Pix está temporariamente indisponível. Tente novamente.';throw paymentError(code,message,r.status,{retryNewOrder:r.status===409});}
  return {payment:raw.data||raw,replayed:r.headers?.get?.('Idempotent-Replayed')==='true'};
 }
 return {
  createPixCharge:order=>call('/pix',{amount:order.amount,description:order.payload.description.slice(0,255),customer:{name:order.payload.customer.name,email:order.payload.customer.email,document:{number:order.payload.customer.document}},metadata:{external_reference:order.id,checkout_url:order.payload.sourceUrl}},order.idempotencyKey),
  getPayment:async id=>(await call('/pix/'+encodeURIComponent(id))).payment
 };
}
