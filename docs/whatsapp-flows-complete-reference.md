# WhatsApp Flows - Referência Completa

> Documento consolidado com toda a documentação oficial da Meta sobre WhatsApp Flows.
> Gerado em: 15/01/2026

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Configuração do Endpoint](#2-configuração-do-endpoint)
3. [Criptografia](#3-criptografia)
4. [Health Check (CRÍTICO)](#4-health-check-crítico)
5. [Data Exchange](#5-data-exchange)
6. [Error Notification](#6-error-notification)
7. [Flow JSON](#7-flow-json)
8. [Publicação - Requisitos](#8-publicação---requisitos)
9. [Monitoramento e Webhooks](#9-monitoramento-e-webhooks)
10. [Códigos de Erro](#10-códigos-de-erro)
11. [Checklist de Implementação](#11-checklist-de-implementação)

---

## 1. Visão Geral

WhatsApp Flows são experiências interativas estruturadas dentro do WhatsApp. Existem dois tipos:

- **Flows Estáticos**: Não precisam de endpoint, toda a lógica está no Flow JSON
- **Flows Dinâmicos**: Usam `data_exchange` para buscar dados em tempo real de um endpoint

### Quando usar Endpoint

Use endpoint quando precisar de:
- Dados dinâmicos (ex: horários disponíveis de agenda)
- Validação server-side
- Integração com sistemas externos
- Lógica de negócio complexa

---

## 2. Configuração do Endpoint

### 2.1 Requisitos do Servidor

| Requisito | Descrição |
|-----------|-----------|
| **HTTPS** | Obrigatório, com certificado TLS/SSL válido |
| **Método** | Deve aceitar `POST` |
| **Disponibilidade** | 24/7, acessível da internet |
| **Latência** | < 1 segundo (ideal), < 10 segundos (máximo) |

### 2.2 Passos para Configurar

1. **Gerar par de chaves RSA 2048-bit**
2. **Registrar chave pública na Meta**
3. **Configurar endpoint HTTPS**
4. **Implementar criptografia**
5. **Vincular endpoint ao Flow**

---

## 3. Criptografia

### 3.1 Gerar Par de Chaves

```bash
# Gerar chave privada
openssl genrsa -des3 -out private.pem 2048

# Exportar chave pública
openssl rsa -in private.pem -outform PEM -pubout -out public.pem
```

### 3.2 Registrar Chave Pública na Meta

**Endpoint:** `POST /{PHONE_NUMBER_ID}/whatsapp_business_encryption`

**IMPORTANTE:** Usar `Content-Type: application/x-www-form-urlencoded`

```bash
curl -X POST \
  'https://graph.facebook.com/v24.0/PHONE_NUMBER_ID/whatsapp_business_encryption' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'business_public_key=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...
-----END PUBLIC KEY-----'
```

**Resposta de sucesso:**
```json
{ "success": true }
```

### 3.3 Verificar Chave Registrada

**Endpoint:** `GET /{PHONE_NUMBER_ID}/whatsapp_business_encryption`

**IMPORTANTE:** A resposta vem em formato de array!

```json
{
  "data": [
    {
      "business_public_key": "-----BEGIN PUBLIC KEY-----...",
      "business_public_key_signature_status": "VALID"
    }
  ]
}
```

### 3.4 Formato da Request Criptografada

Toda request do WhatsApp vem neste formato:

```json
{
  "encrypted_flow_data": "<base64>",
  "encrypted_aes_key": "<base64>",
  "initial_vector": "<base64>"
}
```

### 3.5 Algoritmo de Descriptografia

1. **Descriptografar AES key:**
   - Decodificar `encrypted_aes_key` de base64
   - Descriptografar com chave privada RSA usando `RSA/ECB/OAEPWithSHA-256AndMGF1Padding`
   - Resultado: chave AES de 128 bits

2. **Descriptografar payload:**
   - Decodificar `encrypted_flow_data` de base64
   - Separar: últimos 16 bytes = auth tag, resto = ciphertext
   - Descriptografar com AES-128-GCM usando a AES key e `initial_vector`

### 3.6 Algoritmo de Criptografia da Resposta

**TODAS as respostas devem ser criptografadas, incluindo health check!**

1. **Inverter o IV:**
   ```javascript
   const flippedIV = Buffer.alloc(iv.length)
   for (let i = 0; i < iv.length; i++) {
     flippedIV[i] = iv[i] ^ 0xFF
   }
   ```

2. **Criptografar resposta:**
   - Usar AES-128-GCM com a mesma AES key e IV invertido
   - Concatenar: ciphertext + auth tag (16 bytes)
   - Codificar em base64

3. **Retornar como texto plano:**
   ```
   Content-Type: text/plain
   ```

### 3.7 Código de Exemplo (Node.js)

```typescript
import crypto from 'crypto'

function decryptRequest(body: {
  encrypted_flow_data: string
  encrypted_aes_key: string
  initial_vector: string
}, privateKeyPem: string) {
  // 1. Descriptografar AES key
  const aesKeyBuffer = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(body.encrypted_aes_key, 'base64')
  )

  // 2. Descriptografar payload
  const ivBuffer = Buffer.from(body.initial_vector, 'base64')
  const encryptedBuffer = Buffer.from(body.encrypted_flow_data, 'base64')
  
  const authTag = encryptedBuffer.subarray(-16)
  const ciphertext = encryptedBuffer.subarray(0, -16)

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKeyBuffer, ivBuffer)
  decipher.setAuthTag(authTag)
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ])

  return {
    decryptedBody: JSON.parse(decrypted.toString('utf8')),
    aesKeyBuffer,
    ivBuffer
  }
}

function encryptResponse(
  response: object,
  aesKeyBuffer: Buffer,
  ivBuffer: Buffer
): string {
  // Inverter IV
  const flippedIV = Buffer.alloc(ivBuffer.length)
  for (let i = 0; i < ivBuffer.length; i++) {
    flippedIV[i] = ivBuffer[i] ^ 0xFF
  }

  // Criptografar
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKeyBuffer, flippedIV)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ])

  return encrypted.toString('base64')
}
```

---

## 4. Health Check (CRÍTICO)

### 4.1 Por que é Crítico

A Meta faz health checks periódicos no seu endpoint. Se falhar:
- **Publicação bloqueada** com erro "Endpoint Not Available"
- **Flow pode ser throttled ou blocked** em produção

### 4.2 Request do Health Check

```json
{
  "version": "3.0",
  "action": "ping"
}
```

### 4.3 Response Esperada

```json
{
  "data": {
    "status": "active"
  }
}
```

### 4.4 IMPORTANTE: Resposta DEVE ser Criptografada

**A resposta do health check TAMBÉM deve ser criptografada!**

```typescript
if (flowRequest.action === 'ping') {
  const pingResponse = { data: { status: 'active' } }
  const encryptedResponse = encryptResponse(
    pingResponse,
    decrypted.aesKeyBuffer,
    decrypted.ivBuffer
  )
  return new Response(encryptedResponse, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })
}
```

### 4.5 Erros Comuns no Health Check

| Erro | Causa | Solução |
|------|-------|---------|
| Endpoint Not Available | Health check falhou | Verificar se resposta está criptografada |
| 421 | Falha na descriptografia | Verificar se chave privada está correta |
| Timeout | Resposta > 10s | Otimizar endpoint |

---

## 5. Data Exchange

### 5.1 Tipos de Action

| Action | Quando é Enviado |
|--------|------------------|
| `ping` | Health check periódico |
| `INIT` | Usuário abre o Flow |
| `data_exchange` | Usuário submete uma tela |
| `BACK` | Usuário pressiona voltar (se `refresh_on_back=true`) |

### 5.2 Request Payload

```json
{
  "version": "3.0",
  "action": "INIT | data_exchange | BACK",
  "screen": "SCREEN_NAME",
  "data": {
    "field_1": "value_1",
    "field_n": "value_n"
  },
  "flow_token": "<FLOW_TOKEN>"
}
```

### 5.3 Response - Próxima Tela

```json
{
  "screen": "NEXT_SCREEN_NAME",
  "data": {
    "property_1": "value_1",
    "property_n": "value_n"
  }
}
```

### 5.4 Response - Finalizar Flow

```json
{
  "screen": "SUCCESS",
  "data": {
    "extension_message_response": {
      "params": {
        "flow_token": "<FLOW_TOKEN>",
        "custom_param": "value"
      }
    }
  }
}
```

### 5.5 Response - Erro Gracioso

```json
{
  "screen": "CURRENT_SCREEN",
  "data": {
    "error_message": "Mensagem de erro para o usuário"
  }
}
```

---

## 6. Error Notification

Quando o endpoint retorna payload inválido, a Meta envia notificação de erro.

### 6.1 Request

```json
{
  "version": "3.0",
  "action": "data_exchange",
  "flow_token": "<FLOW_TOKEN>",
  "data": {
    "error": "<ERROR_KEY>",
    "error_message": "<ERROR_MESSAGE>"
  }
}
```

### 6.2 Response Esperada

```json
{
  "data": {
    "acknowledged": true
  }
}
```

---

## 7. Flow JSON

### 7.1 Estrutura Básica

```json
{
  "version": "6.3",
  "data_api_version": "3.0",
  "routing_model": {
    "SCREEN_A": ["SCREEN_B"],
    "SCREEN_B": []
  },
  "screens": [
    {
      "id": "SCREEN_A",
      "title": "Título da Tela",
      "data": {},
      "layout": {
        "type": "SingleColumnLayout",
        "children": []
      }
    }
  ]
}
```

### 7.2 Propriedades Top-Level

| Propriedade | Obrigatório | Descrição |
|-------------|-------------|-----------|
| `version` | Sim | Versão do Flow JSON (ex: "6.3") |
| `screens` | Sim | Array de telas |
| `data_api_version` | Para endpoint | Versão da API de dados ("3.0") |
| `routing_model` | Para endpoint | Grafo de navegação entre telas |

### 7.3 Propriedades da Screen

| Propriedade | Obrigatório | Descrição |
|-------------|-------------|-----------|
| `id` | Sim | Identificador único (não pode ser "SUCCESS") |
| `layout` | Sim | Layout da tela |
| `terminal` | Não | `true` se é tela final |
| `title` | Não | Título na barra de navegação |
| `data` | Não | Schema de dados dinâmicos |
| `refresh_on_back` | Não | `true` para recarregar ao voltar |

### 7.4 Actions Disponíveis

| Action | Descrição |
|--------|-----------|
| `navigate` | Navegar para outra tela |
| `data_exchange` | Enviar dados para endpoint |
| `complete` | Finalizar o Flow |
| `update_data` | Atualizar dados da tela atual (v6.0+) |
| `open_url` | Abrir URL externa (v6.0+) |

---

## 8. Publicação - Requisitos

### 8.1 Checklist de Publicação

| Check | Descrição |
|-------|-----------|
| ✅ Número de telefone | Deve ter número verificado conectado à WABA |
| ✅ Chave pública | Deve estar registrada e assinada na Meta |
| ✅ Endpoint URI | Deve estar configurado (para Flows dinâmicos) |
| ✅ Meta App | Flow deve estar vinculado a um Meta App |
| ✅ Flow JSON válido | Sem erros de validação |
| ✅ Versões válidas | `version` e `data_api_version` não expiradas |
| ✅ Health check | Endpoint deve responder corretamente |
| ✅ Webhooks | WABA deve estar inscrita nos webhooks de Flows |

### 8.2 Erro 139002 - Publishing Failed

**Causas comuns:**

1. **Endpoint Not Available**
   - Health check falhou
   - Resposta do ping não está criptografada
   - Endpoint não acessível da internet

2. **Missing Flows Signed Public Key**
   - Chave pública não registrada
   - Chave com `signature_status` diferente de "VALID"

3. **No Application Connected**
   - Flow não está vinculado a um Meta App

---

## 9. Monitoramento e Webhooks

### 9.1 Estados do Flow

| Estado | Descrição |
|--------|-----------|
| `DRAFT` | Em desenvolvimento |
| `PUBLISHED` | Publicado e funcionando |
| `THROTTLED` | Limitado a 10 msgs/hora |
| `BLOCKED` | Completamente bloqueado |
| `DEPRECATED` | Descontinuado |

### 9.2 Métricas Monitoradas

| Métrica | Threshold para Alerta |
|---------|----------------------|
| Error Rate | 5%, 10%, 50% |
| Latência P90 | 1s, 5s, 7s |
| Disponibilidade | < 90% |

### 9.3 Webhook de Resposta do Flow

Quando usuário completa o Flow:

```json
{
  "messages": [{
    "type": "interactive",
    "interactive": {
      "type": "nfm_reply",
      "nfm_reply": {
        "name": "flow",
        "body": "Sent",
        "response_json": "{\"flow_token\":\"...\",\"custom_param\":\"value\"}"
      }
    }
  }]
}
```

---

## 10. Códigos de Erro

### 10.1 Erros de Publicação (139002)

| Erro | Solução |
|------|---------|
| Endpoint Not Available | Implementar health check criptografado |
| Missing Flows Signed Public Key | Registrar chave pública |
| No Application Connected | Vincular Meta App |
| Validation errors | Corrigir Flow JSON |

### 10.2 Erros HTTP do Endpoint

| Código | Significado | Ação do Cliente |
|--------|-------------|-----------------|
| 200 | Sucesso | Processar resposta |
| 421 | Falha na descriptografia | Re-baixar chave pública e retentar |
| 427 | Flow token inválido | Desabilitar CTA, enviar nova mensagem |
| 432 | Falha na validação de assinatura | Mostrar erro genérico |

### 10.3 Erros Reportados via Webhook

| Código | Descrição | Solução |
|--------|-----------|---------|
| `timeout_error` | Request > 10s | Otimizar endpoint |
| `public-key-missing` | Chave não encontrada | Re-registrar chave |
| `public-key-signiture-verification` | Assinatura inválida | Re-registrar chave |
| `response-decryption-error` | Falha ao descriptografar | Verificar chave usada |
| `invalid-screen-transition` | Tela não no routing_model | Corrigir routing_model |

---

## 11. Checklist de Implementação

### 11.1 Configuração Inicial

- [ ] Gerar par de chaves RSA 2048-bit
- [ ] Armazenar chave privada de forma segura
- [ ] Registrar chave pública na Meta (POST com form-urlencoded)
- [ ] Verificar status da chave (GET retorna array!)
- [ ] Configurar endpoint HTTPS com certificado válido

### 11.2 Implementação do Endpoint

- [ ] Aceitar POST com JSON body
- [ ] Implementar descriptografia correta
- [ ] Implementar criptografia da resposta
- [ ] **Health check (ping) retorna resposta CRIPTOGRAFADA**
- [ ] Tratar action INIT
- [ ] Tratar action data_exchange
- [ ] Tratar action BACK (se usar refresh_on_back)
- [ ] Tratar error notifications (retornar acknowledged: true)
- [ ] Retornar 421 se descriptografia falhar

### 11.3 Flow JSON

- [ ] Definir version e data_api_version
- [ ] Definir routing_model para todas as telas
- [ ] Pelo menos uma tela terminal
- [ ] Footer em todas as telas terminais
- [ ] Data model para dados dinâmicos

### 11.4 Publicação

- [ ] Vincular Meta App ao Flow
- [ ] Inscrever WABA nos webhooks de Flows
- [ ] Testar health check antes de publicar
- [ ] Verificar que chave está VALID

### 11.5 Monitoramento

- [ ] Configurar alertas para webhooks de erro
- [ ] Monitorar latência do endpoint
- [ ] Monitorar taxa de erro
- [ ] Ter plano de ação para throttling/blocking

---

## Referências

- [Implementing Endpoint for Flows](https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint)
- [Flow Health and Monitoring](https://developers.facebook.com/docs/whatsapp/flows/guides/healthmonitoring)
- [Flows Encryption](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/whatsapp-business-encryption)
- [Flow JSON Reference](https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson)
- [Error Codes](https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes)
- [Flows Webhooks](https://developers.facebook.com/docs/whatsapp/flows/reference/flowswebhooks)
- [GitHub Examples](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs)
