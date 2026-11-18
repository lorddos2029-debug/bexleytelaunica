import{catalog}from'./catalog.mjs';
const $=s=>document.querySelector(s),panel=$('#reference-search');
$('#reference-search-button').onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)$('#reference-search-input').focus()};
const paths={vibration:'/',kit:'/kit',bermuda:'/bermuda',bermuda2:'/bermuda2',polo:'/polo',calca:'/calca',jaqueta:'/jaqueta',alfaiataria:'/alfaiataria',cueca:'/cueca'};
$('#reference-search-input').oninput=e=>{const box=$('#reference-search-results');box.replaceChildren();for(const p of Object.values(catalog).filter(p=>p.name.toLowerCase().includes(e.target.value.toLowerCase()))){const a=document.createElement('a');a.href=paths[p.id];a.textContent=p.shortName;box.append(a)}};
$('#reference-share').onclick=async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else{await navigator.clipboard.writeText(location.href);$('#reference-share').setAttribute('aria-label','Link copiado')}}catch{}};

try{sessionStorage.setItem('bexley-last-product',location.pathname+location.search)}catch{}

// Sem provedor de newsletter configurado, o cadastro é encaminhado ao suporte por e-mail.
const newsletterForm=document.querySelector('.bex-newsletter-form');
newsletterForm?.addEventListener('submit',event=>{event.preventDefault();if(!newsletterForm.reportValidity())return;const data=new FormData(newsletterForm),name=String(data.get('nome')||'').trim(),email=String(data.get('email')||'').trim();const body='Quero me cadastrar para receber novidades da Bexley.\n\nNome: '+name+'\nE-mail: '+email;location.href='mailto:suporte@bexley.com.br?subject='+encodeURIComponent('Cadastro de novidades Bexley')+'&body='+encodeURIComponent(body);const status=newsletterForm.querySelector('[role="status"]');status.hidden=false;status.textContent='Conclua o envio do cadastro no seu aplicativo de e-mail.';});
