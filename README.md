# Megan Waseller API+ (frete + pagamento)

Webhook IA (Megan) para WhatsApp Cloud API com integração **Waseller**, **frete (tabela ou Bling stub)** e **pagamento (Mercado Pago)**.

## 1) Deploy
- Node 18+
- `npm install`
- Crie `.env` com:
```
PORT=3000
VERIFY_TOKEN=seu_token_webhook
WHATS_TOKEN=SEU_META_ACCESS_TOKEN
WHATS_PHONE_ID=SEU_PHONE_NUMBER_ID
OPENAI_API_KEY=SUA_CHAVE_OPENAI
BOT_NAME=Megan

# Pagamento (Mercado Pago)
MP_ACCESS_TOKEN=SEU_TOKEN_MP
MP_SUCCESS_URL=https://sua-loja.com/sucesso
MP_FAILURE_URL=https://sua-loja.com/erro
MP_NOTIFICATION_URL=https://SUA-URL/payouts/webhook

# Frete
FREIGHT_MODE=tabela   # ou "bling" (stub)
FREIGHT_TABLE_JSON={"SC":[{"max":1,"price":22},{"max":5,"price":35},{"max":999,"price":79}],"SP":[{"max":1,"price":26},{"max":5,"price":39},{"max":999,"price":89}]}
BLING_API_KEY=SUA_CHAVE_BLING # se for usar "bling"
```

> **Dica:** Troque `FREIGHT_MODE` para **bling** quando ajustar a chamada real do Bling (o código tem um **stub** para você completar).

## 2) Conectar no WhatsApp Cloud API
- **Callback URL**: `https://SUA-URL/webhook`
- **Verify Token**: o mesmo de `VERIFY_TOKEN`
- Selecione eventos de mensagens.

## 3) Integração com o Waseller
- **POST** `https://SUA-URL/waseller-in`
- **Headers**: `Content-Type: application/json`
- **Body (exemplo)**:
```json
{ "to": "55SEUNUMERO", "text": "Kit Alicate 2un CEP 88200-000" }
```
A API:
- Faz parsing de **produto/quantidade/CEP**
- Calcula **frete + prazo** (tabela ou Bling stub)
- Gera **link de pagamento** **Mercado Pago** (cartão/boleto)
- **Envia** a resposta no Whats e retorna um **preview** em JSON

## 4) Links de pagamento
- Endpoint manual: `POST /payments/create`
```json
{ "title": "Kit Alicate", "qty": 2, "unit": 397, "to": "55SEUNUMERO", "cep": "88200000" }
```
- Webhook MP: `POST /payments/webhook` (configure em **MP_NOTIFICATION_URL**)

## 5) Como funciona o frete
- **tabela**: você define `FREIGHT_TABLE_JSON` por UF e faixas de peso.
- **bling**: existe um **stub** (`freightByBling`) para você trocar pelo endpoint real do Bling (envie `cep`, `peso`, `dimensões` e retorne `preço/prazo`).

## 6) Ajustes recomendados
- Produto/preço: edite `unit = 397.0` por item ou conecte seu **catálogo**.
- Persistência: trocar memória em RAM por Redis/DB.
- Pós-pagamento: no `payments/webhook`, consultar status e enviar **rastreamento**.

## 7) Testes rápidos
- Enviar mensagem:
```bash
curl -X POST https://SUA-URL/send -H "Content-Type: application/json" -d '{"to":"55SEUNUMERO","body":"Teste OK"}'
```
- Simular Waseller:
```bash
curl -X POST https://SUA-URL/waseller-in -H "Content-Type: application/json" -d '{"to":"55SEUNUMERO","text":"Kit Alicate 2un CEP 88200-000"}'
```

---

**Pronto para vender:** orçamento automático (CEP + produto + qtd) → frete/prazo → link de pagamento → confirmação.
