import {createHmac,randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {put,get} from '@vercel/blob';
import fs from 'node:fs/promises';
import path from 'node:path';
import {PINPAY_BASE} from './pinpay.mjs';
export function configStore({token=process.env.BLOB_READ_WRITE_TOKEN,root='/tmp/bexley',fetcher=fetch}={}){
 const prefix='configuration/';
 return {
  async read(key){if(token){const r=await get(prefix+key+'.json',{token,access:'private',useCache:false});return r?JSON.parse(await new Response(r.stream).text()):null}try{return JSON.parse(await fs.readFile(path.join(root,'.data',key+'.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}},
  async write(key,value){if(token)return put(prefix+key+'.json',JSON.stringify(value),{token,access:'private',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60,contentType:'application/json'});await fs.mkdir(path.join(root,'.data'),{recursive:true});await fs.writeFile(path.join(root,'.data',key+'.json'),JSON.stringify(value))}
 };
}
export function createPanel({passwordHash,sessionSecret,pinpaySecret,urusKey,store=configStore(),fetcher=fetch,secure=true}){
 const cookieName=secure?'__Host-bexley-admin':'bexley-admin';
 const mac=s=>createHmac('sha256',sessionSecret||'disabled').update(s).digest('base64url');
 const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
 const session=req=>{const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token)return null;const[p,s]=token.split('.');if(!p||!s||!equal(mac(p),s))return null;try{const d=JSON.parse(Buffer.from(p,'base64url'));return d.exp>Date.now()?d:null}catch{return null}};
 const cookie=value=>cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Strict'+(secure?'; Secure':'')+'; Max-Age='+(value?'28800':'0');
 async function active(){const value=await store.read('pix-provider');if(value&&!['uruspay','pinpay'].includes(value.provider))throw Error('Configuração inválida');return value?.provider||'uruspay'}
 async function readiness(){let authenticated=false,http=null;try{if(pinpaySecret){const r=await fetcher(PINPAY_BASE+'/balance',{headers:{Authorization:'Bearer '+pinpaySecret},signal:AbortSignal.timeout(8000)});authenticated=r.ok;http=r.status}}catch{}return {uruspay:{configured:!!urusKey},pinpay:{configured:!!pinpaySecret,authenticated,http}}}
 async function handler(req,res,route){
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
  if(!passwordHash||!sessionSecret)return send(503,{error:'Painel não configurado.'});
  try{
   if(req.method==='POST'){
    const expected='https://'+req.headers.host;if(req.headers.origin&&req.headers.origin!==expected&&!(secure===false&&req.headers.origin==='http://'+req.headers.host))return send(403,{error:'Origem não autorizada.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'Formato inválido.'});
   }
   let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{return send(400,{error:'Dados inválidos.'})}}if(req.method==='POST'&&(!body||typeof body!=='object')){let raw='';for await(const c of req){raw+=c;if(raw.length>2048)return send(413,{error:'Dados excedem o limite.'})}try{body=JSON.parse(raw)}catch{return send(400,{error:'Dados inválidos.'})}}
   if(route==='panel/login'&&req.method==='POST'){
    const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];const slot=Math.floor(Date.now()/900000);const bucket='login-'+createHash('sha256').update(ip+':'+slot).digest('hex');const attempts=(await store.read(bucket))?.count||0;
    if(attempts>=5)return send(429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
    const [salt,hash]=passwordHash.split(':');const password=String(body.password||'');if(password.length>128||!salt||!hash||!equal(scryptSync(password,salt,64).toString('hex'),hash)){await store.write(bucket,{count:attempts+1});return send(401,{error:'Senha incorreta.'})}
    const data={exp:Date.now()+8*3600000,csrf:randomBytes(24).toString('base64url')},p=Buffer.from(JSON.stringify(data)).toString('base64url');res.setHeader('Set-Cookie',cookie(p+'.'+mac(p)));return send(200,{ok:true,csrf:data.csrf});
   }
   const auth=session(req);if(!auth)return send(401,{error:'Entre no painel para continuar.'});
   if(req.method==='POST'&&!equal(String(req.headers['x-csrf-token']||''),auth.csrf))return send(403,{error:'Sessão inválida. Entre novamente.'});
   if(route==='panel/logout'&&req.method==='POST'){res.setHeader('Set-Cookie',cookie(''));return send(200,{ok:true})}
   if(route==='panel/config'&&req.method==='GET')return send(200,{provider:await active(),providers:await readiness(),csrf:auth.csrf});
   if(route==='panel/config'&&req.method==='POST'){
    if(!['uruspay','pinpay'].includes(body.provider))return send(400,{error:'Adquirente inválida.'});
    if(body.provider==='pinpay'&&!(await readiness()).pinpay.authenticated)return send(409,{error:'A PinPay não confirmou a autenticação. A adquirente atual foi mantida.'});
    if(body.provider==='uruspay'&&!urusKey)return send(409,{error:'UrusPay não configurada.'});
    await store.write('pix-provider',{provider:body.provider,updatedAt:new Date().toISOString()});return send(200,{ok:true,provider:body.provider});
   }
   return send(404,{error:'Rota não encontrada.'});
  }catch{console.warn('[Painel] operação indisponível');return send(503,{error:'Não foi possível concluir. Tente novamente.'})}
 }
 return {handler,active};
}
