# PinPay Pix

Documentação oficial consultada: https://hub.usepinpay.com/documentacao

## Configuração

Configure na Vercel, no projeto bexleytelaunica, ambiente Production:
- PIX_PROVIDER=pinpay
- PINPAY_SECRET_KEY: chave secreta da conta, somente servidor.
- PINPAY_PUBLIC_KEY: chave pública da conta (o Pix próprio não precisa enviá-la ao navegador).
- PINPAY_API_URL=https://api.usepinpay.com/functions/v1/api-v1
- PINPAY_STATUS_SECRET: segredo aleatório de 32 bytes para assinar os links privados dos pedidos. Preserve-o em novos deployments.
- PINPAY_WEBHOOK_SECRET: secret retornado no cadastro do webhook.
- BLOB_READ_WRITE_TOKEN: armazenamento privado e durável dos pedidos.

Nunca inclua valores reais no repositório ou HTML. Não é necessária migração: os pedidos PinPay usam a pasta privada pinpay/orders; os pedidos Vaultic antigos continuam disponíveis em suas rotas.

## API e segurança

O servidor calcula os produtos, desconto e frete em centavos. POST /pix recebe amount, description, customer e metadata.external_reference/checkout_url. Idempotency-Key é um UUID persistido por pedido: falhas de rede reutilizam a mesma chave. A chave secreta é enviada somente ao host oficial via Bearer.

O navegador recebe o resumo, copia-e-cola e um link privado da própria loja. O QR é gerado localmente com qrcode. Consultas autenticadas GET /pix/{id} conferem ID e valor antes de confirmar o pedido; polling a cada cinco segundos também recupera pagamentos sem webhook.

Webhook público: https://www.lojabexley.online/api/pinpay/webhook

Eventos cadastrados: payment_pending, payment_approved, pix_received, payment_failed, payment_refunded. A assinatura X-Webhook-Signature (sha256=hex) é conferida com HMAC-SHA256 sobre o corpo bruto e comparação em tempo constante. Depois da assinatura, o servidor consulta a cobrança novamente na API; nunca usa o status enviado como comprovação. Um hash do evento é salvo no mesmo documento do pedido com CAS, impedindo duplicação da liberação.

## Verificação

Execute npm test e npm run build. pinpay-direct.test.mjs usa respostas simuladas e cobre CPF inválido, preço calculado no servidor, frete, QR PNG, idempotência, timeout, assinatura falsa, replay, divergência de valor, pagamento em análise, aprovação por consulta, expiração e prioridade da PinPay sobre a Vaultic. Os testes existentes validam a compatibilidade dos pedidos antigos.

Na entrega foi verificada a autenticação real com GET /balance, sem registrar ou exibir valores. Foi cadastrado o webhook; não foi criada nem paga cobrança real. O fluxo visual completo foi verificado com uma API local simulada, fora do repositório.
