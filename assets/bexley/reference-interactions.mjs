import{catalog}from'./catalog.mjs';
const $=s=>document.querySelector(s),panel=$('#reference-search');
$('#reference-search-button').onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)$('#reference-search-input').focus()};
const paths={vibration:'/',kit:'/kit',bermuda:'/bermuda',bermuda2:'/bermuda2',polo:'/polo',calca:'/calca',jaqueta:'/jaqueta',alfaiataria:'/alfaiataria'};
$('#reference-search-input').oninput=e=>{const box=$('#reference-search-results');box.replaceChildren();for(const p of Object.values(catalog).filter(p=>p.name.toLowerCase().includes(e.target.value.toLowerCase()))){const a=document.createElement('a');a.href=paths[p.id];a.textContent=p.shortName;box.append(a)}};
$('#reference-share').onclick=async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else{await navigator.clipboard.writeText(location.href);$('#reference-share').setAttribute('aria-label','Link copiado')}}catch{}};

try{sessionStorage.setItem('bexley-last-product',location.pathname+location.search)}catch{}
