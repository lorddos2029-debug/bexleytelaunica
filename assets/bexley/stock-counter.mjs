// Visual promotional counter requested by the store. Not a live inventory feed.
export const stockRemaining=(started,now=Date.now())=>31-Math.min(8,Math.max(0,Math.floor((now-started)/25000)));
export function startStockCounter(productId){
 const output=document.querySelector('[data-stock-count]');
 if(!output)return;
 const key='bexley-promo-start-'+productId;
 let started=Date.now();
 try{const saved=Number(localStorage.getItem(key));if(Number.isFinite(saved)&&saved>0&&saved<=started)started=saved;else localStorage.setItem(key,String(started));}catch{}
 const update=()=>{const remaining=stockRemaining(started);output.textContent=remaining;document.querySelector('[data-stock-bar]').style.width=(remaining/50*100)+'%';document.querySelector('.bex-stock-track').setAttribute('aria-valuenow',String(remaining));};
 update();const timer=setInterval(update,1000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
