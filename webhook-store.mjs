import {put,get} from '@vercel/blob';

export function createWebhookStore(token=process.env.BLOB_READ_WRITE_TOKEN){
 if(!token)return null;
 const key=id=>'payment-webhooks/'+id+'.txt';
 return {
  async write(id,value){await put(key(id),value,{token,access:'private',addRandomSuffix:false,contentType:'text/plain',cacheControlMaxAge:60})},
  async read(id){const result=await get(key(id),{token,access:'private',useCache:false});return result?new Response(result.stream).text():null}
 };
}
