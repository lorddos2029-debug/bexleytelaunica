import fs from 'node:fs';
fs.mkdirSync('public/checkout',{recursive:true});fs.mkdirSync('public/assets/bexley',{recursive:true});fs.copyFileSync('index.html','public/index.html');fs.copyFileSync('kit.html','public/kit.html');fs.copyFileSync('checkout/index.html','public/checkout/index.html');for(const file of ['catalog.mjs','checkout.css','checkout.js','logo.png','original-brand.css','original-store.js','pix.png','tracking.js',...Array.from({length:7},(_,i)=>'kit-'+(i+1)+'.png'),...Array.from({length:7},(_,i)=>'kit-combo-'+(i+1)+'.png'),...Array.from({length:6},(_,i)=>'vibration-'+(i+1)+'.png')])fs.copyFileSync('assets/bexley/'+file,'public/assets/bexley/'+file);

const {pages,renderPage}=await import('./pages.mjs');for(const slug of Object.keys(pages)){fs.mkdirSync('public/'+slug,{recursive:true});fs.writeFileSync('public/'+slug+'/index.html',renderPage(slug))}

fs.copyFileSync('bermuda.html','public/bermuda.html');for(let n=1;n<=8;n++)fs.copyFileSync('assets/bexley/bermuda-'+n+'.png','public/assets/bexley/bermuda-'+n+'.png');

for(let n=1;n<=18;n++)fs.copyFileSync('assets/bexley/bermuda-combo-'+n+'.png','public/assets/bexley/bermuda-combo-'+n+'.png');

fs.copyFileSync('bermuda2.html','public/bermuda2.html');for(let n=1;n<=11;n++)fs.copyFileSync('assets/bexley/bermuda2-'+n+'.png','public/assets/bexley/bermuda2-'+n+'.png');

fs.copyFileSync('polo.html','public/polo.html');for(let n=1;n<=7;n++)fs.copyFileSync('assets/bexley/polo-'+n+'.png','public/assets/bexley/polo-'+n+'.png');

for(let n=1;n<=20;n++)fs.copyFileSync('assets/bexley/polo-combo-'+n+'.png','public/assets/bexley/polo-combo-'+n+'.png');

fs.copyFileSync('calca.html','public/calca.html');for(let n=1;n<=9;n++)fs.copyFileSync('assets/bexley/calca-'+n+'.png','public/assets/bexley/calca-'+n+'.png');

for(let n=1;n<=5;n++)fs.copyFileSync('assets/bexley/calca-combo-'+n+'.png','public/assets/bexley/calca-combo-'+n+'.png');

fs.copyFileSync('assets/bexley/calca-reviews.js','public/assets/bexley/calca-reviews.js');for(let n=1;n<=9;n++)fs.copyFileSync('assets/bexley/calca-review-'+n+'.png','public/assets/bexley/calca-review-'+n+'.png');

for(let n=1;n<=6;n++)fs.copyFileSync('assets/bexley/bermuda2-review-'+n+'.png','public/assets/bexley/bermuda2-review-'+n+'.png');
