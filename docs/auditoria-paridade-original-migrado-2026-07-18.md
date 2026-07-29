# Varredura de paridade — SmartZap original × SmartZap Cloudflare

Data: 18/07/2026  
Referência: `/Users/thaleslaray/Projetos/smartzap`  
Migrado: `/Users/thaleslaray/Projetos/smartzap-cf`  
Interface examinada: `http://127.0.0.1:5174`

## Legenda

- **Sem delta confirmado**: rota, superfície e contrato existem; esta rodada não encontrou divergência nova. Não significa nova aprovação pixel a pixel.
- **Divergência intencional**: diferença decidida no catálogo vigente.
- **Falha confirmada**: diferença funcional reproduzida no código e/ou na interface.
- **Bloqueio externo**: depende de evidência do provedor.
- **Reteste pendente**: mudança anterior existe, mas a evidência final exigida pelo catálogo ainda não foi produzida.

## Resultado executivo

- 61 jornadas catalogadas e classificadas.
- 4 jornadas MiniApps foram reabertas e depois aprovadas: MINI-02, MINI-03, MINI-04 e MINI-05.
- 2 lacunas funcionais confirmadas no editor dinâmico foram corrigidas: modos de início e painel de ajustes avançados.
- A lacuna de cobertura foi fechada por um E2E específico do editor, executado nos três motores de navegador.
- 380 testes de unidade/contrato, 6 testes E2E focais, TypeScript e build de produção passaram após a correção.

## Matriz item por item

| ID | Resultado desta varredura | Evidência/observação |
| --- | --- | --- |
| AUTH-01 | Sem delta confirmado | Login, sessão e logout permanecem roteados e cobertos. |
| DASH-01 | Sem delta confirmado | Dashboard e estados principais presentes. |
| CNT-01 | Sem delta confirmado | Lista, busca, filtros, paginação e perfil presentes; rodada visual específica anterior registrada. |
| CNT-02 | Sem delta confirmado | CRUD, consentimento, tags e campos presentes. |
| CNT-03 | Sem delta confirmado | Importação/exportação e tratamento de duplicatas presentes. |
| CNT-04 | Divergência intencional | Memória/histórico avançado foi descontinuado por decisão registrada; edição compacta preservada. |
| SEG-01 | Extensão do migrado | Segmentação possui rota própria no migrado; não era uma tela equivalente no original. |
| TMP-01 | Sem delta confirmado | Lista, filtros, preview e sincronização presentes. |
| TMP-02 | Sem delta confirmado | Rascunhos, mídia, variáveis, idioma, categoria e botões presentes. |
| TMP-03 | Sem delta confirmado | Editar/publicar/status/excluir presentes. |
| TMP-04 | Sem delta confirmado | Clonagem e preservação de componentes presentes. |
| PRJ-01 | Sem delta confirmado | Criação e geração de ativos presentes. |
| PRJ-02 | Sem delta confirmado | Reabertura, edição e exclusão presentes. |
| CMP-01 | Sem delta confirmado | Lista, filtros, pastas, tags e métricas presentes; menus internos substituem selects nativos. |
| CMP-02 | Sem delta confirmado | Contrato de variáveis e preview lateral único presentes após correções anteriores. |
| CMP-03 | Sem delta confirmado | Público de teste automático e demais modos presentes. |
| CMP-04 | Sem delta confirmado | Validação, agenda, rascunho e disparo presentes. |
| CMP-05 | Sem delta confirmado | Detalhe, lotes, métricas e eventos operacionais presentes. |
| CMP-06 | Sem delta confirmado | Pastas, tags, clone, CSV e reenvio presentes. |
| PRC-01 | Reteste pendente | Sincronização automática da tabela oficial ainda precisa de evidência final da fonte vigente. |
| PRC-02 | Sem delta confirmado | Estimativa por mensagem/lote presente. |
| PRC-03 | Sem delta confirmado | Conversão e último câmbio válido presentes. |
| PRC-04 | Reteste pendente | Faixa compacta implementada; confirmação real da Meta continua dependente do evento de pricing. |
| PRC-05 | Sem delta confirmado | Estado indisponível não inventa taxa. |
| INB-01 | Sem delta confirmado | Lista, busca, conversa e atualização em tempo real presentes. |
| INB-02 | Sem delta confirmado | Texto, template, mídia e status presentes. |
| INB-03 | Sem delta confirmado | Respostas rápidas, labels, notas, handoff e atendente presentes. |
| ATD-01 | Extensão do migrado | Portal de atendimento possui rotas próprias no migrado. |
| ATD-02 | Extensão do migrado | Gestão de atendentes possui área própria. |
| KNO-01 | Extensão intencional | Base de conhecimento/RAG foi adicionada ao escopo solicitado. |
| AI-01 | Divergência intencional | Migrado usa um único provedor, conforme decisão de produto. |
| AI-02 | Sem delta confirmado | CRUD, configuração, teste e RAG de agentes presentes. |
| AI-03 | Sem delta confirmado | Sugestão, contexto, RAG e handoff presentes. |
| AI-04 | Sem delta confirmado | Testes adversariais de falha segura e isolamento existem. |
| MINI-01 | Sem delta confirmado | Lista, busca, atualização e abertura presentes. |
| MINI-02 | **Corrigida e retestada** | Os três modos foram restaurados dentro de “Começar” e testados pela interface. |
| MINI-03 | **Corrigida e retestada** | Seleção/aplicação de modelo voltou ao editor e persistiu após salvar/reabrir. |
| MINI-04 | **Corrigida e retestada** | IA dentro do editor cobre loading, sucesso, persistência, cancelamento e erro seguro. |
| MINI-05 | **Corrigida e retestada** | “Ajustes avançados” e o painel estrutural de telas/rotas foram restaurados. |
| MINI-06 | Sem delta confirmado | Validar JSON, draft, publicar e enviar continuam presentes. |
| MINI-07 | Bloqueio externo | Google Calendar/flow dinâmico exige OAuth e prova real. |
| FORM-01 | Sem delta confirmado | CRUD, slug, publicação e exclusão presentes. |
| FORM-02 | Sem delta confirmado | Formulário público, validação e confirmação presentes. |
| FORM-03 | Sem delta confirmado | Submissões, busca, filtro, detalhe e exportação presentes. |
| SET-01 | Sem delta confirmado | IDs editáveis, segredo mascarado e sincronização pós-salvamento presentes. |
| SET-02 | Sem delta confirmado | Diagnóstico Meta presente. |
| SET-03 | Sem delta confirmado | Performance e throughput presentes. |
| SET-04 | Sem delta confirmado | Contato de teste e parâmetros operacionais presentes. |
| SET-05 | Sem delta confirmado | Métricas reais/indisponibilidade explícita presentes. |
| META-01 | Bloqueio externo | Falta evento real BSUID/username sem telefone/recipient_id. |
| CAL-01 | Bloqueio externo | Falta configuração e consentimento OAuth reais. |
| WEB-01 | Sem delta confirmado | Verificação, assinatura, fila, idempotência e replay presentes. |
| WEB-02 | Sem delta confirmado | Progressão sent/delivered/read/failed coberta. |
| WEB-03 | Sem delta confirmado | Payload grande e eventos operacionais cobertos. |
| SEC-01 | Sem delta confirmado | Contratos de segurança permanecem cobertos. |
| RSP-01 | Evidência anterior, nova regressão focal necessária | Cobertura geral existe; o editor restaurado precisará ser testado em todos os viewports. |
| ERR-01 | Sem delta confirmado | Error Boundary e estados de recuperação presentes. |
| OPS-01 | Sem delta confirmado | Health, filas, cron, retenção e recuperação presentes. |
| WFL-01 | Fora do escopo | Workflows foram explicitamente excluídos. |
| WFL-02 | Fora do escopo | Execução de workflows foi explicitamente excluída. |
| COEX-01 | Fora do escopo | Coexistência não será implementada agora. |

## Defeitos confirmados em detalhe

### PAR-MINI-01 — Etapa “Começar” mutilada

No original, `app/(dashboard)/flows/builder/[id]/page.tsx` renderiza três escolhas: “Criar com IA”, “Usar modelo pronto” e “Criar do zero”, com painéis e ações próprias. No migrado, `app/pages/FlowBuilder.tsx`, a função `StartStep` recebe apenas `name`/`setName` e renderiza somente “Nome do MiniApp”. A interface real confirmou exatamente esse DOM.

Impacto: o usuário entra no editor e perde dois caminhos principais de criação e a escolha explícita do terceiro.

### PAR-MINI-02 — Ajustes avançados ausentes

O original passa `onOpenAdvanced` para `UnifiedFlowEditor` e abre `AdvancedFlowPanel`. O migrado não contém o comando nem o painel. A edição básica de telas não substitui essa superfície.

Impacto: configurações avançadas do Flow/data exchange deixam de ser descobertas e operáveis pela interface.

### PAR-QA-01 — Testes aprovavam o produto errado

Os testes focais atuais exercitam “Criar com IA” e “Criar por template” em `FlowBuilderHome`, mas não verificam que as mesmas opções existam no passo “Começar” de `/flows/builder/:id`. Assim, 380 testes passam apesar da regressão funcional.

## Conclusão

As regressões estruturais de MiniApps encontradas nesta varredura foram corrigidas. Os modos de início e os ajustes avançados voltaram ao editor, com cobertura real de interface em Chromium, Firefox e WebKit, incluindo viewport móvel. Bloqueios externos e divergências deliberadas permanecem conforme a matriz.
