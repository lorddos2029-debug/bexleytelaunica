import assert from 'node:assert/strict';
import http from 'node:http';
import {createPayout} from './payout.mjs';
let submitted,creates=0,paid=false,events=[];
const options={secretKey:'private-test',publicKey:'pk_test',metaPixelId:'pixel-test',metaToken:'meta-test',fetcher:async(url,request={})=>{
 if(url.includes('graph.facebook.com')){events.push(JSON.parse(request.body).data[0]);return {ok:true,json:async()=>({events_received:1})}}
 assert.equal(request.headers.Authorization,'Basic '+Buffer.from('private-test:x').toString('base64'));
 if(request.method==='POST'){creates++;submitted=JSON.parse(request.body);return {ok:true,json:async()=>({id:123,amount:submitted.amount,paymentMethod:'credit_card',status:'processing',metadata:submitted.metadata})}}
 return {ok:true,json:async()=>url.includes('limit=1')?{data:[]}:{id:123,amount:submitted.amount,paymentMethod:'credit_card',status:paid?'paid':'processing',metadata:submitted.metadata}};
}};
let handler=createPayout(options);const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://test').pathname));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const body={nome:'Cliente Teste',email:'teste@example.com',cpf:'52998224725',evento_id:'ev_card_test_123456',card_token:'token-from-provider',installments:1,itens:[{productId:'vibration',color:'Vibration',quantity:2}],frete:'sedex',endereco:{cep:'01001000',logradouro:'Rua Teste',numero:'1',bairro:'Centro',cidade:'São Paulo',uf:'SP'},valor:0.01};
const post=value=>fetch(base+'/api/card/charge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
try{
 assert.equal((await (await fetch(base+'/api/card/config')).json()).enabled,true);
 assert.equal((await post({...body,card:{number:'4111111111111111'}})).status,400);assert.equal(creates,0);
 const response=await post(body),charge=await response.json();assert.equal(response.status,200);assert.equal(charge.valor,97.7);assert.equal(submitted.amount,9770);assert.equal(submitted.items[0].unitPrice,3990);assert.equal(submitted.shipping.fee,1790);assert.deepEqual(submitted.card,{hash:body.card_token});assert(!submitted.metadata.includes(body.card_token));assert.equal(events.length,0);
 await post(body);assert.equal(creates,1);
 handler=createPayout(options);paid=true;const status=await(await fetch(base+charge.check_status_url)).json();assert.equal(status.pago,true);assert.equal(events[0].custom_data.value,97.7);assert.equal(events[0].event_id,body.evento_id);
 const invalid=await fetch(base+charge.check_status_url.slice(0,-6)+'abcdef');assert.equal(invalid.status,404);
 const notified=await fetch(base+'/api/card/webhook',{method:'POST',body:JSON.stringify({objectId:'123',data:{status:'refused'}})});assert.equal(notified.status,200);
 for(const installments of [1,2,3,4,5,6]){const payment=await post({...body,installments,evento_id:body.evento_id+'_n'+installments});assert.equal(payment.status,200);assert.equal(submitted.installments,installments);assert.equal(submitted.amount,9770)}for(const installments of [0,7,1.5,'6'])assert.equal((await post({...body,installments})).status,400);
 handler=createPayout({...options,fetcher:async()=>({ok:false,status:401,json:async()=>({message:'invalid'})})});const unavailable=await(await fetch(base+'/api/card/config')).json();assert.equal(unavailable.enabled,true);assert.equal(unavailable.authenticated,false);assert.equal(unavailable.diagnostic.http,401);assert.equal((await post(body)).status,503);
 console.log('PASS: cartão tokenizado, valor no servidor sem desconto Pix, frete, duplicação local, confirmação autenticada, webhook verificado e credencial recusada. Nenhuma cobrança real.');
}finally{server.close()}
