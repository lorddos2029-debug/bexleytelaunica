import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHmac,createHash} from 'node:crypto';
import {createPinpayPayments,verifyPinpaySignature,applyPinpayPayment} from './pinpay-payments.mjs';
import {createRuntime} from './runtime.mjs';

test('PinPay: criação em centavos, idempotência, QR, assinatura, replay, consulta de reserva e valores',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bexley-pinpay-')),env={PINPAY_SECRET_KEY:'sk_test_fixture',PINPAY_STATUS_SECRET:'status-secret-fixture',PINPAY_WEBHOOK_SECRET:'whsec_fixture'};
 let now=Date.now(),creates=0,timeout=false,wrongAmount=false;const payments=new Map(),keys=[];
 const fetcher=async(url,o={})=>{
  assert(url.startsWith('https://api.usepinpay.com/functions/v1/api-v1/pix'));assert.equal(o.headers.Authorization,'Bearer sk_test_fixture');
  if(o.method==='POST'){
   creates++;const b=JSON.parse(o.body);assert(Number.isSafeInteger(b.amount));assert.equal(b.amount,8431);assert(b.metadata.checkout_url.endsWith('/checkout'));assert.match(b.metadata.external_reference,/^[a-f0-9]{64}$/);assert.equal(b.customer.document.number,'52998224725');assert(!('items' in b));keys.push(o.headers['Idempotency-Key']);assert.match(keys.at(-1),/^[a-f0-9]{8}-[a-f0-9-]{27}$/);
   let p=payments.get(keys.at(-1));if(!p){p={id:'pix_'+payments.size,amount:b.amount,status:'pending',metadata:b.metadata,pix:{qr_code:'000201-test-no-value',expires_at:'2030-01-01T00:00:00Z'}};payments.set(keys.at(-1),p);}
   if(timeout){timeout=false;throw Error('timeout after remote creation');}return Response.json(p,{status:201});
  }
  const p=[...payments.values()].find(p=>url.endsWith('/'+p.id));assert(p);return Response.json({...p,amount:wrongAmount?p.amount+1:p.amount});
 };
 const gateway=createPinpayPayments({env,root,fetcher,now:()=>now});
 const server=http.createServer((req,res)=>gateway.handle(req,res,new URL(req.url,'http://test').pathname));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const body={nome:'Comprador Teste',email:'teste@example.com',cpf:'52998224725',telefone:'5511999999999',evento_id:'ev_pinpay_fixture_123456',frete:'sedex',endereco:{cep:'01001000',logradouro:'Praça da Sé',numero:'1',bairro:'Sé',cidade:'São Paulo',uf:'SP'},itens:[{productId:'alfaiataria',color:'Cinza-claro + Preto + Azul Nebuloso',size:'42',quantity:1}],valor:0.01};
 const post=async(data=body)=>{const r=await fetch(base+'/api/charge',{method:'POST',body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
 const event=payment=>JSON.stringify({event:'payment_approved',data:{transaction_id:payment.id}});
 const webhook=async(raw,sig=createHmac('sha256',env.PINPAY_WEBHOOK_SECRET).update(raw).digest('hex'))=>fetch(base+'/api/pinpay/webhook',{method:'POST',headers:{'X-Webhook-Signature':'sha256='+sig},body:raw});
 try{
  assert.equal((await post({...body,cpf:'11111111111'})).status,400);assert.equal(creates,0);
  const first=await post();assert.equal(first.status,200);assert.equal(first.data.gateway,'pinpay');assert.equal(first.data.amount,8431);assert.equal(first.data.order_summary.shipping,1790);assert.equal(first.data.pago,false);assert(!JSON.stringify(first.data).includes('sk_test'));
  assert.equal((await post()).data.venda_id,first.data.venda_id);assert.equal(creates,1);assert.equal((await post({...body,itens:[{...body.itens[0],quantity:2}]})).status,409);
  const qr=await fetch(base+first.data.check_status_url.replace('/status/','/qr/'));assert.equal(qr.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await qr.arrayBuffer()).subarray(1,4).toString(),'PNG');
  const payment=[...payments.values()][0],raw=event(payment),id=first.data.check_status_url.split('/').at(-1).slice(0,64);payment.status='paid';payment.paid_at=new Date(now).toISOString();
  assert.equal((await webhook(raw,'0'.repeat(64))).status,401);assert.equal((await gateway.store.read(id)).status,'pending');
  wrongAmount=true;assert.equal((await webhook(raw)).status,409);assert.equal((await gateway.store.read(id)).status,'pending');wrongAmount=false;
  assert.equal((await webhook(raw)).status,200);assert.equal((await webhook(raw)).status,200);let stored=await gateway.store.read(id);assert.equal(stored.status,'paid');assert.equal(stored.releaseCount,1);assert.equal(Object.keys(stored.events).length,1);
  payment.status='pending';assert.equal(applyPinpayPayment(stored,payment,{now:now+10000}).status,'paid');
  timeout=true;const secondBody={...body,evento_id:'ev_pinpay_fixture_timeout'};assert.equal((await post(secondBody)).status,502);const second=await post(secondBody);assert.equal(second.status,200);assert.equal(keys.at(-1),keys.at(-2));assert.equal(payments.size,2);
  const p2=[...payments.values()][1];p2.status='processing';now+=6000;let status=await fetch(base+second.data.check_status_url).then(r=>r.json());assert.equal(status.status,'under_review');assert.equal(status.pago,false);
  p2.status='approved';now+=6000;status=await fetch(base+second.data.check_status_url).then(r=>r.json());assert.equal(status.pago,true);assert.equal(status.status,'paid');
  const third=await post({...body,evento_id:'ev_pinpay_fixture_expired'});[...payments.values()][2].status='expired';now+=6000;status=await fetch(base+third.data.check_status_url).then(r=>r.json());assert.equal(status.status,'expired');assert.equal(status.pago,false);
  assert.throws(()=>verifyPinpaySignature(raw,'sha256='+'0'.repeat(64),env.PINPAY_WEBHOOK_SECRET),/Assinatura/);
 }finally{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
});

test('PIX_PROVIDER=pinpay prevalece sobre Vaultic sem alterar os links de pedidos antigos',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bexley-pinpay-routing-'));const runtime=createRuntime({root,env:{PIX_PROVIDER:'pinpay',VERCEL:'1',VAULTIC_API_KEY:'vk_test_old',VAULTIC_WEBHOOK_SECRET:'old'},fetcher:async()=>{throw Error('not expected');}});
 let result;await runtime.handle({method:'POST',headers:{}},{writeHead(s){this.status=s;},end(raw){result={status:this.status,body:JSON.parse(raw)};}},'/api/charge');assert.equal(result.status,503);assert.match(result.body.error,/PinPay/);await fs.rm(root,{recursive:true,force:true});
});
