import {createPayments} from './payments.mjs';
import {createPayout} from './payout.mjs';
import {createPanel,configStore} from './panel.mjs';
import {pinpayFetcher,pinpayNotification} from './pinpay.mjs';
export function createRuntime({env=process.env,root,stateless=true,fetcher=fetch,secure=true,store}={}){
 const shared={utmifyToken:env.UTMIFY_API_TOKEN,metaPixelId:env.META_PIXEL_ID,metaToken:env.META_ACCESS_TOKEN,stateless,fetcher};
 const urus=createPayments({...shared,key:env.URUSPAY_API_KEY,root});
 const pinpay=createPayments({...shared,key:env.PINPAY_SECRET_KEY,root:root+'-pinpay',platform:'PinPay',routePrefix:'/api/pinpay',fetcher:pinpayFetcher({secretKey:env.PINPAY_SECRET_KEY,fetcher})});
 const card=createPayout({secretKey:env.PAYOUT_SECRET_KEY,publicKey:env.PAYOUT_PUBLIC_KEY,...shared});
 const panel=createPanel({passwordHash:env.ADMIN_PASSWORD_HASH,sessionSecret:env.ADMIN_SESSION_SECRET,pinpaySecret:env.PINPAY_SECRET_KEY,urusKey:env.URUSPAY_API_KEY,store:store||configStore({root}),fetcher,secure});
 async function handle(req,res,route){
  if(route.startsWith('/api/panel/'))return panel.handler(req,res,route.slice(5));
  if(route.startsWith('/api/card/'))return card(req,res,route);
  if(route==='/api/pinpay/notifications')return pinpayNotification(req,res,{secretKey:env.PINPAY_SECRET_KEY,fetcher,handle:pinpay});
  if(route.startsWith('/api/pinpay/')){
   const sub=route.slice('/api/pinpay/'.length);
   if(!/^(?:status|qr|webhook)\//.test(sub)){res.writeHead(404);return res.end()}
   return pinpay(req,res,sub.startsWith('webhook/')?'/api/urus/'+sub:'/api/'+sub);
  }
  if(route==='/api/charge'&&req.method==='POST'){
   try{return (await panel.active()==='pinpay'?pinpay:urus)(req,res,route)}catch{res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Não foi possível consultar a configuração do PIX. Tente novamente.'}))}
  }
  return urus(req,res,route);
 }
 return {handle,refreshPending:async()=>{await urus.refreshPending();await pinpay.refreshPending()}};
}
