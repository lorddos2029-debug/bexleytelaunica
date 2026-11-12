import {put,get,BlobPreconditionFailedError} from '@vercel/blob';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
// An order and its unique event IDs live in one document. ETag CAS commits both
// together, so parallel webhook deliveries cannot release the same order twice.
export function createVaulticStore({token=process.env.BLOB_READ_WRITE_TOKEN,root='/tmp/bexley',production=false,blob={put,get}}={}){
 const queues=new Map();
 const name=id=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid order ID');return 'vaultic/orders/'+id+'.json'};
 async function read(id){
  // Compressed downloads expose a weak W/ ETag. Conditional writes require the
  // strong object ETag, so request the identity representation for CAS reads.
  if(token){const r=await blob.get(name(id),{token,access:'private',useCache:false,headers:{'accept-encoding':'identity'}});if(!r)return null;if(!r.blob.etag||r.blob.etag.startsWith('W/'))throw Object.assign(Error('Não foi possível obter a versão do pedido. Tente novamente.'),{status:503,code:'storage_etag_invalid'});return {data:JSON.parse(await new Response(r.stream).text()),etag:r.blob.etag};}
  if(production)throw Object.assign(Error('Configure BLOB_READ_WRITE_TOKEN para persistir os pedidos PIX.'),{status:503,code:'storage_not_configured'});
  try{return {data:JSON.parse(await fs.readFile(path.join(root,'.data',name(id)),'utf8'))}}catch(e){if(e.code==='ENOENT')return null;throw e}
 }
 async function transaction(id,change){
  const work=async()=>{
   for(let attempt=0;attempt<12;attempt++){
    const current=await read(id),data=current?structuredClone(current.data):null;
    const next=await change(data);if(next===undefined)return data;
    if(token){try{await blob.put(name(id),JSON.stringify(next),{token,access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,...(current?{allowOverwrite:true,ifMatch:current.etag}:{allowOverwrite:false})});return next;}catch(e){if(e instanceof BlobPreconditionFailedError||(!current&&await read(id)))continue;throw e}}
    const target=path.join(root,'.data',name(id));await fs.mkdir(path.dirname(target),{recursive:true});const temp=target+'.'+randomUUID();await fs.writeFile(temp,JSON.stringify(next),{mode:0o600});await fs.rename(temp,target);return next;
   }
   throw Object.assign(Error('Pedido ocupado. Tente consultar novamente.'),{status:503,code:'storage_conflict'});
  };
  // Serializes same-process local writes; production additionally uses Blob CAS.
  const prev=queues.get(id)||Promise.resolve();const task=prev.catch(()=>{}).then(work);queues.set(id,task);try{return await task}finally{if(queues.get(id)===task)queues.delete(id)}
 }
 return {read:async id=>(await read(id))?.data||null,transaction};
}
