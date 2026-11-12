import {createRuntime} from '../runtime.mjs';
export const config={api:{bodyParser:false}};
const runtime=createRuntime({root:'/tmp/bexley',stateless:true});
export default async function(req,res){const url=new URL(req.url,'https://bexley.local');const route=String(req.query?.route||url.searchParams.get('route')||'');if(route==='health'){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,store:'Bexley',pix_configurado:!!process.env.VAULTIC_API_KEY&&!!process.env.VAULTIC_WEBHOOK_SECRET,utmify_configurado:!!process.env.UTMIFY_API_TOKEN,meta_configurado:!!process.env.META_PIXEL_ID&&!!process.env.META_ACCESS_TOKEN})}return runtime.handle(req,res,'/api/'+route)}
