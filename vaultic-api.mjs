export const vaulticError=(code,message,status=400,extra={})=>Object.assign(new Error(message),{code,status,...extra});
export function createVaulticClient({key=process.env.VAULTIC_API_KEY,url=process.env.VAULTIC_API_URL||'https://api.vaulticpay.com',fetcher=fetch}={}){
 async function call(path,body,idempotencyKey){
  if(!/^vk_(live|test)_/.test(key||''))throw vaulticError('configuration_error','PIX indisponível: configure VAULTIC_API_KEY no servidor.',503);
  if(!/^https:\/\//.test(url))throw vaulticError('configuration_error','VAULTIC_API_URL precisa usar HTTPS.',503);
  let response;try{response=await fetcher(url.replace(/\/$/,'')+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})}catch{throw vaulticError('network_error','Não foi possível confirmar a resposta do PIX. Tente novamente; a mesma cobrança será recuperada.',502)}
  let data;try{data=await response.json()}catch{throw vaulticError('invalid_response','O serviço PIX retornou uma resposta inválida. Tente novamente.',502)}
  if(!response.ok){const e=data.error||{},safe={unauthorized:'PIX temporariamente indisponível. A loja precisa conferir a configuração.',account_not_active:'PIX temporariamente indisponível. A loja precisa concluir a ativação.',payment_rejected:'Não foi possível aprovar este pagamento. Escolha outra forma de pagamento.',provider_unavailable:'O PIX está temporariamente indisponível. Você pode iniciar uma nova tentativa.',amount_below_minimum:'O valor deste pedido está abaixo do mínimo permitido para PIX.'};throw vaulticError(e.code||'internal_error',safe[e.code]||e.message||'Não foi possível processar o PIX.',response.status,{fields:e.fields,retryNewOrder:['idempotency_conflict','provider_unavailable'].includes(e.code)});}
  return {payment:data,replayed:response.headers?.get?.('Idempotent-Replayed')==='true'};
 }
 return {
  createPixCharge:async pedido=>{if(!/^[A-Za-z0-9_:.\-]{8,128}$/.test(pedido.idempotencyKey))throw vaulticError('idempotency_key_required','Identificação do pedido inválida.');return call('/v1/payments',pedido.payload,pedido.idempotencyKey)},
  getPayment:async id=>(await call('/v1/payments/'+encodeURIComponent(id))).payment
 };
}
