# Bexley — Vibration

Loja baseada na estrutura do HTML original, que foi preservado.

## Executar

npm install
npm start

Loja: http://localhost:4190
Checkout: http://localhost:4190/checkout

Produto e preço: assets/bexley/catalog.mjs.
Credencial privada: URUSPAY_API_KEY no .env.local, ignorado pelo Git e não servido ao navegador.

npm test verifica preço, quantidade, CPF, UTMs, QR Code e confirmação com provedor simulado, sem cobrança real.

O frete foi mantido da base do checkout: grátis de 7–10 dias ou Sedex de 3–5 dias por R$17,90.
O envio à UTMify depende da configuração da conta UrusPay; nenhum token UTMify da outra loja foi copiado.

As referências pagina (15).html e checkout/checkoutcfef.html não foram sobrescritas. O servidor expõe somente a loja nova, o checkout e seus assets.

## Rastreamento

Pixel Meta 1849843465686098 nas páginas da loja e checkout: PageView, ViewContent, InitiateCheckout e Purchase após confirmação. A API de Conversões recebe Purchase com o mesmo evento_id do navegador, email em SHA256 e valores calculados no servidor.

UTMify: script oficial de UTMs nas duas páginas. A API registra waiting_payment e paid como fallback quando a UrusPay não confirma o envio. O ID e a data de criação são preservados na atualização.

Variáveis privadas adicionais no .env.local: META_PIXEL_ID, META_ACCESS_TOKEN e UTMIFY_API_TOKEN. Nunca coloque tokens em HTML, JavaScript público ou Git.

O servidor local consulta os pagamentos pendentes a cada 30 segundos enquanto estiver ligado, inclusive após fechar a página. A integração foi testada com APIs simuladas e validação isTest na UTMify; não foram geradas cobranças nem conversões fictícias.

## Publicação na Vercel

O build copia somente os arquivos públicos necessários. O checkout e os endpoints usam as rotas configuradas em vercel.json. Configure URUSPAY_API_KEY, META_PIXEL_ID, META_ACCESS_TOKEN e UTMIFY_API_TOKEN nas variáveis do projeto.

Na Vercel, os pedidos usam recibos criptografados para sobreviver a reinicializações das funções. A consulta automática a cada 30 segundos existe no servidor local; na Vercel, a atualização direta depende das consultas do checkout. O rastreamento configurado na UrusPay continua funcionando no servidor do provedor independentemente da página.
