# SmartZap — Guia de Instalação (rápido)

Este guia é o caminho mais curto para subir o SmartZap localmente.

> Quer o passo a passo completo (Vercel + Wizard + validações)?
> Veja também: `docs/GUIA_CONFIGURACAO.md`.

---

## Pré-requisitos

- Node.js 20+ (recomendado)
- Um projeto no Supabase (PostgreSQL) para persistência
- (Recomendado) Upstash QStash para processamento em background de campanhas
- (Opcional) Credenciais da Meta para envio real via WhatsApp Cloud API

---

## Instalação local

### 1) Instale dependências

```bash
npm install
```

### 2) Configure variáveis de ambiente

Copie o exemplo:

```bash
cp .env.example .env.local
```

Preencha o `.env.local`.

**Mínimo recomendado para ambiente funcional**:

- `MASTER_PASSWORD`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- QStash: `QSTASH_TOKEN`

**Opcional**:

- WhatsApp Cloud API: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
- IA: `GEMINI_API_KEY` (ou equivalentes)

### 3) Rode o projeto

```bash
npm run dev
```

Abra `http://localhost:3000`.

---

## Setup guiado (recomendado)

O SmartZap tem um assistente de configuração:

- Acesse `/setup`
- Siga os passos (senha → Supabase → QStash → WhatsApp opcional)

Detalhes completos (incluindo Vercel): `docs/GUIA_CONFIGURACAO.md`.
