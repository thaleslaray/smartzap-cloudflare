# Gerenciamento do Schema do Banco de Dados

Este documento descreve como manter e atualizar o schema do banco de dados do SmartZap.

## Estrutura de Arquivos

```
supabase/
  migrations/
    20251201000000_schema_init.sql   # Schema consolidado principal (DDL + seed data)
    _archive/                         # Migrations antigas já consolidadas (histórico)
  rollbacks/
    20260122100000_remove_telegram_schema.sql  # Script para remover Telegram (opcional)
```

**Importante:** Apenas `schema_init.sql` é executado na instalação. Os arquivos em `_archive/` são mantidos apenas para referência histórica.

## Filosofia: Schema Único Consolidado

O SmartZap usa um **arquivo único consolidado** (`schema_init.sql`) em vez de múltiplas migrations incrementais. Isso porque:

1. **Instalação rápida**: Um único round-trip ao banco
2. **Menos pontos de falha**: Uma migration que funciona > 10 que podem falhar
3. **Mais fácil de entender**: Todo o schema em um lugar
4. **Idempotente**: Usa `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, etc.

## Como Atualizar o Schema

### Opção 1: Edição Manual (Recomendado para mudanças pequenas)

1. Edite diretamente o `20251201000000_schema_init.sql`
2. Adicione a nova tabela/coluna no lugar apropriado
3. Teste em um projeto Supabase novo
4. Commite a mudança

### Opção 2: Dump do Banco (Recomendado para sincronização completa)

Quando o banco de produção divergir muito do schema_init.sql:

```bash
# 1. Conecte ao banco via psql ou use Supabase MCP
# 2. Execute este script para extrair DDL limpo:

pg_dump --schema-only --no-owner --no-acl \
  -n public \
  "postgresql://postgres.[ref]:[password]@[host]:6543/postgres" \
  > schema_raw.sql
```

**IMPORTANTE: Limpe o dump antes de usar!**

### Limpeza do Dump do Supabase

O `pg_dump` inclui coisas que **quebram** no Supabase. Remova:

#### 1. Headers de Configuração (REMOVER)

```sql
-- ❌ REMOVER TUDO ISSO:
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
```

**Por quê?** O Supabase gerencia essas configurações internamente.

#### 2. Criação do Schema Public (REMOVER)

```sql
-- ❌ REMOVER ISSO:
CREATE SCHEMA IF NOT EXISTS public;
COMMENT ON SCHEMA public IS 'standard public schema';
```

**Por quê?** O Supabase já cria o schema `public` automaticamente.

#### 3. Funções do pgvector (NÃO INCLUIR)

Funções como `array_to_vector`, `cosine_distance`, `halfvec_*`, `sparsevec_*`, `vector_*` são da **extensão pgvector** e não devem estar no schema_init.sql. Elas são criadas automaticamente ao habilitar a extensão.

**Manter apenas:**
- `CREATE EXTENSION IF NOT EXISTS vector;`
- Suas funções customizadas que USAM pgvector (ex: `search_embeddings`)

#### 4. Comentários do pg_dump (OPCIONAL - limpar)

```sql
-- ❌ Pode remover:
-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

-- PostgreSQL database dump
-- PostgreSQL database dump complete
```

### Checklist de Limpeza do Dump

- [ ] Remover `SET statement_timeout`, `lock_timeout`, etc.
- [ ] Remover `SELECT pg_catalog.set_config(...)`
- [ ] Remover `CREATE SCHEMA public`
- [ ] Remover `COMMENT ON SCHEMA public`
- [ ] Remover funções nativas do pgvector (array_to_*, cosine_distance, halfvec_*, etc.)
- [ ] Manter apenas `CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] Remover comentários de versão do pg_dump
- [ ] Adicionar header customizado do SmartZap

### Header Recomendado

```sql
-- =============================================================================
-- SMARTZAP - SCHEMA CONSOLIDADO
-- Gerado: YYYY-MM-DD
-- Versão: X.Y.Z
-- =============================================================================
--
-- Este arquivo contém TODO o schema do SmartZap.
-- Executar uma única vez em um projeto Supabase novo.
-- Idempotente: pode re-executar sem erros (usa IF NOT EXISTS).
--
-- =============================================================================
```

## Extração de DDL via SQL (Alternativa ao pg_dump)

Se não tiver acesso ao pg_dump, pode extrair via SQL:

### Listar Tabelas

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### Gerar CREATE TABLE (aproximado)

```sql
SELECT
  'CREATE TABLE public.' || c.relname || ' (' ||
  string_agg(
    a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) ||
    CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN ad.adbin IS NOT NULL THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid) ELSE '' END,
    ', ' ORDER BY a.attnum
  ) || ');'
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
GROUP BY c.relname;
```

### Listar Funções Customizadas

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname NOT LIKE 'vector%'
  AND p.proname NOT LIKE 'halfvec%'
  AND p.proname NOT LIKE 'sparsevec%';
```

### Listar Triggers

```sql
SELECT pg_get_triggerdef(t.oid, true)
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal;
```

### Listar Policies RLS

```sql
SELECT
  'CREATE POLICY "' || policyname || '" ON ' || tablename ||
  ' FOR ' || cmd || ' TO ' || roles::text ||
  ' USING (' || COALESCE(qual, 'true') || ')' ||
  CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END || ';'
FROM pg_policies
WHERE schemaname = 'public';
```

## Ordem de Execução no schema_init.sql

1. **Extensões** (`CREATE EXTENSION`)
2. **Functions** (triggers precisam delas)
3. **Tables** (na ordem de dependência)
4. **Views**
5. **Sequences** e defaults
6. **Primary Keys**
7. **Indexes**
8. **Triggers**
9. **Foreign Keys** (SEMPRE no final!)
10. **Check Constraints**
11. **RLS Policies**
12. **Realtime** (`ALTER PUBLICATION`)
13. **Storage Buckets**

**IMPORTANTE:** Foreign Keys no final evita problemas de ordem de criação.

## Testando o Schema

Após modificar o schema_init.sql:

1. Crie um projeto Supabase novo (pode ser free tier)
2. Execute o schema_init.sql inteiro
3. Verifique se não há erros
4. Delete o projeto de teste

## Histórico de Consolidações

| Data | Descrição |
|------|-----------|
| 2026-01-20 | Consolidação inicial (fab8738) |
| 2026-01-21 | Consolidação completa: attendant_tokens, push_subscriptions, strategy_prompts (sem Telegram) |
| 2026-01-22 | Adicionado handoff_instructions em ai_agents |

### Migrations Consolidadas em 2026-01-21

- `20260121000001_add_handoff_enabled.sql` - Coluna handoff_enabled em ai_agents
- `20260121000002_add_attendant_tokens.sql` - Tabela attendant_tokens para atendentes web
- `20260121000003_add_push_subscriptions.sql` - Tabela push_subscriptions para PWA
- `20260122000001_seed_strategy_prompts.sql` - Prompts de estratégia (Marketing/Utility/Bypass)
- `20260122000002_add_booking_tool_enabled.sql` - Coluna booking_tool_enabled em ai_agents
- `20260122000003_add_template_variables_columns.sql` - Colunas sample/marketing_variables
- `20260122000004_add_source_to_template_projects.sql` - Coluna source em template_projects
- `20260122000005_add_missing_template_item_columns.sql` - Colunas header/footer/buttons/variables

### Migrations Consolidadas em 2026-01-22

- `20260122000001_add_handoff_instructions.sql` - Coluna handoff_instructions em ai_agents (instruções de handoff)

**Nota:** Telegram Mini App (`20260122000000_telegram_miniapp.sql`) NÃO foi consolidado - feature removida.

## Rollbacks Disponíveis

Scripts em `supabase/rollbacks/` para desfazer features opcionais:

| Script | Descrição |
|--------|-----------|
| `remove_telegram_schema.sql` | Remove tabelas e funções do Telegram Mini App |
