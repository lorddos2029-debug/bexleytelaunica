import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load} from 'cheerio';
import {catalog,validItem,pixUnitPrice} from './assets/bexley/catalog.mjs';
import {stockRemaining} from './assets/bexley/stock-counter.mjs';
for(const a of catalog.jaqueta.pieceSizes)for(const b of catalog.jaqueta.pieceSizes){assert(validItem({productId:'jaqueta',color:'2 Pretas',size:`1ª ${a} / 2ª ${b}`,quantity:1}));}
for(const size of [undefined,'M','1ª M','1ª M / 2ª INVALID','1ª G1 / 2ª P'])assert(!validItem({productId:'jaqueta',color:'2 Pretas',size,quantity:1}));
assert.equal(catalog.jaqueta.price,6990);assert.equal(pixUnitPrice({productId:'jaqueta'}),6641);
for(const file of ['index.html','kit.html','bermuda.html','bermuda2.html','polo.html','calca.html','jaqueta.html']){const $=load(fs.readFileSync(file,'utf8'));assert.equal($('.bex-promo-badges span').length,2,file);assert.equal($('#bex-buy').prev().attr('class'),'bex-stock');assert.equal($('[data-stock-count]').text(),'31');}
const $=load(fs.readFileSync('jaqueta.html','utf8'));assert($('#jaqueta-step-2').is('[hidden]'));assert.equal($('[data-piece-size]').length,10);assert.equal($('#avaliacoes article').length,6);assert.equal($('h1').text(),catalog.jaqueta.name);
for(const img of $('img[src^="/assets/bexley/"]').toArray())assert(fs.existsSync('.'+$(img).attr('src')),$(img).attr('src'));
assert.equal(stockRemaining(1000,1000),31);assert.equal(stockRemaining(1000,25999),31);assert.equal(stockRemaining(1000,26000),30);assert.equal(stockRemaining(1000,201000),23);assert.equal(stockRemaining(1000,99999999),23);assert.equal(stockRemaining(1000,0),31);
console.log('PASS: 25 pares de tamanhos, variações inválidas recusadas, preço, páginas, fotos e contador 31–23.');
