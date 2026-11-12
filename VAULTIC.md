# Pix Vaultic na Bexley

## Arquivos

- `vaultic-api.mjs`: cliente HTTP exclusivamente no servidor, timeout de 15 segundos, erros e Idempotency-Key.
- `vaultic-store.mjs`: pedidos privados persistentes, ETag/CAS para atualizar pedido e eventos na mesma operação atômica. Em desenvolvimento, arquivos locais com escrita atômica.
- `vaultic-payments.mjs`: validações, totais em centavos, criação, QR, consulta, assinatura do corpo bruto, deduplicação e transições de status.
- `vaultic-tracking.mjs`: preserva UTMify e Meta depois da resposta HTTP, com identificador estável e controle persistente de envio.
- `runtime.mjs`: novos Pix usam Vaultic quando configurada; consultas de cobranças antigas e cartão mantêm suas rotas.
- `api/handler.mjs`: desabilita parse automático para preservar a assinatura do corpo bruto.
- `server.mjs` e `vercel.json`: rota pública de webhook e execução local.
- `checkout/index.html`: telefone com DDI 55.
- `assets/bexley/checkout.js`: totais em centavos, estados do Pix, consulta a cada 5 segundos e QR via servidor.
- `assets/bexley/panel.js`: identifica a Vaultic como adquirente configurada no servidor.
- `.env.example`: nomes das variáveis, sem segredos.
- `package.json` e `package-lock.json`: tarefa de testes e `@vercel/functions` para trabalho posterior à resposta.
- `vaultic.test.mjs`: API simulada, assinatura, concorrência entre instâncias, QR, valores, estados e recuperação.

## Configuração

No projeto Vercel `bexleytelaunica`, ambiente **Production**:

```dotenv
VAULTIC_API_KEY=
VAULTIC_WEBHOOK_SECRET=
VAULTIC_API_URL=https://api.vaulticpay.com
BLOB_READ_WRITE_TOKEN=
```

As duas primeiras variáveis são segredos. A chave de produção e o segredo gerado no cadastro do webhook foram configurados pela integração, sem gravá-los no Git. O token Blob já existia. Variáveis novas entram em vigor em um novo deployment.

Para desenvolvimento, use `.env.local` (ignorado pelo Git), com chave `vk_test_` e o segredo do webhook do mesmo ambiente. Não copie a chave de produção para testes. O servidor local lê `.env.local`; a Vercel injeta as variáveis no processo.

Não há migração SQL. Os documentos são criados sob `vaultic/orders/<orderId>.json` no Blob privado. O status, o ID da cobrança, o total, a contagem de liberação e os IDs de eventos ficam no mesmo documento, com comparação de ETag. Em execução local ficam em `.data/vaultic/orders/`.

## Webhook

URL de produção, sem redirecionamento:

**https://www.lojabexley.online/webhooks/vaultic**

O endpoint foi cadastrado com `POST /v1/webhook-endpoints`, `events: []`. O segredo retornado foi salvo em `VAULTIC_WEBHOOK_SECRET`. Para ambientes novos, cadastre uma vez pelo painel Vaultic (Integração → Webhooks) ou pelo endpoint especificado; guarde o segredo retornado, pois ele aparece uma única vez.

A rota verifica HMAC SHA-256 do UTF-8 bruto e tolerância de 300 segundos antes de interpretar JSON. Confere ambiente, pedido, moeda, método e valor. O evento e a liberação são persistidos atomicamente antes do 200. UTMify/Meta rodam depois da resposta. A URL não usa a página de confirmação como prova de pagamento.

`GET /api/vaultic/status/<token>` lê o pedido persistido. Para pedidos pendentes/em análise entre 2 minutos e 48 horas, também confere a cobrança na Vaultic, no máximo uma vez a cada 30 segundos. O navegador consulta essa rota a cada 5 segundos e nunca recebe a chave da Vaultic. A confirmação é a seção de sucesso existente do checkout, aberta apenas após a resposta verificada do servidor.

## Testes

```sh
npm ci
npm test
npm run build
```

Os testes automatizados usam `vk_test_fixture` e respostas simuladas; não acessam a Vaultic nem movimentam dinheiro. Cobrem criação/QR, replay idempotente, CPF/telefone/endereço inválidos, valores adulterados, corpo bruto, HMAC inválido/vencido, webhook duplicado concorrente, eventos antigos, expiração, revisão, devoluções, MED/chargeback, recuperação sem webhook e timeout com a mesma chave.

Roteiro real de homologação, quando houver uma chave `vk_test_` válida:

1. Configure a chave de teste em um ambiente isolado e exponha `npm start` por túnel HTTPS, ou use um deployment Preview. Cadastre `<URL HTTPS>/webhooks/vaultic` com essa mesma chave de teste e salve o segredo retornado nesse ambiente.
2. Faça um pedido no checkout com dados de teste válidos. Confira total, QR e copia e cola. No servidor/Blob, anote `vaultic_payment_id` e `payload.metadata.orderId`.
3. Reenvie a mesma criação com os mesmos dados e Idempotency-Key: deve retornar a mesma cobrança (`Idempotent-Replayed: true` na resposta do gateway). CPF inválido deve ser rejeitado antes de chamar a Vaultic.
4. Usando a chave de teste somente no servidor ou cliente HTTP de homologação, envie `POST /v1/payments/<id>/simulate` com `{"status":"paid"}`. Confira o webhook, status `paid`, `releaseCount: 1` e a tela de confirmação.
5. Reenvie o webhook original: responda 200, sem nova liberação. Altere corpo/assinatura: responda 401 e não altere o pedido.
6. Em outro pedido, simule `expired`: o pedido deve ficar cancelado, com opção de nova tentativa na tela.
7. Desligue o webhook no ambiente de teste, simule `paid` e consulte a tela depois de 2 minutos: a conferência de reserva deve confirmar pelo GET autenticado.

Não execute `/simulate` com chave `vk_live_`. Esta integração não implementa saldo nem saques.

## Limites e suposições

- Não foi fornecida chave de teste válida; a homologação com a API real e um pagamento real não foram executados.
- O site não tem módulo separado de expedição: a liberação é o estado persistido `fulfillment: ready` e `releaseCount: 1`. MED e chargeback passam para `on_hold`; estorno parcial exige revisão manual.
- A especificação não fornece o valor ainda pago/valor parcial devolvido. Para `partially_refunded`, `refundedAmount` fica `null` e `refundAmountNeedsReview: true`, sem inventar campo da API.
- Atrás da Vercel, usa-se o IPv4 original dos cabeçalhos de proxy confiável. Se só houver IPv6, o Pix é bloqueado com mensagem clara (`ipv4_required`), sem criar IP fictício. Localmente, o IP vem do socket, sem confiar em cabeçalhos arbitrários.
- A contabilidade e todos os pedidos/Vaultic usam centavos inteiros. A conversão para reais ocorre apenas na formatação visual e no contrato externo da Meta.
- Os pedidos legados continuam nas adquirentes originais. O cartão não foi migrado.
