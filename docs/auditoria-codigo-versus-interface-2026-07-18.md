# Auditoria completa — código original versus SmartZap migrado

Data: 18/07/2026  
Referência: `/Users/thaleslaray/Projetos/smartzap`  
Migrado: `/Users/thaleslaray/Projetos/smartzap-cf`  
Ambiente observado: `http://127.0.0.1:5174`  
Publicação: não executada

## Resumo executivo

A migração cobre o núcleo operacional — campanhas, contatos, segmentos, Inbox, templates, MiniApps, Forms, IA, configurações, Meta e Cloudflare — mas a casca global ainda não tem paridade completa com o original. A principal conclusão desta rodada é que a diferença não está mais concentrada nas páginas grandes: ela está em comportamentos globais substituídos por atalhos falsos, jornadas de instalação ausentes e código de funcionalidades removidas que continua ativo por trás da interface.

Foram confirmados **8 achados**: **2 altos**, **4 médios** e **2 baixos**. Não foi identificado defeito crítico de autenticação, exposição de segredo ou bypass direto de autorização nesta revisão. Quatro novas jornadas foram incluídas em `jornada.md`: `NAV-01`, `ONB-01`, `PWA-01` e `SEC-02`.

## 1. Navegação global e casca — severidade alta

### 1.1 Ações do cabeçalho não correspondem ao que anunciam

No original, a ajuda abre `TutorialsSheet`, o botão de código alterna `DevModeProvider` e o cabeçalho integra o checklist de onboarding. No migrado:

- `Tutoriais de Configuração` navega para `/settings/meta-diagnostics`;
- `Ativar modo desenvolvedor` navega para `/settings/performance`, sem alternar estado algum;
- `Notificações (1 nova)` também navega para diagnóstico;
- o ponto verde e o texto “1 nova” são permanentes, sem contagem real ou central de notificações.

Evidência: `app/components/Shell.tsx:219-256`, comparado com `app/(dashboard)/DashboardShell.tsx:549-562` e `components/ui/dev-mode-toggle.tsx:15-31` do original.

Impacto: controles globais enganosos, perda de tutorial no contexto, ausência do modo dev real e notificação falsa. Afeta desktop e mobile porque o comportamento está duplicado nos dois cabeçalhos do migrado.

Recomendação: restaurar componentes/estado reais; se notificações forem retiradas do produto, remover o botão e o badge em vez de simular uma notificação.

### 1.2 Rotas desconhecidas ou legadas podem produzir apenas a casca vazia

O `AuthedApp` não possui rota filha `*`, tela 404 nem redirecionamento explícito. O roteador externo encaminha todo `/*` autenticado para ele, mas, se nenhuma rota filha casar, o `Shell` permanece sem conteúdo útil.

Evidência: `app/App.tsx:35-73` e `app/App.tsx:76-89`.

Impacto: favoritos antigos como `/workflows`, links incorretos e URLs digitadas manualmente não explicam que a função foi removida ou qual é o destino correto.

Recomendação: adicionar fallback autenticado explícito com 404/retorno ao Dashboard e redirects deliberados para URLs legadas que ainda devem funcionar.

## 2. Primeira instalação e onboarding — severidade alta

O original contém uma jornada integrada de primeira instalação: `OnboardingOverlay`, modal, checklist, retomada persistida, credenciais, webhook, banner de sucesso e tour guiado. Esses componentes são montados pela casca original e não possuem equivalente no migrado. O migrado oferece configuração manual em `/settings`, mas isso não substitui o fluxo orientado nem o estado de progresso.

Evidência original: `components/features/onboarding/*`, `components/features/setup/*` e `app/(dashboard)/DashboardShell.tsx`; ausência correspondente em `app` e `src` do migrado.

Impacto: cada implantação para cliente depende de conhecimento técnico e navegação manual; falhas parciais não têm retomada guiada. Isso contradiz o objetivo de simplificar instalações independentes.

Recomendação: definir uma versão Cloudflare do onboarding, reaproveitando os contratos de Settings/diagnóstico já existentes. O fluxo deve ser idempotente e poder ser reaberto sem apagar configuração válida.

## 3. Funcionalidades fora do escopo ainda ativas — severidade média

### 3.1 Workflows foi retirado da interface, mas continua operacional por API

`WFL-01` e `WFL-02` estão oficialmente fora do escopo e não existem em `App.tsx`. Entretanto, o Worker monta `/api/workflows`, com listar, criar, editar, publicar, versionar, executar em Queue, duplicar e excluir. As páginas React `Workflows.tsx` e `WorkflowBuilder.tsx` também permanecem no repositório sem rota.

Evidência: `src/api/router.ts:75`, `src/api/workflows.ts:98-286`, `app/pages/Workflows.tsx` e `app/pages/WorkflowBuilder.tsx`.

Impacto: superfície mutável invisível, migrations e Queue mantidas sem jornada de usuário, teste ou suporte. A autenticação global reduz o risco externo, mas qualquer cliente autenticado ou API key válida ainda pode operar uma feature que o produto declara inexistente.

Recomendação: remover o mount e a execução ou protegê-los por feature flag negada por padrão com resposta `410 Gone`. Depois, remover páginas, migrations e execução somente após verificar dependências históricas.

### 3.2 Memória/histórico avançado de contatos foi removido da UI, mas não do produto interno

`CNT-04` registra que a ficha avançada foi descontinuada. A interface usa apenas `EditContactModal`, porém `ContactProfileModal` continua no mesmo arquivo, inacessível, com hooks de histórico/memória. Os endpoints GET/PUT/DELETE continuam montados.

Evidência: `app/pages/Contacts.tsx:670-674`, código morto em `app/pages/Contacts.tsx:1336+`, hooks em `app/hooks/useContacts.ts:285-338` e endpoints em `src/api/contacts.ts:415-615`.

Impacto: duas implementações concorrentes do perfil, risco de manutenção acidental e APIs de dados persistentes sem interface ou jornada aprovada.

Recomendação: remover o componente e hooks mortos; decidir explicitamente se a memória é necessária à IA. Se for interna, documentar e limitar o contrato. Se não for, retirar endpoints/tabelas com migração segura.

## 4. PWA, atualização e push — severidade média

O original monta `PWAProvider`, possui manifesto, service worker e APIs de subscribe/unsubscribe/send. Não há equivalente no migrado. A ausência não estava documentada como decisão de produto antes desta auditoria.

Evidência original: `app/providers.tsx:5-42`, `components/pwa/PWAProvider.tsx`, `app/api/push/*` e manifesto em `app/layout.tsx`. Busca correspondente no migrado não encontrou provider, manifesto, registro de service worker ou API de push.

Impacto: perda de instalação como app, atualização controlada e notificações push. Também explica por que o sino do migrado não pode representar uma central real.

Recomendação: decisão de produto primeiro. Se a PWA continuar, implementar conforme o runtime Cloudflare e testar instalação/update/permissões. Caso contrário, marcar `PWA-01` como `descontinuada` e retirar o sino.

## 5. Configuração e resíduos de piloto — severidade média

As travas de piloto estão desativadas por padrão por `PILOT_GUARDS_ENABLED`, portanto não bloqueiam produção normal. Porém o domínio, ledger, diagnósticos, mensagens de erro e secrets antigos continuam espalhados. O build ainda avisa que `PILOT_SEND_ENABLED` e `PILOT_RECIPIENT_E164` são obrigatórios, apesar de o modo não estar ativo.

Evidência: `src/domain/pilot.ts`, imports em campanhas, conversas, IA e workflows; `wrangler.jsonc:36-44`; aviso do build desta rodada.

Impacto: ruído operacional e risco de alguém interpretar secret ausente como falha real, além de aumentar a complexidade dos caminhos críticos de envio.

Recomendação: manter apenas uma feature flag de segurança explicitamente documentada ou remover o subsistema completo. O validador de build não deve exigir secrets de uma feature desativada.

## 6. Desempenho e empacotamento — severidade baixa

O build passou, mas avisou chunk cliente acima de 500 kB. O bundle principal ficou em aproximadamente `770 kB` minificado (`194 kB` gzip). No Worker, os módulos de PDF são grandes: cerca de `901 kB` e `2,1 MB` antes de gzip.

Impacto: carregamento inicial e custo de parse maiores do que o necessário. As páginas não alcançáveis de Workflow não entram necessariamente no bundle por import, mas as páginas principais continuam todas importadas estaticamente em `App.tsx`.

Recomendação: lazy routes por domínio e import dinâmico do PDF apenas dentro da jornada de upload. Medir Web Vitals antes/depois; não otimizar apenas pelo tamanho bruto.

## 7. Portabilidade do PDF — severidade baixa

Os 380 testes passaram, mas o ambiente local emitiu aviso de binding opcional `@napi-rs/canvas` ausente. O código usa PDF.js somente para extração textual e inclui polyfill de `DOMMatrix`, portanto a extração coberta não falhou. Ainda assim, o aviso deve ser tratado como risco de portabilidade, não ignorado.

Evidência: `src/knowledge/service.ts:1-55` e saída de `npm test`.

Recomendação: manter teste de PDF textual no bundle Worker real e falha clara para PDF sem camada de texto. Não afirmar suporte a OCR/renderização, pois isso não existe nesse caminho.

## 8. Cobertura, segurança e pontos que passaram

- Autenticação e middleware continuam cobrindo `/api/*`; não foi observado endpoint mutável público acidental nesta revisão.
- Webhook Meta permanece separado e autenticado por assinatura.
- Realtime existe no migrado via WebSocket/Durable Object; não é uma lacuna em relação ao provider centralizado do original.
- O núcleo de MiniApps, campanhas, contatos, templates, Inbox, Forms, IA, preços e configurações possui rotas e contratos reais; os defeitos desta rodada estão principalmente na casca e em superfícies residuais.
- `npm test`: **46 arquivos, 380 testes aprovados**.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado, com avisos descritos acima; sanitização removeu `.dev.vars` do artefato final.
- `git diff --check`: aprovado.

## Prioridade sugerida

1. Corrigir `NAV-01`: ações honestas no cabeçalho e fallback de rotas.
2. Definir e implementar `ONB-01` para instalação por cliente.
3. Fechar `SEC-02`: bloquear/remover Workflows e decidir memória interna de contatos.
4. Decidir `PWA-01`; restaurar ou descontinuar formalmente.
5. Limpar resíduos de piloto e, depois, dividir o bundle.

## Veredito

**Não está em paridade completa com o original.** O núcleo funcional está sólido e a regressão automatizada está verde, mas a migração ainda contém controles globais enganosos, uma jornada crítica de instalação ausente e duas funcionalidades supostamente removidas que continuam operacionais por código/API. Essas lacunas precisam ser tratadas antes de chamar a migração de completa.
