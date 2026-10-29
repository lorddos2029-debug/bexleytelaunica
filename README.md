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

Na Vercel, cada novo PIX recebe uma webhook_url HTTPS curta em /api/urus/webhook/r_<referência aleatória>. O recibo criptografado e comprimido fica no Vercel Blob privado, com BLOB_READ_WRITE_TOKEN somente no servidor. A referência guarda acesso aos dados originais do pedido e do evento por sete dias, inclusive após reinicializações. URLs longas não são enviadas ao gateway. Se o armazenamento estiver indisponível, a geração do PIX continua e a consulta do checkout permanece como fallback. A UrusPay avisa quando o pagamento muda; o servidor consulta a API autenticada, confere venda, valor e comprador, e só então atualiza UTMify e Meta. Falhas no destino retornam HTTP 502 para acionar novas tentativas da UrusPay. O mesmo orderId/createdAt da UTMify e event_id do Meta são reutilizados para deduplicação. O checkout continua consultando como fallback; o servidor local também consulta a cada 30 segundos. Cobranças criadas antes desta versão não possuem essa URL e precisam de recuperação individual.

## Cartão Payout
O cartão usa PAYOUT_SECRET_KEY e PAYOUT_PUBLIC_KEY no servidor. A configuração pública consulta a autenticação da Payout e disponibiliza o método quando as chaves estão configuradas. O checkout mostra o diagnóstico de autenticação retornado pela Payout para permitir os testes solicitados pelo suporte; a criação de cobranças exige autenticação aceita. A biblioteca oficial tokeniza os dados no navegador. Somente o token temporário é enviado ao servidor; PAN/CVV não são persistidos. Preço de cartão é o preço de catálogo, em até 6x, com frete separado e sem desconto Pix. O webhook `/api/card/webhook` confirma a transação na API autenticada antes de atualizar UTMify/Meta. O status também é consultado pelo checkout. Testes usam respostas simuladas e não efetuam cobranças reais.

## Painel e Pix PinPay
/painel usa senha validada por scrypt (ADMIN_PASSWORD_HASH), cookie HttpOnly/Secure/SameSite=Strict assinado por ADMIN_SESSION_SECRET, CSRF e limite de tentativas por IP. O seletor persiste configuração no Blob privado; UrusPay é o padrão. PINPAY_SECRET_KEY e PINPAY_PUBLIC_KEY ficam no servidor. A API PinPay usa Bearer em https://api.usepinpay.com/functions/v1/api-v1, com amount em centavos e metadata.external_reference/checkout_url obrigatórios. Recibos PinPay usam /api/pinpay/status e /api/pinpay/qr; o webhook privado /api/pinpay/webhook confere a transação autenticada, valor e comprador/referência antes de atualizar UTMify/Meta. A troca afeta apenas novas cobranças; pedidos antigos continuam sendo consultados na adquirente original.

A PinPay também notifica /api/pinpay/notifications nos eventos payment_approved/pix_received. O servidor busca a transação autenticada e usa apenas a referência de recibo guardada na metadata pela própria loja; não confia em status ou referências fornecidos pelo POST.
