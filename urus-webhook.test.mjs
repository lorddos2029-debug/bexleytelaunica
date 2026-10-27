import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createPayments} from './payments.mjs';
import {createUrusWebhook} from './urus-webhook.mjs';
const orders=[],events=[];let chargePayload,paid=false,metaFail=false,amount=37.91,email='buyer@example.com';
const options={key:'test-key',root:path.join(os.tmpdir(),'bexley-webhook-test'),stateless:true,utmifyToken:'utm-test',metaPixelId:'pixel-test',metaToken:'meta-test',fetcher:async(url,o={})=>{
 if(url.includes('api.utmify.com.br')){orders.push(JSON.parse(o.body));return {ok:true,status:200,json:async()=>({OK:true})}}
 if(url.includes('graph.facebook.com')){events.push(JSON.parse(o.body).data[0]);return {ok:!metaFail,status:metaFail?503:200,json:async()=>metaFail?{error:{code:2}}:{events_received:1}}}
 if(o.method==='POST'){chargePayload=JSON.parse(o.body);return {ok:true,json:async()=>({ok:true,venda_id:998,pix_code:'test-code',status:'pending'})}}
 return {ok:true,json:async()=>({ok:true,venda_id:998,status:paid?'paid':'pending',pago:paid,valor:amount,email,pago_em:paid?'2026-10-27 20:35:16':null})};
}};
let handler=createPayments(options);
const server=http.createServer((req,res)=>{if(req.url==='/api/charge')req.headers.host='www.lojabexley.online';return handler(req,res,new URL(req.url,'http://test').pathname)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const body={nome:'Comprador Teste',email,cpf:'52998224725',evento_id:'ev_webhook_test_123456',frete:'free',endereco:{cep:'01001000',logradouro:'Praça',numero:'1',bairro:'Sé',cidade:'São Paulo',uf:'SP'},itens:[{productId:'vibration',color:'Vibration',quantity:1}],utm_source:'FB',utm_campaign:'campaign|123',fbp:'fb.1.123.browser',fbc:'fb.1.123.click'};
try{
 const response=await fetch(base+'/api/charge',{method:'POST',body:JSON.stringify(body)});assert.equal(response.status,200);
 assert(chargePayload.webhook_url.startsWith('https://www.lojabexley.online/api/urus/webhook/'));
 assert(!chargePayload.webhook_url.includes(email));assert(chargePayload.webhook_url.length<2048);
 const callback=new URL(chargePayload.webhook_url).pathname,post=()=>fetch(base+callback,{method:'POST',body:JSON.stringify({venda_id:998,status:'paid'})});
 handler=createPayments(options); // Cold start: no browser session or local saved order.
 assert.equal((await post()).status,200);assert.equal(events.length,0);assert.equal(orders.length,1);
 paid=true;amount=999;assert.equal((await post()).status,409);amount=37.91;
 email='other@example.com';assert.equal((await post()).status,409);email=body.email;
 const forged=await fetch(base+callback+'tampered',{method:'POST',body:JSON.stringify({venda_id:998})});assert.equal(forged.status,401);
 metaFail=true;assert.equal((await post()).status,502);assert.equal(orders.length,2);assert.equal(orders[1].status,'paid');
 assert.equal(orders[1].orderId,orders[0].orderId);assert.equal(orders[1].createdAt,orders[0].createdAt);assert.equal(orders[1].approvedDate,'2026-10-27 23:35:16');assert.equal(orders[1].trackingParameters.utm_campaign,'campaign|123');
 metaFail=false;assert.equal((await post()).status,200);assert.equal(orders.length,2);assert.equal(events.length,2);assert.equal(events[1].event_id,body.evento_id);assert.equal(events[1].event_time,Date.parse('2026-10-27T23:35:16Z')/1000);assert.equal(events[1].user_data.fbc,body.fbc);
 assert.equal((await post()).status,200);assert.equal(events.length,2);
 handler=createPayments(options);assert.equal((await post()).status,200);assert.equal(events[2].event_id,events[1].event_id);assert.equal(orders[2].orderId,orders[1].orderId);
 const expired=createUrusWebhook(options);const realNow=Date.now;let expiredURL;try{Date.now=()=>realNow()-8*86400000;expiredURL=expired.prepare(chargePayload,body.evento_id,'https://www.lojabexley.online').url}finally{Date.now=realNow}assert.equal((await fetch(base+new URL(expiredURL).pathname,{method:'POST',body:'{}'})).status,401);
 console.log('PASS: webhook em cold start, pagamento conferido na UrusPay, URLs criptografadas, dados/horário preservados, falha com retry, deduplicação e adulteração recusada. Nenhuma cobrança real.');
}finally{server.close()}
