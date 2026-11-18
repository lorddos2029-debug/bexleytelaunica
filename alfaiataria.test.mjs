import assert from 'node:assert/strict';import fs from 'node:fs';import {load} from 'cheerio';
import {catalog,validItem,pixUnitPrice} from './assets/bexley/catalog.mjs';import {prepareVaulticOrder} from './vaultic-payments.mjs';
const p=catalog.alfaiataria;assert.equal(p.price,6990);assert.equal(pixUnitPrice({productId:p.id}),6641);assert.equal(p.colors.length,1);assert.deepEqual(p.sizes,['38','40','42','44','46','48','50']);
for(const color of p.colors)for(const size of p.sizes)assert(validItem({productId:p.id,color,size,quantity:1}));
for(const bad of [{color:'Preto'},{size:'52'},{size:''}])assert(!validItem({productId:p.id,color:p.defaultColor,size:'42',quantity:1,...bad}));
const body={nome:'Teste Alfaiataria',email:'teste@example.com',cpf:'52998224725',telefone:'5511999999999',evento_id:'ev_teste_alfaiataria_123456',frete:'sedex',endereco:{cep:'01001000',logradouro:'Praça',numero:'1',bairro:'Sé',cidade:'São Paulo',uf:'SP'},itens:[{productId:p.id,color:p.defaultColor,size:'50',quantity:1}],valor:0.01};
const order=prepareVaulticOrder(body,{headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'}});assert.equal(order.amount,8431);assert.equal(order.orderItems[0].size,'50');assert.equal(order.orderItems[0].color,body.itens[0].color);assert.equal(order.payload.items[0].unitPrice,6641);assert(order.payload.items[0].title.includes('Azul Nebuloso'));assert(order.payload.items[0].title.includes('50'));
const $=load(fs.readFileSync('alfaiataria.html','utf8'));assert.equal($('body').attr('data-product'),p.id);assert.equal($('h1').text(),p.name);assert.equal($('[data-pants-color]').length,0);assert.equal($('[data-size]').length,7);assert.equal($('#avaliacoes article').length,6);assert.equal($('[data-gallery="7"]').length,1);assert($('#comprar').text().includes('R$ 69,90'));assert($('#comprar').text().includes('R$ 66,41'));
for(const img of $('img[src^="/assets/bexley/"]').toArray())assert(fs.existsSync('.'+$(img).attr('src')),$(img).attr('src'));
console.log('PASS: 7 tamanhos, kit fixo, tamanho compartilhado, fotos, avaliações e total no Pix com frete.');

assert.equal($('#bex-color-picker').length,0);assert.deepEqual(p.colors,['Cinza-claro + Preto + Azul Nebuloso']);

assert.equal($('.reference-pricing>p').text(),'R$ 69,90');assert.equal($('.reference-pricing>small').text(),'R$ 66,41 no PIX');
