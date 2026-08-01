# Auditorias — SmartZap

Este arquivo é o registro cronológico das auditorias executadas. Ele é append-only: novas rodadas entram no topo da seção de execuções e auditorias anteriores não são apagadas nem reescritas.

O catálogo do que precisa ser testado fica em `jornada.md`.

## Modelo obrigatório para novas auditorias

Cada rodada deve registrar:

- ID e título.
- Data de abertura e encerramento.
- Solicitante e objetivo.
- Código, ambiente, URL e versão/deploy testados.
- IDs de `jornada.md` incluídos e excluídos.
- Pré-requisitos e autorizações.
- Matriz de execução com resultado e evidência.
- Defeitos encontrados, causa, correção e reteste.
- Testes focais, suíte completa, E2E, visual e produção, sempre separados.
- Dados temporários criados e confirmação de limpeza.
- Bloqueios externos e riscos restantes.
- Veredito final sem transformar pendência em aprovação.

## Estados por execução

| Estado | Uso |
| --- | --- |
| `planejada` | Escopo registrado, execução ainda não iniciada. |
| `em execução` | Há testes ou correções em andamento. |
| `aprovada` | Todo o escopo declarado possui evidência suficiente. |
| `aprovada com ressalvas` | Escopo executado, com riscos ou lacunas explicitamente aceitos. |
| `reprovada` | Uma ou mais jornadas críticas falharam. |
| `bloqueada` | Um pré-requisito externo impede continuar. |

## Execuções

### AUD-2026-07-21-02 — Restauração visual clássica preservando correções

- Estado: `corrigida — reteste pendente`.
- Data: 21/07/2026.
- Escopo: DES-02 e DASH-02; visual de Shell, Login, ações primárias, superfícies e Dashboard. Não houve alteração de APIs, dados, regras de campanhas, Inbox, IA ou integrações.
- Referência: checkpoint Git `428fa46` (07/07/2026, 18:58 BRT), anterior à fundação e ao redesign completo do design system.
- Correção: o app passou da camada `premium-app` para uma camada visual clássica, com superfícies zinc, sidebar utilitária, ações verdes retangulares e cartões sem gradientes, brilho ou sombras editoriais. O Dashboard manteve os dados e ações atuais, mas voltou a grade proporcional simples. Ajustados também os indicadores e rodapé do resumo após reteste visual inicial.
- Ajuste posterior: o CTA “Nova Campanha” foi compactado para 44 px de altura, com raio moderado, verde sóbrio e texto claro; a mesma regra foi aplicada às ações primárias compartilhadas e à campanha rápida do Dashboard.
- Alinhamento posterior: o CTA da sidebar recebeu o mesmo recuo horizontal do logo e dos itens de navegação, eliminando o deslocamento de 8 px à esquerda.
- Testes: 72/72 aprovados em campanhas, contatos e reconciliação; `git diff --check` e build de produção aprovados.
- Produção: HTTP 200 em `https://smartzap-cf.thales2581.workers.dev`, versão `c46b07ba-3b01-4f7b-a1c2-f90296b3dbf4`.
- Evidência visual: dashboard autenticado observado após a primeira publicação da restauração. A captura após o microajuste final de alinhamento expirou, portanto o reteste final de desktop e mobile permanece pendente.

### AUD-2026-07-21-01 — Dashboard fluido por viewport

- Estado: `corrigida — reteste pendente`.
- Data: 21/07/2026.
- Escopo: DASH-02 em `/`; nenhum dado operacional foi criado, alterado ou removido.
- Correção: removido o teto de largura específico do Dashboard. Em desktop, resumo operacional e seção de detalhe passam a ocupar a largura disponível e dividem a altura útil do viewport; gráfico e campanhas recentes esticam de modo proporcional. Em tablet e mobile, a grade retorna ao fluxo natural de uma coluna, sem altura fixa.
- Verificação técnica: `git diff --check` e build de produção aprovados.
- Suíte completa: 396/397 passaram. O caso preexistente `tests/reconcile.test.ts > dashboard > identifica a campanha e o motivo da falha mais recente` falhou porque a consulta remota retornou uma campanha real mais recente (`RENDERED_PAYLOAD_INVALID`) em vez da fixture esperada. Não foi alterado dado de produção nem mascarada a falha de isolamento.
- Produção: publicada em `https://smartzap-cf.thales2581.workers.dev`, versão `804d5632-72ac-40fd-94c3-f2dce697a1b5`.
- Reteste visual: pendente em sessão autenticada para confirmar os breakpoints de 360, 768, 1440 e 1920 px; não declarado como aprovado sem essa evidência.

### AUD-2026-07-20-07 — Grade alinhada de UFs

- Estado: `corrigida — reteste pendente`.
- Data: 20/07/2026.
- Escopo: SEG-02 no público personalizado de `/campaigns/new`.
- Decisão de produto: o seletor pesquisável foi rejeitado; a interação retorna aos chips de UF, preservando a familiaridade do fluxo original.
- Correção: os 27 chips agora ocupam uma grade fixa de três colunas e nove linhas completas, com dimensões e espaçamentos uniformes. A seleção continua bloqueada até Brasil estar ativo.
- Verificação técnica: 51/51 testes focais aprovados (geografia, segmentos e campanhas), `git diff --check` e build de produção aprovados.
- Produção: publicada em `https://smartzap-cf.thales2581.workers.dev`, versão `dacbfe7d-7b6c-41cb-b63d-ac8845773244`.
- Reteste visual: pendente em sessão autenticada; não declarado como aprovado sem essa evidência.

### AUD-2026-07-20-06 — Refinamento visual de localização por UF/DDD

- Estado: `corrigida — reteste pendente`.
- Data: 20/07/2026.
- Escopo: SEG-02 no público personalizado de `/campaigns/new`.
- Defeito reproduzido por captura: grade de 27 chips de UF desabilitados tinha contraste baixo, excesso de repetição e ritmo incompatível com a superfície editorial do wizard.
- Correção: substituída por seletor pesquisável “Selecionar UF ou DDD”, com nomes completos, siglas e DDDs; sem Brasil selecionado, informa a dependência de forma direta; somente UFs já escolhidas ocupam chips na tela.
- Testes: 51/51 focais aprovados em geografia, segmentos e campanhas. Build e publicação aprovados na versão `cd6c30f3-4275-4d2b-9677-d4687dcda1bf`.
- Reteste visual: pendente de confirmação em sessão autenticada após refresh.

### AUD-2026-07-20-05 — Exclusão inline de público salvo

- Estado: `corrigida — reteste pendente`.
- Data: 20/07/2026.
- Escopo: SEG-01 em `/campaigns/new`.
- Correção: após selecionar um público salvo, o mesmo bloco exibe “Excluir este público”. O primeiro clique revela confirmação inline, consequência e as ações “Excluir agora” e “Cancelar”; não existe tela ou modal dedicado.
- Testes: 49/49 focais aprovados (inclui a API de exclusão). Build e publicação concluídos.
- Reteste visual: pendente na sessão autenticada para conferir o estado de confirmação inline sem apagar um público do usuário.

### AUD-2026-07-20-04 — Contraste do CTA Nova Campanha

- Estado: `corrigida — reteste pendente`.
- Data: 20/07/2026.
- Escopo: DES-03, CTA “Nova Campanha” no shell desktop e mobile.
- Defeito reproduzido por captura: texto e ícone brancos sobre fundo mint claro, tornando a ação ilegível.
- Correção: texto e ícone passaram a declarar a tinta escura do design system; CSS do CTA reforça a cor mesmo diante de estilos herdados da navegação.
- Gate: build e publicação aprovados em `c37d3444-85d9-4547-8d63-e9e21b0067f0`.
- Reteste visual: pendente de uma sessão autenticada de navegador; não será declarado aprovado sem essa evidência.

### AUD-2026-07-20-03 — Público salvo no contexto da campanha

- Estado: `aprovada`.
- Data de abertura e encerramento: 20/07/2026.
- Escopo: NAV-01 e SEG-01; retirar Segmentos do menu global e permitir salvar/reutilizar o público no wizard de campanha.
- Correção: “Segmentos” foi renomeado para “Público personalizado” no fluxo. O botão “Salvar este público” aparece somente depois que há filtros; o modal pede nome e confirma que os critérios poderão ser reutilizados. A API persiste tags e prefixos DDI/DDD como `campaign_audience`, e a resolução da audiência recompila esses critérios ao reutilizar o público.
- Testes: 49/49 testes focais aprovados em `segments.test.ts`, `segments-api.test.ts` e `campaigns.test.ts`; build e publicação aprovados.
- Reteste de interface em produção: selecionada a tag `pilot-real-2026-07-14`, aberto o modal, salvo “Auditoria público temporário 2026-07-20” e confirmado que o select passou a exibir esse público salvo.
- Dados temporários: o público salvo de auditoria e o rascunho temporário do wizard foram removidos após conferência de zero destinatários e zero envios.
- Veredito: a jornada de público salvo está no contexto de campanha, sem menu global redundante.

### AUD-2026-07-20-02 — Descoberta de Segmentos

- Estado: `aprovada`.
- Data de abertura e encerramento: 20/07/2026.
- Escopo: NAV-01 e SEG-01; expor a rota `/segments` no menu global e garantir acesso explícito a partir do wizard de campanhas.
- Defeito reproduzido: a rota e a API de segmentos existiam, mas o menu desktop/mobile não possuía a entrada “Segmentos”; a ajuda anterior instruía uma aba inexistente.
- Correção: incluída a entrada `Segmentos` com ícone próprio no menu global e o atalho “Criar e gerenciar segmentos salvos” ficou visível na segmentação de nova campanha independentemente de haver segmentos salvos.
- Testes: `tests/segments-api.test.ts` e `tests/segments.test.ts`, 7/7 aprovados; build de produção aprovado e `git diff --check` limpo.
- Reteste de interface em produção: o menu exibiu `Segmentos` com destino `/segments`; o clique abriu a página cujo título é “Segmentos” e que contém a ação “Salvar segmento”.
- Publicação: `https://smartzap-cf.thales2581.workers.dev`.
- Veredito: NAV-01 e SEG-01 aprovadas para descoberta e abertura do gerenciador de segmentos.

### AUD-2026-07-20-01 — Matriz geográfica de audiência (DDI e DDD)

- Estado: `aprovada`.
- Data de abertura e encerramento: 20/07/2026.
- Solicitante e objetivo: validar e ampliar a segmentação de campanhas para todos os DDIs disponíveis no catálogo telefônico e todos os DDDs/UFs do Brasil, inclusive combinações de alcance e precisão.
- Escopo: SEG-02 e CMP-03 em `/campaigns/new`; sem campanha criada, sem alteração de contatos de produção e sem envio à Meta.
- Ambiente: testes D1 isolados, build local e posterior reteste visual em produção.
- Matriz prevista: 245 países/territórios, DDIs únicos, 27 UFs, 67 DDDs, DDD 61 compartilhado, busca por país/DDI, filtro OR/AND e elegibilidade com opt-in.
- Implementação: o conjunto fixo de cinco países e dez UFs foi substituído por `app/lib/audience-geography.ts`, derivado de `libphonenumber-js` para países/territórios e por uma tabela explícita dos DDDs por UF. A interface passou a usar busca em vez de renderizar 245 chips, mostra a cobertura e explica os códigos compartilhados.
- Teste de matriz: `tests/audience-geography.test.ts` conferiu 245 países/territórios, 27 UFs, 67 DDDs e o DDD 61 em DF/GO. `tests/campaigns.test.ts` criou contatos sintéticos com opt-in para cada DDI único e cada DDD único e resolveu a audiência individualmente, além dos testes de alcance (OR) e precisão (AND). Resultado focal: 42/42 testes aprovados.
- Regressão: suíte integral aprovada, 49 arquivos e 395 testes. O runner registrou avisos conhecidos de resolução opcional de `@napi-rs/canvas` no pool Workers, sem falha de teste.
- Produção: publicação em `https://smartzap-cf.thales2581.workers.dev`, versão `57cde4db-8c16-4c9e-9462-f9a60c794f6f`.
- Reteste de interface: em `/campaigns/new`, o seletor exibiu 245 países/territórios e 27 UFs; a busca por `Japão` retornou e selecionou `JP +81`; depois `Brasil (BR) +55`, `GO` e `DF` foram selecionados e permaneceram ativos. Nenhum envio foi iniciado.
- Dados temporários: a passagem entre as etapas do wizard criou um rascunho de auditoria sem destinatários nem envio; ele foi confirmado e removido. Os contatos sintéticos ficaram somente no banco de testes efêmero.
- Veredito: SEG-02 e CMP-03 aprovadas para cobertura geográfica por prefixo. Limite explícito: um filtro por DDI não separa países que usam o mesmo código internacional; o produto informa isso na interface.

### AUD-2026-07-17-09 — Seleção global no layout reduzido de Contatos

- Estado: `aprovada` no ambiente local.
- Data: 17/07/2026.
- Escopo: CNT-01 em `http://127.0.0.1:5174/contacts`; sem publicação ou integração externa.
- Defeito reproduzido: abaixo do breakpoint de tabela, a lista mostrava somente seletores individuais; não havia uma ação para marcar ou desmarcar todos os contatos visíveis.
- Correção: o layout reduzido agora mostra “Selecionar todos” acima dos cartões, com contador de selecionados e troca para “Desselecionar todos” quando a página inteira está marcada.
- Reteste de interface: viewport 390×844 validou marcar, desmarcar e ausência de rolagem horizontal em Chromium, Firefox e WebKit: 3/3 aprovados.
- Gates: TypeScript, build sanitizado e `git diff --check` aprovados.
- Veredito: CNT-01 aprovada para seleção global no layout reduzido.

### AUD-2026-07-17-08 — Botão de filtros de Contatos

- Estado: `aprovada` no ambiente local.
- Data: 17/07/2026.
- Escopo: CNT-01 em `http://127.0.0.1:5174/contacts`; sem publicação ou integração externa.
- Defeito reproduzido: o ícone de filtros alternava apenas `aria-expanded`; os filtros de Status e Tags continuavam visíveis, portanto não havia ação visual ou funcional.
- Correção: os dois controles agora são condicionados pelo estado do botão; fechar remove os controles da interface e reabrir os restaura sem perder os valores selecionados.
- Reteste de interface: abrir, fechar e reabrir os filtros passou em Chromium, Firefox e WebKit: 3/3 aprovados.
- Gates: TypeScript, build sanitizado e `git diff --check` aprovados.
- Veredito: CNT-01 aprovada para a variação de filtros expansíveis.

### AUD-2026-07-17-07 — Exclusão do último contato não derruba a tela

- Estado: `aprovada` no ambiente local.
- Data: 17/07/2026.
- Escopo: CNT-01, CNT-02 e CNT-04 em `http://127.0.0.1:5174/contacts`; nenhuma publicação nem integração externa foi executada.
- Defeito reproduzido: após a exclusão de contatos pela interface, a tela entrava no Error Boundary (“A tela encontrou um erro”).
- Causa: em lista vazia, agregações SQL `SUM` retornavam `NULL` para opt-ins e opt-outs; o componente de métricas chamava `toLocaleString()` sobre esse valor.
- Correção: o repositório normaliza agregações vazias para zero e a interface mantém fallback numérico defensivo para dados legados ou respostas incompletas.
- Reteste de interface: a aba de Contatos foi recarregada após a exclusão e exibiu Total, Opt-in e Inativos como `0`, além de “Nenhum contato encontrado.”, sem Error Boundary. A exclusão de contato manual foi também executada integralmente por navegador em Chromium, Firefox e WebKit: 3/3 aprovados.
- Gates: TypeScript, `tests/contacts.test.ts` (25/25), build de produção e `git diff --check` aprovados.
- Veredito: exclusão e estado vazio voltam a ser seguros para CNT-01, CNT-02 e CNT-04.

### AUD-2026-07-17-06 — Correção contextual dos contatos ignorados em campanhas

- Estado: `aprovada` no ambiente local.
- Data: 17/07/2026.
- Escopo: CMP-02 e CMP-04 em `http://127.0.0.1:5174/campaigns/new`; nenhuma publicação nem envio Meta foi executado.
- Defeito reproduzido: contatos com status `unknown` apareciam sob o título “Corrigir ignorados”, mas os botões de correção de campos ficavam inativos. O texto sugeria falta de campos personalizados, embora o motivo real fosse ausência de opt-in.
- Causa: a interface agrupava todos os contatos ignorados na mesma ação de correção, sem distinguir campo obrigatório, mapeamento de template e elegibilidade/consentimento.
- Correção: a validação agora apresenta ação coerente para cada causa: correção em massa/individual apenas para campo personalizado faltante, retorno ao mapeamento para variável de template ausente e “Abrir contatos” para opt-in, supressão ou outro status inelegível. O botão de revalidar permanece disponível em todos os casos.
- Prevenção: a primeira etapa bloqueia o avanço quando qualquer variável obrigatória ainda não tem fonte/valor configurado; campanhas novas não chegam à validação sem mapeamento.
- Evidência de interface: dois fluxos reais foram executados no navegador em Chromium, Firefox e WebKit: mapeamento completo de variável e contato sem opt-in que abre `/contacts`, sem exibir ação falsa de correção de campos. Resultado: 6/6 aprovados.
- Gates: `npx tsc --noEmit`, build de produção e `git diff --check` aprovados. Nenhum dado externo foi alterado.
- Veredito: CMP-02 e CMP-04 aprovadas para as variações corrigidas; recarregar a tela da campanha já aberta aplica a nova orientação.

### AUD-2026-07-17-05 — Sincronização automática ao conectar WhatsApp

- Estado: `aprovada` no ambiente local.
- Data: 17/07/2026.
- Escopo: SET-01 e TMP-01 em `http://127.0.0.1:5174/settings`; nenhuma publicação foi executada.
- Correção: salvar Phone ID ou WABA agora aciona automaticamente a leitura de templates da Meta e substitui a cópia local somente após a resposta completa do provedor. O botão manual em Templates permanece disponível para atualização sob demanda.
- Falha segura: se a Meta ou a rede falhar, a configuração é preservada, a API informa que a sincronização falhou e a lista local anterior não é apagada.
- Testes de contrato: `tests/templates.test.ts` aprovou 22/22, incluindo sincronização automática e preservação da cópia local diante de rejeição da Meta.
- Reteste de integração real: o salvamento da configuração já existente executou a sincronização automática com sucesso e retornou 53 itens; o diagnóstico local confirmou 52 aprovados, `templatesConfigured: true`, `metaLive: true` e `readyForPilot: true`.
- Gates: TypeScript, build de produção e `git diff --check` aprovados. Nenhum template foi criado, alterado ou excluído na Meta.
- Veredito: SET-01 e TMP-01 aprovadas para a variação de sincronização automática.

### AUD-2026-07-17-04 — Valores persistidos na configuração Meta

- Estado: `aprovada` no ambiente local.
- Data: 17/07/2026.
- Escopo: SET-01 em `http://127.0.0.1:5174/settings`; não houve publicação nem alteração remota na Meta.
- Defeito reproduzido: Phone Number ID e WABA ID carregados da API eram usados apenas como `placeholder`, deixando os inputs visualmente cinza e vazios apesar de a configuração estar salva.
- Causa: o estado editável do formulário iniciava vazio e não aplicava fallback para os valores retornados por `/api/settings`.
- Correção: cada campo agora exibe primeiro a edição em curso e, caso ela não exista, o valor persistido; os IDs continuam editáveis e os segredos continuam mascarados.
- Reteste de interface: o fluxo autenticado definiu IDs de teste, recarregou `/settings` e confirmou os dois valores reais nos inputs pelos seletores estáveis. Resultado: 3/3 aprovados em Chromium, Firefox e WebKit.
- Gates: `npx tsc --noEmit` e `npm run build` aprovados. Não foram criados dados externos nem enviados dados à Meta.
- Veredito: SET-01 voltou a `aprovada` para esta variação.

### AUD-2026-07-17-03 — Remoção da ficha avançada não existente no original

- Estado: `aprovada` no ambiente local.
- Data: 17/07/2026.
- Escopo: CNT-04, exclusivamente a ficha avançada de contato.
- Achado: a superfície de Memória e Histórico exibida ao clicar no nome do contato não existia no SmartZap original.
- Correção: removido o acesso à ficha avançada; o clique no contato agora abre o mesmo modal compacto de edição da referência.
- Evidência: build de produção aprovado e `visual:contacts:contract` aprovado nos sete viewports locais.
- Publicação: não executada nesta rodada.

### AUD-2026-07-17-02 — Equalização visual de Contatos contra referência executável

- Estado: `aprovada` no ambiente local; publicação não executada nesta rodada.
- Abertura e encerramento: 17/07/2026.
- Solicitante e objetivo: concluir exclusivamente a paridade visual da área de Contatos, usando o SmartZap original como referência executável; nenhuma tela de Inbox, campanhas ou Meta entrou no escopo.
- Ambientes: referência isolada em `http://127.0.0.1:3101/contacts`; migrado local em `http://127.0.0.1:5174/contacts`. Credenciais não foram registradas.
- Jornadas: CNT-01, CNT-02, CNT-03 e CNT-04.
- Evidência de interface: `scripts/audit-contact-surfaces.mjs` executado após as correções, com 23 capturas reais em `test-results/contact-surfaces/manifest.json`: lista, seleção, exclusão, novo, editar, campos personalizados, as três etapas de importação, operações em lote e perfil.
- Correções: o cadastro manual voltou ao modal compacto da referência, sem checkbox visual extra; a criação sem declaração explícita persiste o contato como `unknown`, sem elegibilidade para disparos. A importação foi equalizada em três etapas e, sem declaração explícita, também mantém os contatos como `unknown`. O diálogo de exclusão recebeu o ícone, a escala e a composição da referência. A etapa de mapeamento e o resumo final da importação foram reestruturados para reproduzir a hierarquia do original.
- Retestes: `npm test -- --run tests/contacts.test.ts` aprovou 25/25; `npm run visual:contacts:contract` aprovou os sete viewports (320×568, 360×800, 390×844, 768×1024, 1280×720, 1440×900 e 1920×1080); build de produção aprovado; E2E Chromium aprovou loading/vazio/erro e criação manual sem inferir opt-in.
- Limites da referência: os modais de Tags, Campo e Status em lote não existem no original; foram mantidos como extensões do migrado, sem substituir as superfícies equivalentes existentes.
- Limpeza: `scripts/cleanup-contact-audit-artifacts.mjs` executado ao final sem artefatos temporários remanescentes.
- Veredito: as superfícies equivalentes de Contatos foram retestadas localmente contra a referência correta. CNT-01 a CNT-04 podem voltar a `aprovada`; a publicação e a verificação pública constituem uma rodada separada.

### AUD-2026-07-17-01 — Paridade completa da área de Contatos

- Estado: `concluída — reprovada`.
- Abertura: 17/07/2026.
- Solicitante: usuário do projeto.
- Objetivo: auditar integralmente a aba Contatos do SmartZap migrado contra o aplicativo original, incluindo código, telas, modais, estados, ações, responsividade e jornadas; mapear todos os desvios antes de encerrar.
- Código auditado: `/Users/thaleslaray/Projetos/smartzap-cf`.
- Referência funcional e visual: `/Users/thaleslaray/Projetos/smartzap`.
- Ambiente: original local em `http://127.0.0.1:3100/contacts` com Supabase/Postgres local; migrado local em `http://127.0.0.1:5174/contacts` com Worker/D1 local. Evidência produzida em 17/07/2026, sem credenciais registradas.
- Escopo: CNT-01, CNT-02, CNT-03 e CNT-04, além de RSP-01 e A11Y-01 quando aplicáveis à área de Contatos.
- Exclusões: nenhuma função existente na área de Contatos do original pode ser omitida do inventário; alterações de outras áreas permanecem fora desta rodada.
- Estado inicial: a aprovação anterior de CNT-01 a CNT-04 foi reaberta como `em teste`, pois a evidência existente não comprova a paridade visual/funcional completa e o modal atual foi explicitamente contestado.
- Evidência parcial de interface — lista principal: os dois aplicativos foram abertos simultaneamente em `/contacts` (original em `http://127.0.0.1:3100` e migrado em `http://127.0.0.1:5174`) com dados locais. Foram comparados cabeçalho, indicadores, busca, filtros, tabela, paginação e ações por linha. O migrado acrescenta perfil clicável e paginação, mas não preserva integralmente a apresentação e os estados do original.
- Defeito CNT-02 — novo contato: o original oferece nome completo, telefone, e-mail, tags e campos personalizados no mesmo modal; o migrado removeu tags e campos personalizados, acrescentou uma confirmação de consentimento e alterou estrutura, textos, largura e ações. Resultado: `falhou` na paridade funcional e visual.
- Defeito CNT-02 — edição: o original usa modal compacto com nome, telefone, e-mail, tags e status. O migrado abre uma ficha extensa com dados, tags, campos personalizados, memória e histórico, sem reproduzir o fluxo nem o layout original. Resultado: `falhou` na paridade funcional e visual.
- Defeito CNT-02 — campos personalizados: o original usa sheet lateral “Gerenciar Campos”, gera automaticamente a chave da variável, exibe campos do sistema e separa campos personalizados. O migrado usa modal central “Organização de contatos”, mistura tags e campos, exige chave manual e oferece tipos adicionais. Resultado: `falhou` na paridade funcional e visual.
- Defeito CNT-03 — importação: o original inicia um assistente visual de três etapas (arquivo, mapeamento/pré-validação e resultado/correção); o migrado expõe textarea de CSV e nomes técnicos de colunas em um único modal. Resultado: `falhou` na paridade e na simplicidade da jornada.
- Defeito CNT-02 — exclusão: ambos pedem confirmação, porém o original usa diálogo de alerta central com texto genérico e o migrado usa modal retangular com nome e aviso de remoção do histórico. Resultado: comportamento destrutivo protegido, mas `falhou` na paridade visual/textual.
- Defeito CNT-04 — seleção: o original expõe exportação e exclusão no cabeçalho ao selecionar; o migrado cria uma barra adicional com Tags, Campo e Status e não apresenta exclusão nessa barra. Resultado: capacidade divergente e hierarquia visual incompatível com o original.
- Segurança desta execução: nenhuma exclusão, importação ou alteração persistente foi confirmada durante a comparação; os diálogos destrutivos foram apenas abertos e cancelados.
- Evidência final de superfícies: `scripts/audit-contact-surfaces.mjs` abriu e capturou 23 estados reais dos dois aplicativos. O manifesto está em `test-results/contact-surfaces/manifest.json` e inclui lista, sem resultado, seleção, exclusão em massa, novo, editar, excluir, campos, as três etapas da importação original, o importador migrado, três modais de lote e perfil/memória/histórico.
- Evidência final responsiva: `scripts/visual-diff-contacts.mjs` comparou a lista em 1280×720, 1440×900, 1920×1080, 768×1024, 390×844, 360×800 e 320×568. As diferenças foram, respectivamente, 3,527%, 3,517%, 3,406%, 4,777%, 4,697%, 5,194% e 5,978%; resumo em `test-results/visual-contacts/summary.json`.
- Acessibilidade: o importador original não fecha por Escape e não transfere/retorna o foco corretamente. O migrado fecha por Escape e devolve o foco ao botão Importar CSV. Essa melhoria deve ser preservada durante a equalização.
- Testes focais: `npm test -- tests/contacts.test.ts tests/contact-profile.test.ts` aprovou 28 de 28 testes; `npm run e2e:contacts` e `npm run e2e:contact-import` aprovaram seus fluxos e removeram os artefatos temporários.
- Matriz definitiva: `docs/auditoria-contatos-paridade-2026-07-17.md`, com 42 pontos confrontados entre original e migrado, componentes autoritativos e decisão de equalização.
- Contagem final: 42 pontos mapeados; 23 estados de interface capturados; 7 viewports comparados; 28 testes de API aprovados; 2 fluxos E2E aprovados; 10 falhas críticas de paridade e 7 divergências adicionais de composição/comportamento.
- Jornadas: CNT-01, CNT-02, CNT-03 e CNT-04 encerram esta rodada como `falhou`. RSP-01 continua funcionalmente responsiva, mas a paridade visual de Contatos falhou em todos os viewports. A11Y-01 do migrado permanece superior ao original no foco/Escape verificado.
- Veredito final: a auditoria e o mapeamento foram concluídos, mas a área de Contatos do migrado está `reprovada` para paridade com o original. A equalização ainda precisa ser implementada e retestada; não há bloqueio externo para iniciar essa correção.
- Reabertura corretiva em 17/07/2026: o código original passou a ser tratado como especificação executável para as superfícies de criação, edição e campos personalizados. O lápis deixou de abrir o perfil extenso e voltou a abrir o modal compacto `Editar Contato`; o perfil avançado com memória/histórico foi preservado no clique do nome. O modal central de organização foi substituído pela gaveta lateral `Gerenciar Campos`, com chave automática, campos do sistema e campos personalizados separados. O modal `Novo Contato` voltou a incluir tags e campos personalizados; a confirmação de consentimento foi preservada por conformidade.
- Evidência corretiva de interface: `scripts/audit-contact-surfaces.mjs` foi atualizado e executado novamente contra os dois aplicativos, capturando 23 de 23 estados. As imagens `original-editar-contato.png`/`migrado-editar-contato.png` e `original-campos-personalizados.png`/`migrado-campos-personalizados.png` comprovam a restauração da arquitetura visual dessas superfícies. A gaveta fecha por Escape; o modal de edição mantém foco e fechamento do componente acessível compartilhado.
- Evidência corretiva automatizada: build de produção aprovado e sanitizado; 28 de 28 testes de Contatos/perfil aprovados. A captura comparativa foi aprovada duas vezes após as alterações, incluindo a restauração do novo contato.
- Estado após a correção parcial: CNT-02 passa a `corrigida — reteste pendente`, pois ainda falta executar criação/edição persistente pela interface em todas as variações. CNT-01, CNT-03 e CNT-04 permanecem `falhou`: lista, assistente de importação, exportação da seleção e composição das ações em massa ainda exigem equalização completa. Esta atualização não altera o veredito global reprovado da auditoria.

### AUD-2026-07-16-03 — Auditoria completa adversarial do aplicativo

- Estado: `em execução`.
- Abertura: 16/07/2026.
- Objetivo: executar o plano completo do aplicativo, corrigir defeitos durante a rodada, publicar e retestar sem confundir suíte automatizada com aprovação da interface.
- Código: `/Users/thaleslaray/Projetos/smartzap-cf`.
- Ambiente principal: produção Cloudflare em `https://smartzap-cf.thales2581.workers.dev`.
- Referência funcional/visual: `/Users/thaleslaray/Projetos/smartzap`.
- Escopo inicial: todas as jornadas ativas de `jornada.md`.
- Exclusões confirmadas: WFL-01, WFL-02 e COEX-01.
- Autorização operacional: usar somente o contato de teste já salvo; mensagens reais limitadas a templates de utilidade e ao mínimo necessário.
- Estado inicial: inventário de rotas, APIs, testes e scripts em andamento; o worktree já contém uma migração ampla não consolidada e deve ser preservado.
- Descobertas do inventário: adicionadas CNT-04, TMP-04, CMP-06, AI-04, SET-04, CAL-01, ERR-01 e OPS-01 ao catálogo canônico.
- Baseline de tipos: `npx tsc --noEmit` aprovado.
- Baseline de build: produção compilada e sanitização confirmou ausência de `.dev.vars` no artefato final; permanece aviso não bloqueante de bundle cliente acima de 500 kB.
- Baseline unitário/integração: 45 arquivos e 357 testes Vitest aprovados. O carregamento opcional de canvas em Workers emitiu avisos conhecidos, sem falhar a suíte.
- Baseline E2E inicial: 13 de 14 cenários passaram; CMP-02 falhou porque o teste ainda procurava o botão `Gerar preview` e o JSON técnico removidos da nova experiência.
- Correção do gate E2E: o cenário agora usa o botão `{}` para selecionar nome/telefone, confirma o mapeamento, aguarda o preview visual automático e garante que botão/JSON antigos não existam.
- Reteste focal E2E: 1 de 1 aprovado.
- Regressão E2E completa após a correção: 14 de 14 aprovada.
- Produção CMP-02: o seletor `{}` abriu nome, telefone, e-mail e campo personalizado; nome, e-mail, campo personalizado, valor fixo e fallbacks foram mapeados. O preview automático resolveu o contato autorizado e exibiu os quatro valores sem JSON técnico. O precheck confirmou 1 válido e 0 ignorados.
- Produção CMP-04: modos imediato/agendado, habilitação de data/horário e salvamento de rascunho foram executados sem envio.
- Defeito CMP-04: após salvar, o detalhe mostrava 0 destinatários e custo indisponível, embora o precheck tivesse persistido uma audiência de 1 contato. Causa: o detalhe calculava total/preço somente sobre `campaign_contacts`, materializado apenas no dispatch, e ignorava `audience_definition_json` do rascunho.
- Correção CMP-04: para rascunhos/agendados ainda não materializados, o detalhe resolve a audiência persistida e usa seus telefones no total e no pricing. Registros legados inválidos continuam fail-safe, sem inventar preço.
- Regressão adicionada: detalhe de rascunho após precheck deve preservar total 1 e custo estimado.
- Validação da correção CMP-04: 36 testes focais, 358 testes completos, TypeScript e 14 E2E aprovados.
- Deploy da correção CMP-04: Worker `bd4e9634-b320-4ab3-a53b-3479d6852297`.
- Reteste publicado CMP-04: o mesmo rascunho `c86fc8bc-85f3-4696-a70f-49b64435f077` voltou a mostrar 1 destinatário, R$ 0,03, tabela de 01/07/2026 e valor Meta de US$ 0,0068. O registro remoto preservou `audience_definition_json` e o mapeamento das quatro variáveis. Nenhuma mensagem foi enviada nessa validação.
- Matriz responsiva publicada: 14 rotas passaram sem overflow ou Error Boundary em 390×844, 768×1024, 1440×900 e 1920×1080. O navegador embutido aplicou mínimo efetivo de 390 px quando solicitado 360 px.
- Matriz responsiva local exata: 20 rotas passaram em 360×800 e 390×844; o wizard também permanece coberto em 320×700.
- Cross-browser crítico inicial: Chromium e Firefox aprovaram CMP-02 e a matriz de rotas; WebKit falhou no login local HTTP.
- Defeito AUTH-01/WebKit: o cookie de sessão era sempre `Secure`. WebKit corretamente o descartava em `http://localhost`, causando retorno permanente ao login no E2E.
- Correção AUTH-01: `Secure` agora acompanha o protocolo real da requisição. HTTPS de produção continua protegido; somente desenvolvimento/teste HTTP recebe cookie sem `Secure`. Adicionada regressão que prova `Secure` em HTTPS e sua ausência em HTTP, mantendo `HttpOnly` e `SameSite=Lax`.
- Cross-browser completo inicial: 38 de 42 cenários passaram. As falhas restantes separaram três causas: campanha fixa compartilhada entre projetos, comparação incorreta com `innerWidth` no WebKit e foco não restaurado após fechar a confirmação da Inbox.
- Isolamento E2E: cada navegador passou a receber sua própria campanha de cancelamento no seed, impedindo que Chromium altere o estado que Firefox/WebKit precisam testar.
- Medição responsiva: o gate agora compara `scrollWidth` com a área útil `clientWidth`; WebKit reserva 8 px para a barra vertical, o que não é overflow.
- Defeito INB-02/A11Y-01: Safari/WebKit não foca botões automaticamente no clique, então o Modal capturava o `body` e não devolvia foco ao gatilho “Enviar mensagem”. O Modal agora aceita `returnFocusRef`; a Inbox fornece explicitamente o botão de envio.
- Defeito A11Y-01 adicional: o mesmo comportamento afetava o modal “Importar CSV” em Contatos no WebKit. O gatilho agora também é fornecido explicitamente ao Modal.
- Reteste focal cross-browser: 8 de 9 cenários aprovados na primeira rodada; a única falha remanescente foi o foco do modal de importação. Após a correção, o cenário WebKit isolado passou.
- Regressão E2E final desta etapa: 42 de 42 cenários aprovados — os 14 cenários completos passaram em Chromium, Firefox e WebKit.
- Regressão unitária/integração final desta etapa: 45 arquivos e 359 testes Vitest aprovados. TypeScript e `git diff --check` também aprovados.
- Build final desta etapa: aprovado e sanitizado; nenhum `.dev.vars` permaneceu no artefato. Continua o aviso não bloqueante de bundle cliente acima de 500 kB.
- Deploy da etapa cross-browser/acessibilidade: Worker `b64c31eb-af9b-4bb9-9925-4321e731e112` em `https://smartzap-cf.thales2581.workers.dev`.
- Smoke publicado: raiz HTTP 200, `/api/health` com `{"ok":true}`, HSTS/CSP/COOP/CORP/Permissions-Policy/Referrer-Policy/X-Content-Type-Options/X-Frame-Options presentes. Pela interface publicada, o modal “Importar CSV” foi aberto e fechado e o snapshot confirmou o botão gatilho como ativo após o fechamento.
- Revalidação oficial Meta em 16/07/2026: changelog atualizado em 15/07/2026, pricing atualizado em 01/07/2026, throughput atualizado em 17/06/2026 e referências vivas de webhooks/BSUID foram salvas em `.meta-whatsapp-cache`.
- Achado WEB-03: o endpoint limitava o corpo a 1 MB, abaixo dos 3 MB documentados, e não reconhecia `phone_number_quality_update`. Corrigido para 3 MiB, até 1000 eventos por envelope, catálogo administrativo ampliado e persistência da observação de upgrade para 1000 mps; 47 testes focais aprovados.
- Achado PRC-01/PRC-02: utility dentro da janela de atendimento era sempre tratada como gratuita. A gratuidade agora termina em 01/10/2026; mensagens SERVICE seguem a mesma data e a janela FEP de 72 horas continua gratuita. Regressões antes/depois da data foram adicionadas.
- Achado META-01: a implementação exige `from`/`recipient_id` com telefone, mas a Meta tornou BSUID obrigatório e pode omitir ambos quando o usuário adota username. A correção foi iniciada; coexistência permanece fora do escopo.
- Dados temporários: a campanha `AUD CMP variaveis 2026-07-16` foi cancelada sem envio e removida; consulta remota confirmou zero registros restantes para o ID.
- META-01 concluído no contrato local: migração `0043_bsuid_identity.sql` aplicada local e remotamente; webhook, contatos, Inbox e clientes de envio agora preservam `user_id`, `parent_user_id` e `username`, resolvem destinatário por telefone ou BSUID e aceitam status sem `recipient_id`. O reteste real sem telefone permanece dependente de um usuário Meta com username/BSUID nessa conta.
- Diagnóstico Meta publicado: assinatura dos campos obrigatórios foi reparada pela própria interface; foram confirmados conexão `CONNECTED`, qualidade `GREEN`, tier `TIER_100K`, throughput `STANDARD` de 80 mps e 52 templates sincronizados.
- SEC-01 negativo em produção: API protegida sem sessão retornou 401, assinatura de webhook inválida retornou 401 e corpo acima de 3 MiB retornou 413. `/api/health` retornou 200 com HSTS, CSP, COOP, CORP, Permissions-Policy, Referrer-Policy, nosniff e frame denial.
- Defeito CNT-04: mudança de opt-in/opt-out em massa não escrevia histórico. Causa: os caminhos bulk atualizavam contato/consentimento sem `contact_history_events`. Correção atômica adicionada, com ator `admin`, além de ação visível para apagar memória.
- Reteste CNT-04 em produção: opt-in em massa gerou “Status atualizado em lote”; memória foi criada, versionada e removida pela interface. O contato temporário foi excluído e a lista voltou ao contato autorizado.
- Defeitos TMP-04: ação “Clonar” ausente no layout móvel, contador de rascunhos calculado pela fonte errada e colisão com nomes já sincronizados na Meta. Correções publicadas e retestadas; o clone preservou categoria, idioma, componentes e escolheu o próximo nome livre. O rascunho temporário foi removido.
- Defeito CMP-06: tags podiam ser criadas/filtradas, mas não atribuídas pela lista; no celular também faltava atribuição de pasta. Ações de pasta e tags foram implementadas em desktop e mobile, com estado acessível e regressão cross-browser.
- Reteste CMP-06 em produção: pasta, tag, filtro por tag, clone e relatório CSV foram exercitados pela interface. Campanha, pasta e tag temporárias foram removidas; consulta remota combinada confirmou zero remanescentes.
- Envio real CMP-04: campanha `5470364b-f29a-43d1-a6d5-81d79ee10873`, template UTILITY `aviso_consulta_profissional`, público de teste com um único destinatário autorizado mascarado como `+5521***66`. Precheck: 1 válido, 0 ignorados; lote: 1 aceito, 1 entregue, 0 falhas, uma tentativa. O callback foi aplicado uma vez e registrou `PMP`, `free_customer_service`, categoria utility e `pricing_billable=0`.
- AI-04 real: IA assistiva foi ativada somente durante o teste, o modelo `@cf/meta/llama-3.2-3b-instruct` gerou rascunho fundamentado na base, permaneceu aguardando revisão, foi descartado sem envio e a IA voltou ao estado desativado. Testes cobriram injeção, isolamento, ausência de fonte, timeout e falha segura.
- Defeitos A11Y-01: contraste insuficiente de textos/botões, upload sem nome acessível, alvo pequeno do botão de exibir token e texto nativo preto em selects do WebKit. Foram corrigidos contraste, labels, alvo de 44 px e `-webkit-text-fill-color`; o modal de template também entrou no gate.
- Gate A11Y-01: sete rotas críticas e o modal de template passaram WCAG A/AA automatizado em Chromium, Firefox e WebKit. O WebKit mantém uma leitura incorreta de `color` em selects nativos; a suíte valida adicionalmente `webkitTextFillColor` antes de desconsiderar somente esse falso positivo de contraste.
- ERR-01/OPS-01: 81 testes focais aprovaram autenticação, erros, cleanup, reconciliação, status, Durable Objects, health, webhook e IA. O deploy confirmou cron a cada 15 minutos, produtores/consumidores das filas `meta-webhooks` e `inbox-automation`, Durable Objects, Workflow e D1.
- Evidência operacional real: o lote `627c889a-7ab4-4455-a6ef-0a50ac8ad332` terminou `completed` em uma tentativa; traces `batch_claimed` e `batch_completed` foram persistidos; o evento `delivered` ficou `applied` em uma tentativa.
- Defeito INB-02: a Inbox não possuía envio de template, portanto não conseguia retomar conversa fora da janela de 24 horas. Foi criado seletor de templates aprovados, busca, preview visual, fontes de variável (fixo/nome/telefone/e-mail), confirmação explícita, reserva idempotente, envio por telefone/BSUID e materialização do status na conversa.
- Reteste INB-02 em produção: o template UTILITY `aviso_consulta_profissional` foi selecionado e pré-visualizado com quatro variáveis pela interface, enviado somente ao contato autorizado `+5521***66` e confirmado `delivered`. Registro técnico: send `73b0e199-9996-42fe-a818-a2d9e6abde05`, prefixo de mensagem `wamid.HBgNNTUyMTk4`, aceito às 20:43:49 UTC e entregue às 20:43:51 UTC.
- Limitação inicial INB-02: upload, confirmação e envio de mídia possuíam 12 testes de contrato e interface local, mas o reteste real publicado havia sido interrompido porque a extensão do Chrome não tinha permissão para acessar URLs de arquivo.
- Segurança de artefato: a varredura encontrou um token de teste gravado em `DS/templates/settings/Settings.dc.html`; ele foi substituído por máscara. Nova varredura dos arquivos do repositório encontrou zero ocorrências dos tokens/chaves fornecidos, `git diff --check` passou e a sanitização removeu `.dev.vars` do bundle.
- Regressão final após as correções: TypeScript aprovado; 45 arquivos e 370 testes Vitest aprovados; 54 de 54 cenários E2E aprovados nos três motores; build e `git diff --check` aprovados.
- Deploy consolidado: Worker `f68cab13-a376-4d23-b145-e9f77599f563` em `https://smartzap-cf.thales2581.workers.dev`.
- Smoke consolidado publicado: health HTTP 200, lista de campanhas acessível, organização por pasta/tag disponível, Inbox exibindo o seletor de template e o template real entregue na conversa com callback aplicado.
- Limpezas desta etapa: contato, campanha sem envio, clone de template, campanha organizacional, pasta e tag temporários foram removidos e conferidos no D1. A campanha real e os dois envios reais foram preservados como evidência da auditoria.
- Reteste INB-02/mídia em produção após a permissão: a interface abriu o menu de ações, anexou `appIcon.png` (imagem técnica sem dados pessoais), exibiu confirmação explícita e enviou somente ao contato autorizado `+5521***66`. A imagem apareceu na conversa primeiro como `sent` e depois como `delivered`. Registro técnico: send `ba3a2a5d-d97f-495a-8d88-6af0682a57f6`, prefixo de mensagem `wamid.HBgNNTUyMTk4`, aceito às 21:00:01 UTC, enviado às 21:00:03 UTC e entregue às 21:00:04 UTC. O upload e o callback real da Meta foram confirmados.
- Defeito INB-02 corrigido durante o reteste: o endpoint de envio exigia IA ativa até para rascunhos humanos, bloqueando respostas manuais e anexos depois de desativar a IA. A seleção de candidato agora preserva o modelo do rascunho e exige IA ativa apenas quando o rascunho não é `human`. Regressão adicionada para resposta humana com IA desativada; 13 testes focais, 371 Vitest e 54 E2E nos três navegadores aprovados.
- Deploy da correção de envio humano/mídia: Worker `202cfec9-4727-42d5-b3a2-6a5164d69233` em `https://smartzap-cf.thales2581.workers.dev`.
- Bloqueios externos restantes: MINI-07/CAL-01 exigem credenciais e consentimento OAuth Google reais; META-01 real sem telefone exige um evento efetivo de usuário Meta com username/BSUID.
- Defeito INB-02 corrigido: mesmo com os guardrails de piloto desativados, o limite histórico de três envios reais por dia ainda era aplicado ao envio humano. `pilotLimit` agora é ilimitado no modo normal e mantém o limite somente quando `PILOT_GUARDS_ENABLED=true`; 21 testes focais, TypeScript, build e 372 testes Vitest aprovaram. Deploy: Worker `f417e535-9bca-42bb-b1d5-8a6dfbcd3bf2`.
- Reteste INB-02 pelo navegador interno do Codex: mensagem humana `Teste pelo navegador interno do Codex.` enviada pela interface ao contato autorizado `+5521***66`; a conversa registrou `accepted` e, após atualização de status, `delivered`. Nenhum reenvio foi feito.
- Veredito atual: não determinado; auditoria em execução.

### AUD-2026-07-16-02 — Regressão das variáveis de campanha

- Estado: `em execução`.
- Ambiente: produção Cloudflare.
- URL: `https://smartzap-cf.thales2581.workers.dev`.
- Versão publicada: `6c0027b5-396f-433c-bfe3-7a2e4b869669`.
- Jornadas: CMP-02 e, por regressão, CMP-03/CMP-04.
- Mudança: o botão `{}` deixou de ser decorativo e voltou a selecionar nome, telefone, e-mail e campos personalizados; o mapeamento é consumido pelo envio real.
- Evidência automatizada: TypeScript aprovado; 45 arquivos e 357 testes Vitest aprovados.
- Evidência focal: 2 arquivos e 39 testes de renderização/campanhas aprovados.
- Evidência de build/deploy: build aprovado e versão acima publicada.
- Pendente: executar pela interface publicada todas as fontes, fallback, contato sem valor, preview visual e conferir o payload usado no disparo. A suíte automatizada não encerra essa jornada.
- Veredito atual: correção implantada; auditoria visual e funcional de produção pendente.

### AUD-2026-07-15-01 — Auditoria ampla de jornadas

- Estado: `aprovada com ressalvas`.
- Período: 15/07/2026 a 16/07/2026.
- Fonte histórica detalhada: `docs/auditoria-jornadas.md`.
- Escopo: autenticação, dashboard, contatos, segmentos, templates, projetos, campanhas, Inbox, atendimento, IA, conhecimento, MiniApps/Flows, Forms, submissões, configurações, performance, webhooks, pricing e responsividade.
- Exclusões: Workflows e coexistência.
- Ressalvas importadas: CMP-02 e CMP-03 exigem reteste publicado após mudanças; Google Calendar real depende de OAuth; segurança e acessibilidade precisam de consolidação própria.
- Observação: as evidências linha a linha permanecem preservadas no documento histórico e devem ser consultadas quando uma nova auditoria reutilizar uma aprovação anterior.

## Pendências globais

| Jornada | Pendência | Estado |
| --- | --- | --- |
| MINI-07 | OAuth Google Calendar real | bloqueada externamente |
| RSP-01 | Matriz de viewports e navegadores concluída em produção e nos três motores locais | encerrada nesta rodada |
| META-01 | Evento real somente por BSUID/username, sem telefone/recipient_id | aguardando evento externo compatível |

### AUD-2026-07-17-03 — Paridade de Contatos

- Estado: `em execução`.
- Ambiente: local (`http://127.0.0.1:5174`) comparado ao original (`http://127.0.0.1:3100`).
- Escopo ativo: CNT-01, CNT-03 e CNT-04.
- Correção CNT-03: o formulário técnico de texto foi substituído por jornada de três etapas: upload por clique/arrastar, limite de 5 MB, autodetecção de cabeçalhos, mapeamento, criação de campo durante o mapeamento, prévia server-side, declaração de opt-in e resultado final.
- Correção CNT-04: exportação usa exclusivamente os IDs selecionados; exclusão em massa possui confirmação e o endpoint remove exclusivamente a seleção validada.
- Evidência atual: build e TypeScript aprovados; 25 testes de API de Contatos aprovados; E2E de importação pela interface e E2E de seleção/tags/campo/exclusão cancelada-confirmada aprovados, com limpeza dos artefatos temporários.
- Comparação visual: a matriz de sete viewports foi executada. Delta atual de lista: desktop 3,42%–3,88%, tablet 4,78% e mobile 4,70%–5,98%.
- Pendência: corrigir o delta visual antes de aprovar CNT-01; recapturar lista, modais e etapas da importação; executar regressão completa e publicar.

#### Atualização — execução local da rodada de paridade

- Lista: composição de tabela e cartões móveis alinhada ao contrato do código original, incluindo cabeçalhos, filtros nativos, tags, números de telefone, ações, hover e paginação.
- Campos: o painel lateral passou a usar a largura efetiva do original em desktop; a operação e o conteúdo dinâmico continuam preservados.
- Importação: a primeira etapa voltou à composição original (zona de upload, dica de formatação e rodapé); o mapeamento foi reorganizado para a hierarquia vertical do original, preservando criação de campos, prévia server-side e consentimento obrigatório.
- Evidência visual local: `scripts/audit-contact-surfaces.mjs` capturou 25 superfícies: lista, sem resultado, seleção, exclusão, criação, edição, campos, operações em lote, perfil e as três etapas da importação.
- Evidência funcional local: E2E de Contatos/CSV/seleção passou com limpeza; matriz Playwright completa informou 54 de 54 cenários aprovados nos três motores; 45 arquivos e 374 testes Vitest aprovados.
- Gates locais: TypeScript, build e `git diff --check` aprovados. O build foi sanitizado; o aviso de tamanho de bundle permanece não bloqueante.
- Estado: aguardando publicação e reteste de interface publicada. CNT-01 permanece em teste porque o diff bruto dos sete viewports ainda é contaminado por dados renderizados no servidor pelo legado; as capturas pareadas de superfície passam a ser a evidência visual primária desta rodada.

#### Atualização — publicação e reteste

- Versão publicada: Worker `414a3248-674f-4c4f-9f28-d61d5c54687c` em `https://smartzap-cf.thales2581.workers.dev`.
- Smoke publicado: `/api/health` respondeu HTTP 200 com estado saudável.
- Interface publicada: a rota `/contacts` carregou com 1 contato, sem overflow horizontal; busca, filtros, ações de cabeçalho e a lista ficaram acessíveis.
- Importação publicada: o modal abriu pela interface real e confirmou diálogo, zona de upload e a cópia restaurada do contrato visual do original.
- Reteste remoto automatizado: os fluxos isolados de importação e seleção/exclusão temporária foram disparados contra a URL publicada; nenhum envio Meta foi realizado nesta rodada.
- Estado: publicação validada; permanece a pendência técnica de uma métrica pixel-diff totalmente determinística contra o legado SSR antes de declarar CNT-01 aprovada.

#### Atualização — gate estrutural de paridade

- Ambiente: local, legado em `http://127.0.0.1:3100` e migrado em `http://127.0.0.1:5174`.
- Correções executadas: Contatos agora usa largura máxima de 1440 px somente nessa rota, removeu o deslocamento vertical de 1 px, mantém cartões até o breakpoint `lg`, removeu o recuo interno indevido dos cartões móveis e reproduz as medidas nativas dos filtros de status e tags.
- Higiene de teste: foram removidos 52 contatos, 7 tags e 3 campos temporários identificados por prefixos E2E no banco local; os contatos de auditoria existentes foram preservados.
- Evidência: TypeScript aprovado e `visual:contacts:contract` executado nos sete viewports. Título, busca e filtro de status passaram em todas as larguras; filtros/tag em desktop e o alinhamento horizontal do conteúdo em 1920 px também passaram.
- Pendência deliberada: cartões, tabela e painéis ainda variam em altura porque o legado e o migrado renderizam conjuntos de dados diferentes. O comparador não será usado para declarar paridade desses elementos até receber fixtures equivalentes; a diferença está registrada como pendente, não mascarada como aprovação.

#### Atualização — fixture equivalente e modais estreitos

- Fixture local: foi criado somente no ambiente migrado o contato temporário `Bruno Lima` com o mesmo telefone e tag usados na primeira linha do legado, para que tabela e cartão fossem comparados sem variação de paginação ou conteúdo. O artefato será removido ao encerrar a auditoria.
- Resultado estrutural: tabela, cabeçalho, linha e cartão móvel passaram nas geometrias comparadas após filtrar a mesma fixture em ambos os sistemas; a largura de 1440 px, ações, busca e filtros também permanecem alinhados.
- Correções em andamento: a zona de upload agora respeita a altura móvel do legado e os painéis de edição deixam de ser presos ao topo em telas estreitas. Ainda falta consolidar a equivalência de cor renderizada e a altura do editor na largura de 360 px antes de qualquer aprovação.
- Evidência: TypeScript e a matriz de sete viewports foram executados localmente após as correções. Estado: `em execução`.

#### Atualização — regressão, acessibilidade e publicação

- Matriz funcional local: seleção global e parcial, exportação restrita a IDs selecionados, cancelamento e confirmação de exclusão, alteração em lote de tags/campo e isolamento do contato não selecionado foram executados pela interface real. O teste removeu os próprios artefatos temporários.
- Importação local: CSV com novo, duplicado e inválido percorreu upload, mapeamento, criação de campo durante o mapeamento, prévia, declaração de opt-in, persistência de e-mail/tags/campo e exportação; os artefatos temporários foram removidos.
- Regressão local: 374 testes Vitest aprovados; 54 E2E aprovados em Chromium, Firefox e WebKit; teste focal WCAG A/AA aprovado nos três motores; build, TypeScript e `git diff --check` aprovados.
- Correção de acessibilidade: o botão primário preserva o verde mais escuro do migrado. A reprodução literal do verde do legado (`#009966` com texto branco) foi testada e reprovada por contraste de 3,65:1; não foi publicada por violar WCAG AA.
- Publicação: Worker `2e90bd7e-ef8d-411e-9935-5009bf752015` em `https://smartzap-cf.thales2581.workers.dev`.
- Smoke publicado: health HTTP 200; seleção, exportação, cancelamento, exclusão e importação completa foram repetidos pela interface publicada, sem envios Meta. O teste limpou contato, tags, campo e preenchimentos temporários.
- Estado: CNT-02, CNT-03 e CNT-04 com regressão e produção validadas. CNT-01 permanece `em teste` somente até que o comparador visual passe a classificar explicitamente a divergência acessível de cor do legado como exceção documentada, sem escondê-la no percentual bruto.

#### Atualização — estados da lista

- Cobertura adicionada: loading com atraso controlado, vazio, erro HTTP controlado e retentativa da lista de Contatos foram exercitados pela interface, sem depender da base publicada.
- Evidência: 57 E2E passaram em Chromium, Firefox e WebKit; o cenário novo passou nos três motores. A execução usa o D1 E2E isolado.
- Nota do comparador: a tentativa de forçar uma fixture de quatro contatos foi revertida. O legado conserva uma contagem própria incompatível com sua lista interceptada, portanto esse ajuste aumentava o delta e não constitui referência visual válida.

#### Atualização — cor primária com acessibilidade

- Ajuste: a ação `Novo Contato` agora usa o verde do legado (`#009966`) com texto escuro, preservando contraste WCAG AA. A alternativa com texto branco foi descartada por contraste insuficiente.
- Evidência: o teste WCAG A/AA passou em Chromium, Firefox e WebKit; a comparação bruta caiu para 1,54%–2,28% nos desktops e 0,87%–1,06% nos celulares. O delta restante concentra-se no shell compartilhado e na rasterização independente de texto/ícones, não na geometria de Contatos.

#### Atualização — integridade do comparador visual

- Correção do verificador: foi removida a regra de captura que ocultava a primeira linha somente no migrado para compensar uma inconsistência do legado. A regra produzia uma comparação artificial e não será usada como evidência de paridade.
- Estado da referência: a instância antiga em `127.0.0.1:3100` permanece ativa, mas a sessão não é reproduzível com as credenciais locais atuais. A tentativa de autenticação devolveu `Senha incorreta`; por isso nenhuma captura nova foi classificada como comparação original × migrado nesta atualização.
- Próxima evidência necessária: uma sessão autenticada ou credencial local válida para a instância legada, ou uma cópia isolada do legado configurada com uma senha conhecida. Até isso ocorrer, a paridade visual fica `em execução`, sem mascarar o bloqueio com percentuais.

#### Atualização — referência reproduzível e matriz sem mascaramento

- Referência: foi preparada uma cópia temporária e isolada do código original, com autenticação e dados estáticos exclusivos da auditoria. A cópia não altera o repositório original, D1, credenciais ou produção.
- Estabilização: o shell do legado possui um retorno precoce quando o health check falha, que gera erro de hooks e impede a captura. O navegador do comparador recebeu somente respostas de infraestrutura saudável para os endpoints auxiliares; a rota, componentes e DOM de Contatos do legado não foram modificados nem ocultados.
- Evidência: `scripts/visual-diff-contacts.mjs` executou os sete viewports com o mesmo conjunto de cinco contatos em ambos os lados. Deltas da lista: 1280×720 1,809%; 1440×900 2,278%; 1920×1080 1,602%; 768×1024 2,189%; 390×844 1,073%; 360×800 1,239%; 320×568 1,315%. Imagens e resumo em `test-results/visual-contacts/`.
- Defeito encontrado: o delta ainda não é aceitável como pixel perfect. A matriz confirma diferenças residuais no shell e na rasterização/composição do cabeçalho, cartões, tabela e filtros; nenhuma delas foi suprimida por CSS de teste.
- Estado: CNT-01 continua `em teste`. Próxima ação: isolar cada estado visual (lista, filtros, seleção, criação, edição, exclusão, campos e três etapas de importação), corrigir cada diferença e recapturar antes da regressão e publicação.

#### Atualização — regressão isolada e contrato de componentes

- Regressão: a suíte completa foi executada em servidor E2E separado na porta 5176 para não usar a sessão local em 5174. Resultado: 57 cenários aprovados em Chromium, Firefox e WebKit; o arquivo de resultado do Playwright registrou `passed`, sem testes falhos.
- Gates: `npx tsc --noEmit`, build e sanitização do artefato passaram. Os avisos de bindings de IA remota e de tamanho de bundle não alteraram o resultado dos testes; nenhum envio Meta foi disparado.
- Contrato visual: `visual:contacts:contract` passou a usar a referência isolada e fixture controlada. Ele confirmou que importação mantém geometria de modal/zona de upload e que os cartões móveis preservam a estrutura; ainda reprovou diferenças de cor acessível, composição do shell do legado e alturas dependentes do conjunto renderizado. Não há aprovação visual baseada nesse resultado.
- Estado: CNT-01 permanece `em teste`; CNT-02, CNT-03 e CNT-04 continuam com regressão funcional aprovada, mas a confirmação de paridade visual integral dos estados ainda está pendente.

#### Atualização — reexecução funcional e diagnóstico visual atual

- Importação: a criação de campo durante o mapeamento foi reexecutada pela interface. O campo é persistido e passa a existir como um seletor de mapeamento; a automação foi corrigida para validar esse controle utilizável, em vez de procurar um texto isolado que não existe no DOM. CSV com contato novo, duplicado e telefone inválido concluiu as três etapas, persistiu e-mail normalizado, tags e campo personalizado, exportou o registro e removeu os próprios artefatos temporários.
- Regressão após a correção: 374 testes Vitest aprovaram; TypeScript e build sanitizado aprovaram; 57 cenários Playwright aprovaram em Chromium, Firefox e WebKit no ambiente E2E isolado.
- Comparação sem mascaramento: a lista equivalente foi recapturada nos sete viewports. Diferença de pixels: 1280×720 1,809%; 1440×900 2,278%; 1920×1080 1,602%; 768×1024 2,189%; 390×844 1,073%; 360×800 1,239%; 320×568 1,315%.
- Deltas ainda abertos: offsets do shell compartilhado em desktop, altura da tabela/linha, deslocamento do cartão em 320 px e equivalência visual de cor em botões, painel de campos e importação. A ação primária continua com texto escuro por contraste AA; o branco do legado é uma exceção conhecida e não será disfarçado como equivalência.
- Estado: a execução continua aberta. CNT-03 permanece `em teste` até a recaptura visual de todas as três etapas da importação; CNT-01 permanece `em teste` até que a matriz de estados deixe de apresentar os deltas listados.

#### Atualização — recaptura das superfícies e correção de importação

- Referência: a cópia isolada do original passou a responder a importação somente em modo de auditoria, sem tocar no repositório, banco ou integrações originais. Isso permitiu capturar as três etapas completas em vez de parar na prévia.
- Superfícies capturadas: 23 estados por interface real em `test-results/contact-surfaces/`: lista, seleção, exclusão, novo, edição, campos, etapas 1/2/3 da importação, operações em massa e perfil avançado.
- Correções visuais: o modal de criação voltou à largura de 448 px e aos inputs zinc do contrato; importação voltou ao estado vazio de campos, removeu a tag global que não existe na referência, restaurou cinco métricas na prévia e a tela final recuperou cabeçalho, confirmação, quatro cartões e botão `Fechar` do original.
- Correção funcional: a resposta de importação passou a informar `updated: 0` de forma explícita quando não há atualização. Os contratos de API foram atualizados e continuam verificando importados, duplicados e inválidos.
- Higiene: foram removidos seis campos temporários de importações interrompidas e um contato temporário identificado; o limpador agora remove esses artefatos por prefixos restritos, inclusive quando o E2E falha antes de registrar o ID.
- Reteste: TypeScript, 374 testes Vitest, 57 E2E em Chromium/Firefox/WebKit, build sanitizado e `git diff --check` aprovaram. A importação local completa foi reexecutada com limpeza.
- Matriz atual de lista: 1280×720 1,810%; 1440×900 2,282%; 1920×1080 1,601%; 768×1024 2,192%; 390×844 1,073%; 360×800 1,239%; 320×568 1,315%.
- Estado: CNT-03 possui evidência funcional completa e recaptura visual das três etapas, mas permanece `em teste` junto de CNT-01 enquanto a paridade de lista não atingir o critério visual integral. Publicação continua bloqueada por esse gate local.

#### Atualização — fechamento local da paridade de Contatos (17/07/2026)

- Escopo: CNT-01 a CNT-04, local `http://127.0.0.1:5174`; referência temporária e isolada do SmartZap original em `http://127.0.0.1:3101`, sem uso de banco, credenciais ou integrações do original.
- Correções: Shell desktop inicia compacto conforme o original; conteúdo de Contatos usa a largura do contrato; cartões mobile tiveram o recuo interno removido; linhas desktop usam a altura original; modais passaram a usar tokens visuais do design-system original; importação preserva as três etapas e o campo criado durante mapeamento.
- Comparação: `visual:contacts:contract` passou em 320×568, 360×800, 390×844, 768×1024, 1280×720, 1440×900 e 1920×1080, com fixture idêntica. Foram também recapturadas 23 superfícies reais, incluindo seleção, exclusão, criação, edição, campos, lote e importação nas etapas 1, 2 e 3.
- Exceções explícitas da referência: o botão de importação e o de edição do legado não abrem seus modais abaixo de 1024 px; o migrado os mantém funcionais e eles foram cobertos por E2E mobile. O legado usa texto branco sobre verde com contraste de 3,65:1; o migrado mantém a geometria e o verde, usando texto escuro para WCAG AA.
- Jornadas funcionais: seleção parcial/global, exportação limitada aos IDs selecionados, cancelamento e confirmação de exclusão, tags/campo em lote e isolamento de contato não selecionado passaram no navegador; CSV com novo, duplicado, inválido, tags, campo criado durante o mapeamento e exportação persistiu e foi limpo ao fim.
- Regressão: 57 E2E aprovados em Chromium, Firefox e WebKit; 374 testes Vitest aprovados; TypeScript, build sanitizado e `git diff --check` aprovados. O limpador não encontrou artefatos remanescentes.
- Estado local: CNT-01, CNT-03 e CNT-04 aprovadas. Próximo gate: publicar e repetir smoke de Contatos no Worker público antes do fechamento final.

### AUD-2026-07-17-10 — Campanha de teste com destinatário configurado

- Estado inicial: `falhou` na interface local. O modo `Teste` mostrava um campo de busca e uma seleção de prévia vazia porque o número salvo em Configurações era apenas uma preferência, não um contato elegível.
- Escopo: CMP-03, local `http://127.0.0.1:5174/campaigns/new`.
- Correção: ao salvar ou usar um contato de teste, o backend cria/promove exclusivamente esse destinatário a `opt_in` e registra a declaração operacional. O modo `Teste` o seleciona automaticamente e usa o mesmo contato para a prévia; a seleção manual redundante foi removida desse estado.
- Evidência: teste de API focal `tests/templates.test.ts` aprovado (22 testes); TypeScript, build e `git diff --check` aprovados. Pela interface real, foi criado um rascunho com `agenda_paciente_confirmacao`, preenchidas quatro variáveis e selecionado `Teste`: 1 destinatário foi calculado, a prévia foi renderizada com os quatro valores resolvidos e o botão `Continuar` foi habilitado.
- Sem envio Meta: a execução parou antes do disparo.
- Estado final: CMP-03 `aprovada` para essa variação local; reteste publicado permanece pendente de uma publicação futura.

### AUD-2026-07-17-11 — Variáveis de campanha sem fonte duplicada

- Estado inicial: `falhou` visualmente. A migração exibia um seletor de fonte e o botão `{}` na mesma variável, dois meios concorrentes para a mesma ação.
- Escopo: CMP-02, local `http://127.0.0.1:5174/campaigns/new`.
- Referência: o código do SmartZap original usa somente um input por variável; o botão `{}` interno insere `{{nome}}`, `{{telefone}}`, `{{email}}` ou campos personalizados diretamente naquele input.
- Correção: removido o seletor “Valor fixo / Nome / Telefone / E-mail”. O input fica sempre visível e passa a refletir o token dinâmico escolhido pelo menu `{}`; ao editar texto, ele volta a ser valor fixo. O mapeamento interno e o fallback foram preservados para preview e disparo.
- Reteste: E2E focal de campanha aprovado em Chromium, Firefox e WebKit (3/3), cobrindo nome, telefone, fallback, preview com variáveis resolvidas e URL dinâmica. TypeScript, build sanitizado e `git diff --check` aprovados.
- Estado final: CMP-02 `aprovada` no ambiente local; sem envio Meta e sem publicação nesta rodada.

### AUD-2026-07-17-12 — Prévia única no wizard de campanha

- Estado inicial: `falhou` visualmente. No passo Público, a mesma mensagem era renderizada duas vezes: no painel fixo de prévia e em um cartão grande no conteúdo principal.
- Escopo: CMP-02 e CMP-03, local `http://127.0.0.1:5174/campaigns/new`.
- Referência: o código do SmartZap original renderiza uma única prévia no painel lateral; o contato de teste apenas alimenta os valores dessa prévia.
- Correção: removido o cartão central de prévia, a busca de contato e o seletor redundante. A prévia lateral continua recebendo o payload resolvido pelo mesmo fluxo usado no teste.
- Reteste: TypeScript, build sanitizado e `git diff --check` aprovaram. O cenário focal de campanha aprovou em Chromium, Firefox e WebKit (3/3) e passou a exigir a ausência do cartão central duplicado. A rota local respondeu e a interface real foi recarregada no navegador interno.
- Estado final: CMP-02 e CMP-03 permanecem aprovadas localmente; sem envio Meta e sem publicação nesta rodada.

### AUD-2026-07-17-13 — Wizard de campanha em shell colapsado

- Estado inicial: `falhou` visualmente. Com a largura disponível reduzida pelo shell colapsado, os rótulos das etapas invadiam cartões vizinhos e os campos iniciais ficavam sem rótulo visível.
- Escopo: RSP-01 e CMP-02, local `http://127.0.0.1:5174/campaigns/new`.
- Correção: etapas passam de uma para duas e quatro colunas apenas quando há espaço suficiente; o rótulo de cada etapa trunca sem sobrepor o próximo cartão. Os controles iniciais passaram a usar rótulos visíveis de nome e categoria, empilhando-se em largura estreita.
- Reteste: cenário E2E novo em 620 px aprovado em Chromium, Firefox e WebKit (3/3), com os quatro controles visíveis e sem overflow horizontal. TypeScript, build sanitizado e `git diff --check` aprovados.
- Estado final: RSP-01 `aprovada` localmente; sem envio Meta e sem publicação nesta rodada.

#### Ajuste de densidade visual

- A primeira tentativa usava espaçamento no elemento `label`, mas não aplicava margem efetiva ao texto solto. O rótulo passou a ser um bloco próprio com margem inferior real de 16 px antes de nome/categoria. A estrutura responsiva permanece a mesma.

#### Ajuste de títulos longos

- Os cartões de templates não limitavam palavras longas, permitindo que títulos ultrapassassem o cartão no shell estreito. Cada cartão agora restringe seu conteúdo e o título usa reticências em uma linha, mantendo o nome completo no atributo de dica.
- Reteste: a jornada de 620 px aprovou em Chromium, Firefox e WebKit (3/3), verificando cada título visível sem overflow interno e sem overflow da página. RSP-01 volta a `aprovada` localmente.

### AUD-2026-07-17-14 — Importação assistida de rate card oficial

- Estado inicial: `falhou`. Não existia rate card ativo para Brazil/UTILITY; o wizard corretamente não calculava custo, mas não havia uma ação simples para carregar a fonte oficial.
- Escopo: PRC-01, Configurações e API local de pricing.
- Correção: Configurações agora expõe “Tabela de preços Meta”, com URL direta de CSV, vigência, ação `Baixar e importar` e importação de arquivo CSV. A ação por URL é executada no Worker (sem CORS do navegador), aceita somente HTTPS, limita o conteúdo a 2 MB, valida o CSV por moeda/categoria/mercado e só ativa a tabela após validação. A última fonte HTTPS ativa é sugerida automaticamente nas atualizações seguintes; uploads locais não são reaproveitados como URL remota.
- Limite explícito: a página oficial de preços consultada em 17/07/2026 é HTML dinâmica, não um endpoint CSV estável. Por isso o produto não raspa nem inventa tarifas; requer a URL direta do CSV oficial ou o próprio arquivo baixado.
- Reteste: API focal `tests/pricing.test.ts` aprovada (10 testes), TypeScript, build sanitizado e `git diff --check` aprovados. O cenário E2E da interface de Configurações aprovou em Chromium, Firefox e WebKit (3/3); o servidor local em `127.0.0.1:5174` respondeu ao health check.
- Estado final: PRC-01 `corrigida — reteste pendente` até a execução Playwright da superfície e a primeira importação de uma fonte oficial válida.

#### Correção de ergonomia — descoberta automática da fonte oficial

- Defeito de UX encontrado: a primeira implementação expunha uma URL direta de CSV, embora a Meta publique esses links assinados dentro da própria página de Pricing. O usuário não deveria descobrir nem colar esse endereço.
- Correção: `Atualizar automaticamente` agora consulta a página oficial de Pricing, descobre o CSV BRL vigente, baixa-o imediatamente enquanto o link assinado é válido, lê a vigência do próprio arquivo e só ativa a importação após validar o conteúdo. A URL manual foi removida. Upload de CSV permanece apenas como contingência.
- Evidência de fonte: a página oficial consultada em 17/07/2026 expôs os CSVs de rates e tiers, incluindo BRL, com cabeçalho de vigência de 01/07/2026. Não foram usados preços inventados ou extraídos de fonte terceirizada.

### AUD-2026-07-17-15 — Métricas de infraestrutura sem valores fictícios

- Estado inicial: `falhou`. Configurações mostrava 0 Workers, 0 Queues, 0,01 MB de D1 e 1 WhatsApp como números fixos, sem consulta ao ambiente.
- Escopo: SET-05, local `/settings` e endpoint autenticado `/api/settings/infrastructure-usage`.
- Correção: o Worker consulta `Queue.metrics()` para backlog atual das duas filas e contabiliza apenas envios de campanha persistidos no mês. Workers e D1 usam a GraphQL Analytics oficial quando o secret opcional `CLOUDFLARE_ANALYTICS_TOKEN` estiver configurado; sem ele a interface declara indisponibilidade, sem substituir por zero. O tamanho do D1 também vem do dataset `d1StorageAdaptiveGroups`, pois D1 não autoriza `PRAGMA page_count` no runtime.
- Evidência: contrato focal de API e interface foi adicionado. A consulta GraphQL oficial foi validada contra a conta configurada, incluindo `workersInvocationsAdaptive`, `d1AnalyticsAdaptiveGroups` e `d1StorageAdaptiveGroups`, sem registrar token ou segredo.
- Reteste local: TypeScript, teste focal Vitest e navegador em Chromium, Firefox e WebKit aprovaram. A rota local autenticada devolveu backlog, bytes e envios reais; sem o secret, Workers e D1 retornaram `null`/indisponível como previsto. Reteste publicado permanece pendente de instalar o token de Analytics de menor privilégio e implantar.

#### Configuração de produção — token de Analytics

- Foi criado e verificado um token ativo exclusivo para `smartzap-infrastructure-analytics-read`, limitado à conta do SmartZap e à permissão `Account Analytics Read`.
- O valor foi instalado somente como secret `CLOUDFLARE_ANALYTICS_TOKEN` do Worker `smartzap-cf`; ele não foi escrito em arquivos, logs de auditoria ou interface.
- A versão de código que consulta esse secret ainda precisa ser publicada separadamente, após revisão do conjunto de alterações local.

#### Reteste local — injeção de Analytics

- Causa identificada: quando `secrets.required` está presente, o runtime local do Wrangler injeta somente segredos declarados nessa lista; o token de Analytics existente no `.dev.vars` era descartado.
- Correção: `CLOUDFLARE_ANALYTICS_TOKEN` passou a ser segredo obrigatório, com exemplo sem valor real no arquivo de configuração local. Reteste da rota em andamento.
- Evidência de reteste local: `GET /api/settings/infrastructure-usage` autenticado retornou `analytics.available: true`, 15.506 invocações do Worker, 2.461.696 bytes de D1, 737.358 linhas lidas e 44.119 escritas no período. A confirmação visual após recarga permanece pendente.

#### Ajuste de leitura de capacidade

- Correção: os quatro cartões passaram a exibir barra de uso com valor e limite, acessível por `role=progressbar`. Workers usa referência mensal de 100 mil, D1 usa os 5 GB configurados, WhatsApp calcula os envios efetivos nas últimas 24h contra o tier retornado pela Meta e Queues exibe ocupação contra o alerta operacional de backlog, sem fingir que é cota do provedor.
- Regressão: TypeScript, teste de contrato de infraestrutura e build de produção aprovados. A API local confirmou também o novo contador `sentLast24h`. Reteste visual local pendente de recarga da interface.

### AUD-2026-07-17-16 — Correção da atualização automática da tabela BRL

- Estado inicial: `falhou`. A ação visual “Atualizar automaticamente” retornava que a Meta não expôs CSV BRL compatível, embora a fonte oficial disponibilizasse a tarifa vigente.
- Escopo: PRC-01, API `POST /api/pricing/rate-cards/import-official` e Configurações local.
- Causa: a consulta não enviava identificador de navegador e recebia uma versão da documentação que não continha os links temporários dos CSVs. A rotina também passou a aceitar a calculadora oficial da WhatsApp Business como fallback se os links diretos forem removidos novamente.
- Correção: a busca oficial usa cabeçalhos adequados, valida URL HTTPS da fonte, mercado BR, moeda BRL e as categorias Marketing, Utility e Authentication antes de ativar qualquer tabela. O upload CSV continua somente como contingência.
- Evidência: reteste real local em 17/07/2026 importou a tabela oficial com vigência `2026-07-01`, 123 linhas validadas e checksum técnico registrado no banco, sem expor segredo ou URL temporária. Testes focais de pricing: 12 aprovados; TypeScript e build de produção aprovados.
- Estado final: PRC-01 `corrigida — reteste pendente` até a confirmação pela interface após recarregar o servidor local.

#### Ajuste de feedback da atualização

- A interface agora informa “Tabela atualizada agora” com quantidade e vigência quando uma nova importação é ativada, ou “Nenhuma atualização necessária” quando a tabela oficial vigente já está ativa.

### AUD-2026-07-17-17 — Hierarquia operacional no detalhe de campanha

- Estado inicial: `falhou` por densidade de informação. O cartão “Velocidade do disparo” ocupava uma seção de primeiro nível no detalhe de campanha, apesar de ser métrica de diagnóstico de lotes.
- Correção: throughput e duração passaram para o bloco expansível “Eventos operacionais” dentro de Lotes de envio. A página Performance continua sendo o painel agregado para comparação entre campanhas.
- Estado final: CMP-05 `corrigida — reteste pendente` de confirmação visual no detalhe local.

### AUD-2026-07-17-18 — Menu de pasta nas campanhas

- Estado inicial: `falhou`. A ação de mover campanha para pasta era um `select` nativo invisível sobre o ícone; ao abrir, o navegador mostrava um menu branco/azul incompatível com a interface.
- Escopo: CMP-06, listas desktop e compacta em `/campaigns`.
- Correção: o controle foi substituído por menu próprio do design system, com “Sem pasta”, pastas disponíveis, cor, item selecionado, fechamento ao escolher, fechamento por clique externo/Escape e sem dependência de UI nativa do navegador.
- Reteste técnico: TypeScript e checagem de diff aprovados. Reteste visual local pendente de abrir o menu na lista desktop e na lista compacta.
- Estado final: CMP-06 `corrigida — reteste pendente`.

#### Correção de confirmação de exclusão

- Defeito adicional: a lixeira ainda acionava `window.confirm`, expondo a caixa nativa do navegador e quebrando a linguagem visual da lista.
- Correção: exclusão agora abre modal interno com nome da campanha, aviso de irreversibilidade, cancelar, estado de carregamento e erro da operação. O modal mantém foco e fecha por Escape/backdrop apenas enquanto a exclusão não estiver pendente.
- Reteste técnico: TypeScript e checagem de diff aprovados; reteste visual local inclui abertura, cancelar e confirmar exclusão de uma campanha temporária.

#### Correção de clone sem público visível

- Defeito: ao clonar uma campanha, a definição de audiência era preservada, mas o contador do rascunho permanecia em zero, transmitindo que o clone não tinha contatos.
- Causa: o contador persistido representa a composição de envio; um rascunho não pode copiar `campaign_contacts`, pois essas linhas carregam tentativa, status e histórico de entrega.
- Correção: o clone preserva pasta e tags, resolve novamente a definição de audiência contra os contatos atuais e grava somente a contagem de elegíveis. O disparo volta a resolver a audiência no instante de envio, preservando opt-out e supressões posteriores.
- Reteste técnico: `tests/campaigns.test.ts` com 36 testes aprovados, TypeScript e checagem de diff aprovados. Reteste visual local pendente de clonar campanha com público e confirmar o contador na lista.

#### Correção de criação de tags inacessível

- Defeito: os menus de filtro e de ação por campanha exibiam estado vazio, mas apontavam para “Organizar Campanhas” sem uma ação para chegar até lá.
- Correção: ambos agora expõem “Criar primeira tag”/“Criar tag agora” e o botão de gerenciar; todos abrem o modal de organização diretamente na aba Tags. A aba Pastas continua sendo aberta por suas ações específicas.
- Reteste técnico: TypeScript e checagem de diff aprovados. Reteste visual local pendente de abrir cada entrada, criar uma tag e atribuí-la a uma campanha.

### AUD-2026-07-17-19 — Métricas de envio e entrega na lista de campanhas

- Estado inicial: `falhou`. Uma campanha concluída mostrava apenas a métrica de entrega (0% enquanto o webhook ainda não retornou), e a coluna Envio estava vazia, parecendo que o disparo não fora executado.
- Correção: Envio agora mostra a composição do lote processado (`sent + failed` sobre o total); Entrega continua mostrando somente confirmação `delivered/read` da Meta. No cartão compacto as duas métricas aparecem explicitamente.
- Evidência local: a API da campanha observada retornou `total: 1`, `sent: 1`, `delivered: 0`, `read: 0`, confirmando 100% de envio e 0% de entrega pendente de callback.
- Reteste técnico: TypeScript e checagem de diff aprovados. Reteste visual local pendente de recarregar a lista e confirmar as duas colunas.

#### Ajuste de hierarquia — coluna Envio removida

- Revisão de uso: a coluna Envio permanecia como `—` para rascunhos e duplicava o estado da campanha para os demais casos, sem ajudar a decisão na lista.
- Correção: a coluna foi removida; a tabela mantém “Entrega Meta”, que representa somente o callback de entrega/leitura. O progresso de envio é mantido no detalhe e nos Eventos operacionais.
- Reteste técnico: TypeScript e checagem de diff aprovados. Reteste visual local pendente de recarregar `/campaigns`.

### AUD-2026-07-17-20 — Densidade do custo no detalhe da campanha

- Estado inicial: `falhou` por hierarquia visual. A explicação e os dois cartões de custo ocupavam uma seção alta para informação de apoio.
- Correção: custos passaram a uma faixa compacta, com título reduzido, explicação curta e dois indicadores densos lado a lado; premissas permanecem visíveis somente quando existem.
- Reteste técnico: TypeScript e checagem de diff aprovados. Reteste visual local pendente de recarregar o detalhe da campanha em largura desktop e reduzida.

### AUD-2026-07-17-21 — Consistência dos filtros da lista de campanhas

- Estado inicial: `falhou`. O filtro de status ainda usava o menu nativo do navegador, com destaque azul e tipografia incompatíveis. Os popovers de pasta e tags tinham geometria e conteúdo inconsistentes, e o CTA vazio de tags podia ficar truncado na largura reduzida.
- Escopo: CMP-01 em `/campaigns`, desktop e shell colapsado.
- Correção: Status passou a usar popover interno com opções, item selecionado, clique externo e Escape. Pasta e tags adotaram a mesma elevação, borda, raio, espaçamento, largura limitada ao viewport e alinhamento à direita. O estado vazio de tags agora oferece a ação explícita “Criar primeira tag para organizar campanhas”.
- Reteste técnico: `npx tsc --noEmit` e `git diff --check` aprovados em 17/07/2026.
- Reteste visual pendente: abrir os três filtros em desktop e largura reduzida, confirmar que nenhum menu sai do viewport, escolher e limpar filtros e acionar a criação de tags.

### AUD-2026-07-17-22 — Filtros de templates sem barras internas

- Estado inicial: `falhou`. Categoria e status eram dois contêineres encolhidos com `overflow-x-auto`, expondo barras internas e cortando opções na faixa de filtros em `/templates`.
- Correção: a faixa passou a usar grade em telas largas; categoria e status quebram linha naturalmente e a busca ocupa coluna própria. O rótulo “Em análise” também foi corrigido.
- Reteste técnico: `npx tsc --noEmit` e `git diff --check` aprovados em 17/07/2026.
- Reteste visual pendente: recarregar `/templates` e conferir as larguras desktop e reduzida sem scrollbar interno, categorias ocultas ou corte de texto.

### AUD-2026-07-17-23 — Modal legado de criação de MiniApp por template

- Estado inicial: `falhou`. O migrado usava um modal refeito, mais estreito e com três ações (`Cancelar`, `Começar do zero`, `Usar template`), divergindo do componente do SmartZap antigo.
- Comparação de origem: `components/features/flows/builder/CreateFlowFromTemplateDialog.tsx` do legado usa `DialogContent max-w-xl`, catálogo de templates, e rodapé com apenas `Cancelar` e `Criar`.
- Correção: o modal migrado passou a usar o layout estrutural do `DialogContent` legado — overlay fixo, painel centralizado por `top/left 50%`, `grid`, `gap-4`, `max-w-xl`, borda/raio/padding/sombra equivalentes e sem `max-height`/scroll interno imposto pelo wrapper do app. Header, conteúdo e rodapé agora reproduzem a hierarquia do componente de origem, inclusive o rodapé responsivo de duas ações. A criação vazia não compete mais nesta tela e permanece disponível no fluxo próprio da lista.
- Reteste técnico: `npx tsc --noEmit` e `git diff --check` aprovados em 17/07/2026.
- Reteste visual pendente: abrir `/flows/builder?create=template`, verificar largura, rolagem, seleção de cada modelo, Cancelar e Criar.

#### Tentativa de reteste visual em 18/07/2026

- O servidor local respondeu `HTTP 200` para a rota pelo ambiente de execução, mas o navegador interno recebeu `ERR_CONNECTION_REFUSED` para `127.0.0.1:5174`; portanto não há evidência visual válida desta rodada.
- Estado mantido: `corrigida — reteste pendente`. Não marcar como pixel-perfect até a abertura no navegador real e a comparação das interações previstas.

#### Correção do conflito de largura em 18/07/2026

- Reprodução real: o navegador interno abriu a rota e confirmou que o painel continha simultaneamente `max-w-[calc(100%-2rem)]` e `max-w-xl`. Como o migrado concatenava classes sem o `twMerge` usado pelo `cn()` do legado, a regra arbitrária prevalecia e o modal ocupava quase toda a largura disponível.
- Correção: o limite genérico foi removido do primitivo; a margem móvel passou para `w-[calc(100%-2rem)]` e `max-w-xl` tornou-se o único limite máximo do painel, como no `DialogContent` original.
- Evidência de interface: no navegador interno, viewport controlado de `1440 × 1000`, o modal renderizou com largura computada de `576 px`, exatamente o valor de `max-w-xl`, centralizado em `x=432`. O catálogo, as duas ações e a ausência de rolagem interna permaneceram presentes.
- Regressão técnica: build de produção, TypeScript e `git diff --check` aprovados em 18/07/2026. Estado mantido como `corrigida — reteste pendente` até o usuário confirmar a comparação visual no viewport real sem override.

#### Correção da ocupação vertical em 18/07/2026

- Reprodução visual: após a largura ser corrigida, o conteúdo intrínseco ainda fazia o painel ocupar praticamente toda a altura disponível; o catálogo dominava a janela e o rodapé ficava distante do cabeçalho.
- Correção: o painel passou a respeitar `86dvh`, com cabeçalho e rodapé preservados nas linhas fixas da grade. Somente a lista de modelos recebe rolagem, mantendo Nome, seleção atual, Cancelar e Criar acessíveis sem transformar o modal em uma página inteira.
- Reteste de interface: 6 cenários aprovados em Chromium, Firefox e WebKit, nos viewports `1440 × 1000` e `390 × 844`. Em todos, o painel respeitou no máximo `86dvh`, largura máxima de `576 px`/margem móvel, catálogo rolável e ações Cancelar/Criar visíveis.
- Regressão técnica: build de produção, TypeScript e `git diff --check` aprovados. Estado mantido como `corrigida — reteste pendente` até concluir também seleção de cada modelo, Cancelar e criação persistida.

### AUD-2026-07-18-24 — Auditoria geral de paridade e jornadas

- Data de início: 18/07/2026.
- Ambiente inicial: SmartZap CF local em `http://127.0.0.1:5174`; referência de código em `/Users/thaleslaray/Projetos/smartzap`.
- Versão: worktree local atual, com mudanças existentes preservadas; nenhuma publicação iniciada nesta rodada.
- Escopo: catálogo completo de `jornada.md`, inventário de rotas/APIs, paridade funcional e visual com o SmartZap original, estados responsivos, ações, erros, integrações e regressão automatizada.
- Estado inicial: `em execução`.
- Primeiro defeito confirmado — MINI-03: o legado abre “Criar por template” por estado local dentro do Builder e, em Templates, “Criar MiniApp” cria um fluxo vazio e abre o editor. O migrado introduziu indevidamente o deep-link `/flows/builder?create=template` e passou a usá-lo a partir de Templates. Jornada reaberta como `falhou`; correção e reteste pendentes nesta rodada.

#### Correções executadas

- MINI-03: removido o deep-link `?create=template`. “Criar por template” voltou a ser estado local de `/flows/builder`; “Criar MiniApp” em Templates agora cria um fluxo vazio e abre `/flows/builder/:id`, reproduzindo os dois comportamentos distintos do legado.
- SET-01/TMP-01: salvar Phone ID/WABA persistia os dados e depois tentava sincronizar templates, mas uma falha da Meta devolvia HTTP 502. Isso fazia a interface tratar uma gravação concluída como falha. O salvamento agora responde HTTP 200 com `templateSync.status=failed`, preserva IDs e templates locais e orienta nova tentativa manual.
- Cobertura desatualizada: testes de campanha ainda procuravam o antigo seletor nativo de pasta e o painel removido de performance. Os testes passaram a operar os popovers acessíveis atuais; o teste de correção de contato não mistura mais uma asserção não relacionada de throughput.

#### Evidências e retestes

- Comparação de código com o legado: `CreateFlowFromTemplateDialog.tsx` usa estado local/DialogTrigger; `templates/page.tsx` cria MiniApp vazio e navega diretamente ao editor.
- TypeScript: `npx tsc --noEmit` aprovado.
- Build de produção: aprovado; sanitização confirmou ausência de `.dev.vars` em `dist`.
- Unidade/contrato: 46 arquivos e 380 testes aprovados; após a mudança de persistência Meta, `tests/templates.test.ts` passou com 22/22.
- E2E completo isolado em D1 local: 87/87 aprovados em Chromium, Firefox e WebKit. Inclui login, contatos, importação, campanhas, segmentos/variáveis, Inbox, templates, responsividade, acessibilidade, configurações, IA e MiniApps.
- MINI-03 focal: 9/9 aprovados nos três motores, com viewports `1440 × 1000` e `390 × 844`; modal dentro de `/flows/builder`, ações visíveis, rolagem restrita ao catálogo e criação vazia a partir de Templates.
- Navegador interno real: 15 rotas verificadas no servidor `http://127.0.0.1:5174` (`/`, campanhas, contatos, Inbox, templates, MiniApps, Forms, submissões, conhecimento e seis áreas de configurações). Nenhuma exibiu Error Boundary ou vazamento horizontal no viewport real de 1063 px.
- Infraestrutura pela interface real: Workers `15,9 mil/100 mil`, Queues `0/1 mil`, D1 `2,42 MB/5 GB`, leituras/escritas reais e WhatsApp com contagem/limite visíveis; SET-05 retestado sem zeros inventados.
- `git diff --check`: aprovado.

#### Fechamento desta rodada

- Jornadas reclassificadas como `aprovada`: CNT-04, TMP-01, CMP-01, CMP-05, CMP-06, MINI-03 e SET-05.
- Defeitos funcionais encontrados e corrigidos: 2 (paridade de criação MiniApp e falso 502 após salvar configuração Meta).
- Contratos E2E obsoletos corrigidos: 2.
- Pendências externas mantidas sem falsa aprovação: MINI-07/CAL-01 dependem de consentimento OAuth Google real; META-01 depende de evento real da conta sem telefone/`recipient_id`.
- Estado final: auditoria local concluída; nenhuma publicação realizada nesta rodada.

### AUD-2026-07-18-25 — Varredura minuciosa de paridade original × migrado

- Data de início: 18/07/2026.
- Ambiente: código original em `/Users/thaleslaray/Projetos/smartzap`; migrado em `/Users/thaleslaray/Projetos/smartzap-cf`; interface local em `http://127.0.0.1:5174`.
- Versão: worktrees locais atuais, com alterações preexistentes preservadas; nenhuma publicação autorizada nesta rodada.
- Escopo: comparação item por item de rotas, componentes, estados, ações, validações, integrações, responsividade, acessibilidade e cobertura automatizada.
- Estado inicial: `em execução`.
- Defeito confirmado ao abrir a rodada: o passo “Começar” do editor original oferece “Começar do zero”, “Usar modelo pronto” e “Criar com IA”; o migrado contém somente o campo “Nome do MiniApp”. MINI-02, MINI-03 e MINI-04 foram reabertas como `não testada` antes da continuação da varredura.

#### Inventário e comparação

- As 61 jornadas do catálogo foram classificadas individualmente em `docs/auditoria-paridade-original-migrado-2026-07-18.md`.
- Rotas e superfícies do original foram confrontadas com as rotas React e APIs do migrado. Diferenças deliberadas — memória avançada de contatos removida, provedor único de IA, Workflows e Coexistência fora do escopo — não foram registradas como defeito.
- A comparação do editor dinâmico confirmou uma segunda lacuna: o original expõe `Ajustes avançados` por `UnifiedFlowEditor` e abre `AdvancedFlowPanel`; o migrado não possui ação nem painel equivalente. MINI-05 foi reaberta como `não testada`.
- `Importar modelo` existe em um construtor legado alternativo do repositório original, mas não foi tratado como defeito desta rota sem prova de que compunha a jornada dinâmica atual.

#### Evidência de interface real

- No navegador interno, a rota `http://127.0.0.1:5174/flows/builder/884e7dee-b090-4e5e-b9d2-60e0d92417fc` foi aberta e o passo `1 Começar` acionado.
- DOM observado: título `Começar`, texto `Defina a identidade da experiência` e somente o campo `Nome do MiniApp`. Não havia `Criar com IA`, `Usar modelo pronto`, `Criar do zero` nem `Ajustes avançados`.

#### Cobertura e regressão

- `npm test`: 46 arquivos e 380 testes aprovados.
- `npx tsc --noEmit`: aprovado.
- Lacuna de cobertura confirmada: `scripts/e2e-flow-builder-home.mjs` testa IA/template na lista, mas nenhuma asserção exige essas opções dentro de `/flows/builder/:id`. A suíte verde não comprova paridade do editor.

#### Fechamento da auditoria

- Jornadas classificadas: 61/61.
- Falhas de paridade funcionais confirmadas: 2 superfícies, afetando MINI-02, MINI-03, MINI-04 e MINI-05.
- Jornadas reabertas: 4.
- Bloqueios externos preservados: MINI-07, META-01 e CAL-01.
- Itens deliberadamente fora do escopo: WFL-01, WFL-02 e COEX-01.
- Estado final: varredura concluída com falhas abertas; nenhuma correção ou publicação executada nesta rodada.

#### Correções e reteste após autorização

- MINI-02/03/04: o passo “Começar” voltou a oferecer `Criar com IA`, `Usar modelo pronto` e `Criar do zero`, com seus painéis, validações, cancelamento, loading e erro visível.
- MINI-05: o menu `Ações` voltou a expor `Ajustes avançados`; o painel lateral permite selecionar, adicionar, remover, renomear, titular e rotear telas. A renomeação de Screen ID também atualiza `next` e regras de ramificação que referenciavam o ID anterior.
- Persistência: aplicação de template, geração por IA e mudança avançada foram salvas pelo contrato real do editor e confirmadas após recarregar a rota.
- E2E focal: `e2e/flow-editor-parity.spec.ts`, 6/6 cenários aprovados em Chromium, Firefox e WebKit; inclui desktop e viewport `390 × 844`.
- Regressão: 46 arquivos e 380 testes de unidade/contrato aprovados; build de produção, TypeScript e `git diff --check` aprovados.
- Defeito de teste encontrado durante a regressão: o teste de atualização de contato reutilizava um telefone fixo e podia colidir com dados de outra execução. O fixture passou a gerar telefone exclusivo; o contrato do produto não foi alterado.
- Estado final das jornadas restauradas: MINI-02, MINI-03, MINI-04 e MINI-05 `aprovada`. Nenhum deploy foi executado nesta rodada.

### AUD-2026-07-18-26 — Varredura completa de código original versus produto migrado

- Data de início: 18/07/2026.
- Ambiente: SmartZap original em `/Users/thaleslaray/Projetos/smartzap`; SmartZap migrado em `/Users/thaleslaray/Projetos/smartzap-cf`; interface local em `http://127.0.0.1:5174`.
- Versão: worktrees locais atuais, com alterações preexistentes preservadas; nenhuma publicação autorizada nesta rodada.
- Escopo: inventário integral de rotas, páginas, componentes, APIs, ações expostas, estados de interface, integrações e cobertura automatizada, com classificação por categoria e confronto com `jornada.md`.
- Método: revisão de código orientada a segurança, correção, desempenho e manutenibilidade; comparação original × migrado; confirmação focal na interface real para divergências visuais ou funcionais.
- Estado inicial: `em execução`.

#### Inventário e achados

- Relatório consolidado: `docs/auditoria-codigo-versus-interface-2026-07-18.md`.
- A varredura confirmou 8 achados: 2 de severidade alta, 4 médios e 2 baixos.
- NAV-01: ajuda/tutorial foi substituída por redirecionamento ao diagnóstico; o controle anunciado como Modo Desenvolvedor apenas abre Performance; Notificações apresenta badge fixo e redireciona para diagnóstico. Rotas autenticadas desconhecidas não possuem fallback filho explícito.
- ONB-01: overlay, checklist, retomada, credenciais e tour de primeira instalação existentes no original não têm casca equivalente no migrado.
- SEC-02: Workflows permanece com CRUD, publicação, versionamento, execução em Queue, duplicação e exclusão montados em `/api/workflows`, apesar de WFL-01/02 estarem fora do escopo. Memória/histórico avançado de contatos permanece em endpoints, hooks e componente morto, apesar da descontinuação registrada em CNT-04.
- PWA-01: provider, manifesto, service worker e push do original não possuem equivalente no migrado e não estavam registrados como decisão de descontinuação.
- Configuração: as travas do piloto estão desativadas por padrão, mas o validador de build ainda exige secrets antigos e o domínio residual permanece nos caminhos de envio/diagnóstico.
- Desempenho/portabilidade: build cliente avisou chunk principal acima de 500 kB; PDF.js permanece volumoso e os testes emitiram aviso do binding opcional de canvas, embora a extração textual coberta tenha passado.

#### Catálogo atualizado

- Jornadas novas adicionadas antes do fechamento: NAV-01, ONB-01, PWA-01 e SEC-02, todas em estado `falhou` com a evidência necessária registrada em `jornada.md`.
- Jornadas já deliberadamente fora do escopo foram preservadas: WFL-01, WFL-02 e COEX-01. A existência da API de Workflows foi tratada como falha de SEC-02, não como reativação do produto.

#### Evidência técnica

- `npm test`: 46 arquivos e 380 testes aprovados.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado; sanitização confirmou ausência de `.dev.vars` no artefato final. Avisos de secrets residuais de piloto e chunk acima de 500 kB foram registrados, sem serem confundidos com falha de compilação.
- `git diff --check`: aprovado.
- Segurança: nenhum bypass direto de autenticação, segredo publicado ou endpoint mutável público acidental foi confirmado nesta revisão. As APIs residuais estão atrás da autenticação global, mas continuam sendo superfície funcional indevida para clientes autenticados.

#### Fechamento

- Estado final: `concluída com falhas abertas`.
- Categorias auditadas: navegação/casca, onboarding, rotas, APIs, módulos descontinuados, PWA/push, configuração de piloto, desempenho, PDF/portabilidade, cobertura e segurança.
- Correções de produto executadas: 0; a solicitação desta rodada foi de análise e relatório.
- Publicações executadas: 0.

### AUD-2026-07-18-27 — Implementação integral dos achados da varredura

- Data: 18/07/2026.
- Ambiente: worktree local do SmartZap CF; nenhuma publicação executada.
- Origem: oito achados consolidados em `docs/auditoria-codigo-versus-interface-2026-07-18.md` e AUD-2026-07-18-26.
- Estado inicial: NAV-01, ONB-01, PWA-01 e SEC-02 em `falhou`.

#### Mudanças executadas

- NAV-01: Ajuda passou a abrir diálogo inline com atalhos reais; Modo Desenvolvedor alterna estado persistente e expõe `data-developer-mode`; o badge fixo foi removido e Alertas agora deriva pendências da saúde real; rotas desconhecidas exibem 404 e `/workflows/*` informa descontinuação.
- ONB-01: criado checklist idempotente de primeira instalação, derivado da API de saúde, com progresso de Meta, webhook e templates, retomada e dispensa persistente.
- SEC-02: removidos UI, CRUD e execução em Queue de Workflows. `/api/workflows/*` agora responde `410 WORKFLOWS_RETIRED`; tabelas históricas foram preservadas. A memória de contato foi preservada somente onde continua sendo dependência real de Inbox e automação de IA; a antiga ficha avançada continua fora da navegação.
- PWA-01: adicionados manifesto, registro de service worker, cache da casca, atualização de versão e instalação sob evento nativo do navegador.
- Configuração: secrets e variáveis obrigatórias do antigo piloto foram removidos do contrato de deploy. A advertência de piloto foi removida do diagnóstico; o domínio compatível com testes antigos permanece inerte quando não explicitamente habilitado.
- Desempenho: todas as páginas foram convertidas para carregamento por rota. O cliente agora produz chunks independentes; o chunk inicial ficou em aproximadamente `295 kB` (`92,72 kB` gzip), sem o antigo alerta de chunk cliente acima de 500 kB. PDF.js permanece isolado no Worker porque é carregado dinamicamente somente na ingestão de PDF.

#### Evidência técnica

- TypeScript: `npx tsc --noEmit` aprovado.
- Build: `npm run build` aprovado e sanitizado; nenhum `.dev.vars` permaneceu em `dist`.
- Unidade/contrato: 45 arquivos e 371 testes aprovados. O aviso opcional de canvas do ambiente Workers permaneceu sem falha funcional.
- Novo contrato: `/api/workflows` coberto com resposta 410 e código explícito.
- E2E focal de interface: `e2e/shell-retirement-pwa.spec.ts`, 4/4 cenários aprovados no Chromium. Foram exercitados ajuda, alertas derivados da saúde, persistência do Modo Desenvolvedor, onboarding com saúde controlada, dispensa, rota 404, rota Workflows descontinuada, manifesto e service worker públicos.
- Tentativa adicional no navegador interno: a conexão com o localhost falhou durante `Page.navigate`; a falha do controlador foi registrada sem ser confundida com falha do produto. A evidência de interface desta rodada é a execução Playwright real do projeto.
- Estado final: NAV-01, ONB-01 e SEC-02 `aprovada`. PWA-01 permanece `corrigida — reteste pendente`, pois instalação e ativação do service worker só podem ser comprovadas em build servido como produção e nenhum deploy foi autorizado.

### AUD-2026-07-18-28 — Matriz exaustiva do editor MiniApp e validação Meta Flow

- Data de início: 18/07/2026.
- Ambiente: interface local em `http://127.0.0.1:5174`; contrato do Worker local; provedor Meta quando o draft temporário puder ser validado sem expor credenciais.
- Versão: worktree local atual, com alterações preexistentes preservadas; nenhuma publicação de aplicação autorizada nesta rodada.
- Escopo: todas as telas e componentes expostos pelo editor MiniApp, navegação entre telas, caminhos condicionais, prévia interativa, persistência, Flow JSON gerado e validação segundo a documentação oficial Meta.
- Estado inicial: MINI-05 e MINI-06 reabertas como `em teste`; a cobertura anterior era ampla, mas não discriminava cada componente suportado nem comprovava uma matriz exaustiva contra o schema da Meta.
- Matriz obrigatória: Título, Subtítulo, Texto, Legenda, texto curto nos tipos texto/e-mail/telefone/número, texto longo, data, dropdown, escolha única, múltipla escolha, opt-in, required/opções, múltiplas telas, tela final, destino padrão, regra condicional, reordenação, exclusão, preview, persistência, JSON e validação do provedor.
- Referência oficial: snapshot local da documentação Meta de Flow JSON, incluindo limites de telas, componentes, textos, campos, opções, `Footer` e grafo de roteamento.
- Matriz executada: três telas (`START`, `MIDDLE`, `FINAL`), 17 componentes e os 14 tipos expostos pelo editor: Título, Subtítulo, Texto, Legenda, texto curto, e-mail, telefone, número, texto longo, data, dropdown, escolha única, múltipla escolha e opt-in. Também foram exercitados destino padrão, ramificação condicional, tela final, obrigatoriedade e prévia interativa.
- Defeito reproduzido no provedor: a primeira tentativa de criação do draft foi rejeitada com `MISSING_REQUIRED_PROPERTY` para `label` e `INVALID_PROPERTY_KEY` para `text` no componente `OptIn`.
- Causa: o gerador e o validador local ainda espelhavam o contrato legado de `OptIn.text`, enquanto o schema atual da Meta exige `OptIn.label`.
- Correção: o gerador passou a emitir `label`, com limite oficial de 120 caracteres, e o validador local passou a exigir a mesma propriedade. Foi adicionada regressão garantindo que `text` não volte ao payload.
- Testes focais de contrato: 10/10 aprovados em Vitest, cobrindo geração, validação, limites e o contrato corrigido do `OptIn`.
- Testes reais de interface: 9/9 aprovados em Playwright — três cenários repetidos em Chromium, Firefox e WebKit — incluindo viewport móvel 390×844, criação/edição dos componentes, navegação entre telas, prévia interativa e ramificação.
- Validação externa real: a Meta aceitou o segundo payload como draft `797003613434569`, status `DRAFT`, `validation_errors: null`, três telas e 17 componentes. O draft remoto e o artefato local temporário foram removidos após a prova.
- Build: aprovado; a checagem de empacotamento confirmou que `.dev.vars` não foi incluído nos artefatos.
- Resultado exato: 20/20 execuções aprovadas — 10 testes de contrato, 9 cenários de navegador e uma validação real do provedor. O build foi aprovado separadamente.
- Estado final: a matriz estática de componentes e telas está aprovada. MINI-05 e MINI-06 permanecem `em teste` porque esta rodada não republicou nem enviou o Flow, não recebeu callback e não retestou integralmente reordenação, exclusão, mapeamento final e ajustes avançados. MINI-07 permanece `bloqueada`: os caminhos dinâmicos de `INIT`/`data_exchange` não foram validados porque `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` não estão configuradas.
- Publicação/deploy da aplicação: não executado nesta rodada.

### AUD-2026-07-18-29 — Validação real de publicação, envio e retorno do MiniApp

- Data: 18/07/2026.
- Ambiente: aplicação local em `http://127.0.0.1:5174`, D1 local e Graph API da Meta; nenhuma publicação da aplicação foi executada.
- Escopo: validar o Flow temporário já coberto pela matriz, publicá-lo na Meta e enviar somente ao número de testes previamente configurado; acompanhar entrega, leitura e conclusão/callback.
- Segurança: autenticação feita pelo caminho interno de testes do ambiente; nenhum segredo, senha ou token foi registrado nesta auditoria.

#### Evidência

- Flow temporário local criado: `ccb8fc48-6c94-4b72-8dc2-4b603c7819f5`.
- Publicação real aceita pela Meta: HTTP 200, status `PUBLISHED`, Flow ID técnico `3495906073919692`, `validation_errors: []`.
- Envio real aceito pela Meta ao destinatário autorizado de testes (número mascarado): HTTP 200, com `message_id` técnico e `submission_id` registrados somente no ambiente local.
- Consulta posterior do Flow confirmou que o artefato remoto continua `PUBLISHED` e sem erros de validação.
- Banco local: a submissão permaneceu `status=sent`, `completed_at=null`; não houve evento de entrega, leitura, interação ou conclusão recebido durante a janela de observação.
- `/api/submissions` não exibiu a submissão porque essa tela lista somente submissões concluídas; isso é compatível com o estado `sent`, mas deixa a jornada de acompanhamento pendente.

#### Limpeza e pendências

- Artefato local temporário removido com sucesso.
- Tentativa de remoção do Flow publicado pela operação Graph de exclusão retornou HTTP 400; portanto, o artefato remoto `PUBLISHED` não foi confirmado como removido e requer limpeza manual no painel da Meta ou endpoint apropriado.
- A entrega/leitura/callback não pode ser considerada aprovada sem evento real no webhook. A interação completa do Flow também não foi comprovada.
- Os caminhos dinâmicos `INIT`/`data_exchange` permanecem fora desta validação por ausência de `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` no ambiente local.

#### Resultado

- Passou: matriz de interface (9/9 E2E em Chromium, Firefox e WebKit), contrato (10/10) e publicação Meta (sem erros de validação).
- Passou parcialmente: envio real aceito pela Meta.
- Não comprovado: entregue, lido, callback, conclusão do Flow e rejeição.
- Estado final: `concluída com pendências externas`; MINI-05 e MINI-06 permanecem `em teste`, e MINI-07 permanece `bloqueada`.

### AUD-2026-07-18-30 — Rodada final publicada, callback e regressão local

- Data: 18/07/2026.
- Ambiente: aplicação publicada em `https://smartzap-cf.thales2581.workers.dev/`; suíte local no worktree atual; sem novo envio de mensagem nesta rodada.
- Escopo: saúde pública, assinatura do webhook, inscrição dos campos Meta, validação de Flow JSON, regressão automatizada e build de produção.
- Estado inicial: entrega/leitura/conclusão do Flow ainda não comprovadas; MINI-05/MINI-06 em `em teste`; MINI-07 `bloqueada` por chaves de assinatura ausentes.

#### Evidência publicada

- `GET /api/health`: HTTP 200 com `ok=true`.
- `HEAD /`: HTTP 200; casca HTML publicada respondeu.
- Assinatura da inscrição Meta: endpoint interno confirmou callback `https://smartzap-cf.thales2581.workers.dev/webhook`, todos os campos operacionais previstos e `flowsSubscribed=true`.
- Probe de verificação com token inválido em `/webhook`: HTTP 403 `forbidden`, comportamento esperado para credencial incorreta; não constitui falha do callback.
- Não houve novo envio para evitar duplicidade. A evidência real anterior continua sendo: envio aceito pela Meta, mas sem evento de entrega, leitura, interação ou conclusão observado no ambiente local.

#### Evidência local

- `npm test`: 47/47 arquivos e 383/383 testes aprovados.
- `npm run build`: aprovado; pós-build sanitizou `dist` e não incluiu `.dev.vars`.
- `npm run validate:flow -- tests/fixtures/flow-valid.json`: aprovado (`ok=true`, versão `7.3`, 1 tela, 269 bytes).
- A execução sem caminho (`npm run validate:flow`) retornou `FILE_REQUIRED`, erro de uso esperado do utilitário, não falha do produto.
- O build continua advertindo que `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` não estão configuradas; por isso os caminhos dinâmicos `INIT`/`data_exchange` não foram validados.

#### Resultado e pendências

- A aplicação publicada está saudável e o callback está inscrito na Meta.
- A suíte local e o build estão verdes: 383/383 testes e build aprovado.
- Entrega, leitura, interação/conclusão do MiniApp e reconciliação de status permanecem **não comprovadas** até chegar evento real no webhook.
- MINI-05 e MINI-06 permanecem `em teste`; MINI-07 permanece `bloqueada` por ausência das chaves de assinatura.
- Estado da rodada: `concluída com pendências externas`; nenhum sucesso foi inferido a partir de simulação ou ausência de erro HTTP.

### AUD-2026-07-18-31 — Diagnóstico da mensagem não recebida no ambiente publicado

- Data: 18/07/2026.
- Ambiente: produção autenticada em `https://smartzap-cf.thales2581.workers.dev/` pelo navegador interno do Codex; verificações HTTP públicas sem sessão.
- Escopo: correlacionar a mensagem de teste reportada como não recebida com campanha, log, `message_id` e eventos do webhook.
- Estado inicial: entrega/leitura/conclusão do Flow ainda não comprovadas.

#### Evidência

- O dashboard publicado abriu autenticado e exibiu dados históricos agregados (`Total Enviado 21`, `Taxa de Entrega 100%`, `Falhas no Envio 1`). Esse agregado não identifica a mensagem reportada.
- A rota publicada `/campaigns/f978136b-27d7-43bc-bd17-54938b0caf11` retornou a tela **campanha não encontrada**.
- A lista publicada carregou 55 campanhas, mas não contém a campanha/ID usado na rodada anterior; buscas por `Campanha 17`, `agenda_paciente_confirmacao` e `0524_dia_3_kdvc2` não localizaram um registro correlacionável.
- As APIs privadas da campanha (`/api/campaigns/{id}`, `/messages` e `/metrics`) retornaram HTTP 401 sem a sessão do navegador, comportamento esperado de autenticação; não há evidência de erro de negócio nesses endpoints.
- Não foi localizado na produção um registro de destinatário ou `message_id` correspondente ao envio reportado. Sem esse vínculo não é possível confrontar o envio com `delivered`, `read` ou `failed` no webhook.

#### Diagnóstico

- O deploy e a saúde básica da produção estão funcionando; o problema observado nesta verificação é de **rastreabilidade/ambiente**, não uma rejeição comprovada pela Meta.
- A mensagem que o usuário não recebeu foi provavelmente disparada a partir de outro ambiente (local/outro deploy) ou de uma campanha que não está mais presente nessa base de produção. Isso é uma hipótese operacional baseada na ausência do ID, não uma confirmação de entrega ou falha da Meta.
- Como não existe campanha/log/`message_id` correspondente na produção atual, não há como afirmar que o webhook falhou para essa mensagem específica.

#### Próximo teste necessário

- Criar e enviar uma única campanha a partir da URL publicada, registrar o novo ID da campanha e o `message_id` técnico, e acompanhar a sequência `sent → delivered → read` no detalhe da campanha e no webhook. Nenhuma nova mensagem foi enviada nesta rodada.

#### Resultado

- Saúde/deploy: comprovados.
- Callback: já confirmado na auditoria AUD-2026-07-18-30.
- Correlação da mensagem não recebida: **bloqueada por ausência do registro na produção**.
- Estado final: diagnóstico concluído; entrega/leitura/conclusão do Flow continuam `não testadas` para um envio correlacionável.

#### Atualização da rodada — nova campanha real pela URL publicada

- Data: 18/07/2026.
- Ambiente: produção autenticada em `https://smartzap-cf.thales2581.workers.dev/`, navegador interno do Codex.
- Jornada executada: CMP-02 → CMP-03 → CMP-04 → CMP-05.
- Pré-condição encontrada: o template Utility selecionado tinha quatro variáveis obrigatórias. O avanço ficou corretamente bloqueado enquanto `{{3}}` e `{{4}}` estavam vazias; após preenchê-las e aguardar a validação assíncrona, o fluxo prosseguiu.
- Público: modo Teste, destino único autorizado (telefone mascarado `+55 21 ****-9966`). Não foi necessário escolher outro contato.
- Campanha criada: `f1e975a6-bc05-427f-b59b-d4d051ec2ed0`.
- Resultado real no detalhe da campanha: status `Concluído`; enviadas 1/1; aceitas 1/1; entregues 1/1; lidas 0/1; ignoradas 0; falhas 0. O log exibiu status `Entregue`.
- Custos exibidos: estimativa R$ 0,03; valor Meta US$ 0,0068; confirmação em BRL ainda aguardando reconciliação.
- Reteste de leitura: não marcado como aprovado; permanece aguardando o destinatário abrir a mensagem e o webhook de `read` chegar.

#### Resultado atualizado

- O requisito que faltava para criar a campanha era completar todas as variáveis obrigatórias (`{{3}}` e `{{4}}`) e aguardar o término da validação do público.
- O disparo real pela produção foi comprovado até `delivered`, eliminando o bloqueio anterior de rastreabilidade para esta campanha.
- Pendência objetiva: confirmar leitura (`read`) e, se necessário, interação/conclusão do MiniApp em um fluxo publicado; a campanha Utility usada nesta rodada não testa interação de Flow.
- Contagem desta execução: 1 campanha criada; 1 mensagem aceita; 1 entregue; 0 lidas; 0 falhas.
## 2026-07-19 — Ajuste mobile-first estrutural (AUD-2026-07-19-01)

- **Ambiente:** local, `/Users/thaleslaray/Projetos/smartzap-cf`.
- **Escopo:** Inbox, agentes de IA, projetos/templates, detalhe de campanha, wizard de campanha e construtor de MiniApp.
- **Estado inicial:** componentes com larguras mínimas rígidas em telas estreitas; toolbar de agentes sem quebra; grids de projetos com duas colunas forçadas; painel de detalhe de campanha com largura mínima; menu de ações do MiniApp podia ultrapassar o viewport.
- **Correções:** shell da Inbox ocupa largura integral antes do breakpoint; toolbar de agentes passa a empilhar e quebrar; grid de projetos usa uma coluna no mobile; controles de detalhe/wizard usam largura fluida; menu de ações do MiniApp limita sua largura à viewport.
- **Verificação técnica:** `npm test` — 47 arquivos e 383 testes aprovados; `npm run build` — build Vite aprovado (1.926 módulos transformados). Permanecem apenas avisos de ambiente já existentes sobre chaves de Flow e módulos nativos do Vitest.
- **Reteste visual:** pendente no navegador interno para viewports 360, 390 e 768 px; testes automatizados não substituem a inspeção visual da jornada.
- **Estado:** `corrigida — reteste pendente`.

## 2026-07-19 — Reteste responsivo completo e Inbox mobile (AUD-2026-07-19-02)

- **Ambiente:** local, `/Users/thaleslaray/Projetos/smartzap-cf`, servidor E2E isolado em `localhost:5177`.
- **Escopo:** matriz de rotas operacionais, Inbox em lista/conversa, checklist de onboarding e compatibilidade do inspector do Vite/Cloudflare.
- **Correções executadas:** a Inbox agora mostra somente a lista no mobile quando não há conversa selecionada e somente a conversa quando há `:id`, com retorno explícito para a lista; o checklist de onboarding permanece no Dashboard/Configurações e não cobre superfícies operacionais; `CF_INSPECTOR_PORT` tornou o servidor de teste isolável sem alterar o padrão.
- **Matriz responsiva:** 20 rotas operacionais × 6 viewports (`360×800`, `390×844`, `620×900`, `768×1024`, `1440×900`, `1920×1080`) × Chromium, Firefox e WebKit = **360/360 combinações aprovadas**, sem `main` ausente, Error Boundary ou overflow horizontal.
- **Inbox focal:** alternância lista → conversa → lista aprovada em Chromium, Firefox e WebKit = **3/3**; o checklist não aparece sobre a Inbox; screenshot real confirmou lista e conversa em largura `390 px` sem painel parcial.
- **Verificação técnica:** `npm test` = **47 arquivos, 383 testes aprovados**; `npm run build` = build Vite aprovado com **1.926 módulos transformados**; `git diff --check` aprovado.
- **Catálogo:** `ONB-01` e `RSP-01` atualizadas para `aprovada` após evidência compatível em interface real.
- **Pendência separada:** a execução integral anterior da suíte E2E encontrou 109 aprovados e 14 falhas pré-existentes em testes de simulação/limpeza de MiniApps, modo desenvolvedor descontinuado e condições de carregamento; os testes responsivos desta rodada passaram isoladamente nos três motores.

## 2026-07-19 — Fechamento da suíte E2E e correção das falhas encadeadas (AUD-2026-07-19-03)

- **Ambiente:** local, `/Users/thaleslaray/Projetos/smartzap-cf`, banco D1 E2E resemeado e servidores isolados por `E2E_PORT`/`CF_INSPECTOR_PORT`.
- **Escopo:** 126 testes E2E nos projetos Chromium, Firefox e WebKit; fluxo de MiniApp, editor, shell, Contatos, campanhas, Inbox, configurações, acessibilidade e matriz responsiva.
- **Causas encontradas:** o teste de paridade do editor não preenchia o e-mail obrigatório; o teste do shell esperava a superfície de modo desenvolvedor removida e catalogada como descontinuada; o loading de Contatos concorria com o primeiro carregamento do chunk; a execução paralela contaminava o D1 compartilhado; e o teste de IDs Meta deixava credenciais fictícias salvas entre projetos.
- **Correções:** preenchimento do campo obrigatório no teste; alinhamento do teste do shell ao catálogo vigente; pré-aquecimento do chunk e atraso controlado no teste de loading; Playwright serial por padrão (`E2E_WORKERS` opcional); restauração dos IDs após o teste; API de configurações passou a aceitar string vazia para limpar/desconectar IDs Meta. `SET-01` foi atualizado no `jornada.md` para registrar a limpeza/desconexão.
- **Retestes focais:** editor, shell e Contatos — 33/33 no Chromium; preflight de importação — 3/3 nos três navegadores.
- **Verificação final:** `npm test` — **47 arquivos, 383/383 testes**; `npm run build` — **1.926 módulos transformados**, aprovado; `npm run e2e` com `E2E_WORKERS=1` — **126/126 testes aprovados em Chromium, Firefox e WebKit**; matriz responsiva — **360/360 combinações**; `git diff --check` — aprovado.
- **Estado final:** falhas E2E desta rodada corrigidas e retestadas. Permanecem somente pendências externas já catalogadas para validação real da Meta/Flow e avisos de ambiente sobre `FLOW_PRIVATE_KEY`/`FLOW_PUBLIC_KEY`.

## 2026-07-19 — Correção visual do editor de templates no mobile (AUD-2026-07-19-04)

- **Ambiente:** local, `http://localhost:5173/templates/drafts/new`, navegador Chromium real para inspeção visual e Chromium, Firefox e WebKit para regressão.
- **Reprodução:** em largura móvel, os três botões de etapa mantinham rótulos longos, espaçamento e alinhamento desktop; o texto ultrapassava a largura interna dos botões e a tela aparentava estar cortada. O título também quebrava de forma desnecessária.
- **Correção:** o editor passou a usar rótulos móveis compactos (`Config.`, `Conteúdo`, `Botões`), layout vertical no mobile, `min-w-0` nos containers e título fluido; o desktop preserva os rótulos completos e a prévia lateral.
- **Evidência visual:** viewport `390×844`, screenshot pós-correção sem corte horizontal; `document.documentElement.scrollWidth = 390`, `clientWidth = 390`; os três passos ficaram com `scrollWidth = clientWidth = 104`.
- **Reteste automatizado:** `e2e/template-draft-editor.spec.ts` — **9/9 aprovados** em Chromium, Firefox e WebKit; o teste agora verifica explicitamente que cada passo não possui overflow interno.
- **Verificação técnica:** `npm test` — **47 arquivos, 383/383 testes**; `npm run build` — aprovado; `git diff --check` — aprovado.
- **Catálogo:** `TMP-02` atualizado para `aprovada`.

## 2026-07-19 — Auditoria responsiva de todas as rotas operacionais (AUD-2026-07-19-05)

- **Ambiente:** local, `http://localhost:5173`, coluna estreita reproduzida em viewport de `360`, `390`, `620`, `672`, `768`, `1440` e `1920 px`.
- **Escopo:** Dashboard, Campanhas, wizard, Contatos, Templates, editor de rascunho, projeto de templates, Segmentos, Base de conhecimento, Formulários, Submissões, MiniApps, Inbox, Configurações, Atendentes, Diagnóstico Meta, Performance, Central de IA e Agentes IA.
- **Defeitos encontrados:** Configurações expandia cards por filhos flex sem `min-width: 0`; a barra do projeto de templates escapava dos dois lados em largura intermediária; o cabeçalho de Atendentes mantinha duas ações em uma linha impossível; os controles de Agentes IA excediam o card; e a tabela de campanhas recentes do Dashboard não tinha contêiner de rolagem controlada.
- **Correções:** camada global de `min-w-0/max-w-full` em `Card` e `PageHeader`; wrapping de labels e flex containers em Configurações; etapas e ações responsivas em projeto de templates, Atendentes e Agentes IA; tabela do Dashboard envolvida em `overflow-x-auto`.
- **Prevenção:** a matriz de rotas agora verifica, além do `scrollWidth` do documento, qualquer elemento visível fora do viewport; exceção somente para descendentes de contêineres de tabela com rolagem horizontal intencional.
- **Reteste:** matriz responsiva — **3/3 testes aprovados**, cada um cobrindo 20 rotas × 6 viewports, em Chromium, Firefox e WebKit; editor de templates — **9/9 aprovados** nos três navegadores; inspeção visual real em `672×1000` confirmou Configurações, Atendentes, Agentes IA e projeto de templates sem corte lateral.
- **Verificação técnica:** `npm test` — **47 arquivos, 383/383 testes**; `npm run build` — aprovado com **1.926 módulos transformados**; `git diff --check` — aprovado.
- **Catálogo:** `RSP-01` atualizado para explicitar overflow interno e `aprovada` mantida após evidência.

## 2026-07-19 — Mockup Apple-inspired premium (DES-01)

- **Ambiente:** local, `http://localhost:5173/design-preview`, navegador interno do Codex e Playwright em Chromium, Firefox e WebKit.
- **Escopo:** prévia visual isolada para avaliação da nova direção do produto; shell desktop, drawer mobile, métricas, gráfico, atividade, campanhas recentes e estados demonstrativos.
- **Implementação:** nova rota sem dependência de API ou mutação de dados, com navegação lateral desktop, menu móvel, superfícies em camadas, acento mint, alvos de interação ampliados e layout fluido.
- **Evidência visual:** rota aberta no navegador real; screenshot de desktop confirmou composição completa, hierarquia, gráfico, sidebar, atividade e tabela de campanhas sem corte visível.
- **Reteste automatizado:** `e2e/design-preview.spec.ts` — **3/3 aprovados** em Chromium, Firefox e WebKit; cada execução validou `390×844` e `1440×900`, ausência de overflow horizontal, abertura/fechamento do menu mobile e presença da ação principal.
- **Interação focal:** ação “Nova campanha” exibiu o estado demonstrativo “Ação demonstrativa do mockup.” e foi fechada sem alterar dados.
- **Verificação técnica:** `npm run build` — aprovado; `git diff --check` — aprovado.
- **Limitação:** o mockup ainda não representa a substituição das telas operacionais existentes; permanece aguardando avaliação visual do produto antes de virar direção definitiva.
- **Catálogo:** `DES-01` registrado como `em teste`.

## 2026-07-19 — Aplicação da direção premium em todas as rotas (DES-02)

- **Ambiente:** local, `http://localhost:5173`, navegador interno do Codex e Playwright em Chromium, Firefox e WebKit.
- **Escopo:** camada visual compartilhada do app autenticado: tokens de cor e superfície, Shell desktop/mobile, navegação, botões, inputs, cartões, cabeçalhos, foco e Login; todas as rotas operacionais cobertas pela matriz existente.
- **Implementação:** a direção Apple-inspired do mockup foi aplicada no `premium-app`, com superfície mineral escura, acento mint único, sidebar expandida no desktop, menu móvel, materiais translúcidos, alvos de toque de 44 px, foco visível e respeito a `prefers-reduced-motion`.
- **Evidência visual real:** `/`, `/campaigns`, `/contacts` e `/settings` conferidas no navegador interno; sidebar, cabeçalho, cartões, filtros, tabela e formulário mantiveram hierarquia premium sem corte lateral.
- **Matriz responsiva:** 20 rotas operacionais × 6 viewports (`360×800`, `390×844`, `620×900`, `768×1024`, `1440×900`, `1920×1080`) × Chromium, Firefox e WebKit = **360/360 combinações aprovadas**, sem `main` ausente, Error Boundary ou overflow horizontal.
- **Retestes focais:** preview e shell — **15/15 aprovados**; contraste WCAG nas rotas críticas — **3/3 aprovados**; fluxo de envio no Inbox com modal acessível — **3/3 aprovados**.
- **Verificação técnica:** `npm test` — **47 arquivos, 383/383 testes**; `npm run build` — aprovado; `git diff --check` — aprovado. A suíte E2E completa registrou **123/129** antes dos ajustes de contraste; os seis cenários falhos foram corrigidos e retestados isoladamente com **6/6 aprovados** nos três navegadores.
- **Catálogo:** `DES-02` aprovado; `DES-01` permanece `em teste` como mockup de referência independente.

## 2026-07-19 — Refinamento estrutural da direção premium (DES-03)

- **Ambiente:** local, `http://localhost:5173`, navegador interno do Codex e Playwright em Chromium, Firefox e WebKit.
- **Motivo:** a primeira aplicação estava percebida principalmente como troca da cor dos menus; a inspeção visual pediu uma diferença estrutural mais clara em relação ao mockup.
- **Correções:** seleção de navegação deixou de ser um bloco verde e passou a usar vidro escuro, borda suave e indicador mint; cards e painéis receberam gradientes de superfície, borda interna, sombra e raio de 24 px; cabeçalhos ganharam hierarquia e assinatura luminosa; métricas ficaram mais compactas; o gráfico passou ao acento mint; ações primárias continuam claras e o verde ficou reservado a ação/estado.
- **Evidência visual real:** Dashboard, Campanhas e Contatos conferidos no navegador interno após hot reload; as três telas exibiram a nova composição sem perda funcional ou corte lateral.
- **Reteste automatizado:** preview e shell — **15/15 aprovados** em Chromium, Firefox e WebKit; matriz responsiva — **360/360 combinações aprovadas** (20 rotas × `360×800`, `390×844`, `620×900`, `768×1024`, `1440×900`, `1920×1080` × 3 navegadores).
- **Verificação técnica:** `npm test` — **47 arquivos, 383/383 testes**; `npm run build` — aprovado com **1.927 módulos transformados**; `git diff --check` — aprovado. Permanecem somente os avisos de ambiente já conhecidos sobre chaves de Flow, bindings AI remotos e fallback nativo do canvas.
- **Catálogo:** `DES-03` aprovado; `DES-01` segue `em teste` como mockup independente.

## 2026-07-19 — Dashboard como console de telemetria (DASH-02)

- **Ambiente:** local, `http://localhost:5173`, navegador interno do Codex e Playwright em Chromium, Firefox e WebKit.
- **Diagnóstico:** o Dashboard anterior distribuía todos os sinais em quatro cards equivalentes; isso mantinha a tela no padrão de um painel SaaS genérico e não comunicava a natureza operacional do SmartZap.
- **Decisão de design:** tratar a página como uma estação de telemetria: um sinal principal dominante para mensagens enviadas, uma coluna de saúde para entrega/campanhas/falhas, um anel de entrega como assinatura visual e o gráfico como instrumento de leitura.
- **Implementação:** novo bloco `dashboard-hero-card`, métricas compactas empilhadas, telemetria textual, anel de entrega, CTA de performance e acento mint no gráfico; os dados continuam vindo da mesma API e os estados existentes foram preservados.
- **Evidência visual real:** Dashboard recarregado no navegador interno; a composição assimétrica ficou visível em desktop, sem depender da cor dos menus para comunicar a mudança.
- **Retestes focais:** estados vazio/erro/recuperação e layout móvel — **6/6 aprovados** nos três navegadores.
- **Matriz responsiva:** 20 rotas × 6 viewports (`360×800`, `390×844`, `620×900`, `768×1024`, `1440×900`, `1920×1080`) × Chromium, Firefox e WebKit = **360/360 combinações aprovadas**, sem `main` ausente, Error Boundary ou overflow horizontal.
- **Verificação técnica:** `npm test` — **47 arquivos, 383/383 testes**; `npm run build` — aprovado com **1.927 módulos transformados**; `git diff --check` — aprovado. Permanecem os avisos de ambiente já conhecidos sobre Flow, bindings AI remotos e fallback nativo do canvas.
- **Catálogo:** `DASH-02` aprovado.

## 2026-07-19 — Ensaio controlado Meta oficial ↔ WAHooks (WHK-01)

- **Ambiente:** Meta Cloud API real, WAHooks CLI v0.16.0 e SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`; consulta local da aplicação em `http://localhost:5173` respondeu HTTP 200.
- **Escopo:** provar o transporte nos dois sentidos entre o número oficial Meta configurado (exibido de forma mascarada: `+55 11 ****-0377`) e a conexão WAHooks nomeada “Suporte” (destino mascarado: `+55 11 ****-6242`), sem iniciar agentes automáticos em loop.
- **Estado inicial:** `em teste`. Foram encontradas 3 conexões WAHooks conectadas, embora o pedido mencionasse 2. A conexão “Suporte” foi escolhida por nome operacional; não foram usados os números pessoais “Thales”/“Thales BKP”.
- **Meta → WAHooks:** o template inicialmente escolhido foi rejeitado antes da entrega por exigir cabeçalho de vídeo (`HTTP 400`, código Meta `132012`); nenhum retry desse payload foi feito. Após consultar os componentes reais, o template aprovado `hello_world/en_US` foi aceito pela Meta (`HTTP 200`) com `message_id` técnico `wamid.HBgNNTUxMTkzNjIzODI0MhUCABEYEkJEMDdCMzc0Qzg5OTM1NEYxMwA=`. O histórico WAHooks confirmou a mensagem recebida no chat do número oficial.
- **WAHooks → Meta:** foi enviada uma única mensagem controlada pelo CLI, com instrução para responder `PING`; o CLI confirmou `Message sent` para o número oficial. O histórico WAHooks preservou as duas mensagens do ensaio.
- **Infraestrutura confirmada:** a consulta read-only à configuração real da Meta mostrou o callback `https://smartzap-cf.thales2581.workers.dev/webhook` no telefone, WABA e aplicativo. A conexão WAHooks “Suporte” retornou lista de webhooks vazia; as outras conexões possuem callbacks externos, não o SmartZap.
- **Diagnóstico:** o SmartZap já possui IA automática para inbound Meta, com Queue, RAG, janela de atendimento, piloto e travas de envio. Não há adaptador WAHooks, verificação HMAC WAHooks, persistência/correlação de eventos WAHooks ou allowlist específica no repositório. Portanto, o transporte foi comprovado, mas a orquestração automática Meta ↔ WAHooks ↔ IA permanece não implementada.
- **Segurança operacional:** nenhum token, senha ou segredo foi exposto; o teste foi limitado a uma mensagem por direção e não habilitou dois agentes conversando entre si.
- **Verificação automatizada:** 0 testes automatizados executados nesta rodada; a evidência foi de integração externa real e histórico do WAHooks. Jornadas aprovadas nesta execução: 0; jornada em teste: 1 (`WHK-01`); bloqueio técnico: 1 (ausência do adaptador/webhook WAHooks no SmartZap).
- **Próxima correção necessária:** criar uma rota pública WAHooks com HMAC e tolerância de timestamp, registrar evento idempotente, mapear a mensagem para uma conversa Meta/WAHooks sem misturar identidades, aplicar allowlist e `max_turns`, e só então ligar o gerador de IA a um dos lados. O primeiro reteste deve usar um roteiro de no máximo 3 turnos e desligamento automático.
- **Catálogo:** `WHK-01` incluída como `em teste` e a lacuna correspondente foi registrada em `jornada.md`.

## 2026-07-19 — Reteste da IA usando WAHooks apenas como canal de teste (WHK-01)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, interface real da Inbox, Meta Cloud API real e WAHooks CLI v0.16.0; números registrados somente de forma mascarada (`+55 11 ****-0377` e `+55 11 ****-6242`).
- **Configuração:** na conversa “Suporte”, a IA assistiva foi ativada, o agente “Agente Comercial” foi atribuído, a conversa foi devolvida explicitamente à IA e a base sintética `FAQ de teste SmartZap` foi vinculada ao agente.
- **Disparo real:** WAHooks enviou uma única mensagem controlada às 20:31: “qual e o horario de atendimento da FAQ de teste?”. O WAHooks CLI confirmou `Message sent`.
- **Resposta real:** às 20:32, o histórico WAHooks registrou a resposta do SmartZap: “O horário de atendimento da FAQ de teste é das 9h as 18h.” A Inbox exibiu a mesma resposta como enviada e marcada como rascunho aprovado.
- **Conclusão:** o fluxo solicitado foi comprovado: WAHooks serviu apenas como número externo de teste; o SmartZap recebeu pelo webhook Meta, consultou a base/IA e respondeu pela API oficial. Não foi criado nem necessário um adaptador WAHooks no SmartZap.
- **Segurança operacional:** o ensaio usou uma mensagem por turno, não colocou dois agentes em conversa automática, não expôs tokens ou segredos e não usou os números pessoais disponíveis.
- **Verificação automatizada:** 0 testes automatizados executados nesta rodada; evidência principal de integração externa real, histórico WAHooks e Inbox. Jornadas aprovadas nesta execução: 1 (`WHK-01`); pendências: 0 para este escopo; bloqueios: 0.
- **Catálogo:** `WHK-01` atualizada para `aprovada`; a ingestão direta por callback WAHooks permanece explicitamente fora do escopo.

## 2026-07-19 — Simulação de conversa multi-turno WAHooks ↔ IA (WHK-02)

- **Ambiente:** mesmo SmartZap publicado, conversa “Suporte” e conexão WAHooks autorizada do ensaio anterior; operação limitada ao número de teste mascarado `+55 11 ****-6242`.
- **Roteiro executado no mesmo chat:** pergunta sobre horário da FAQ → confirmação do horário → pedido ambíguo para “resumir isso” → pergunta explícita sobre o horário em uma frase única.
- **Turno 1:** WAHooks enviou “Voce pode me informar o horario de atendimento da FAQ de teste?” às 20:35; a IA respondeu às 20:36: “O horário de atendimento da FAQ de teste é das 9h as 18h.”
- **Turno 2:** WAHooks enviou a confirmação às 20:38; a IA respondeu no mesmo minuto repetindo corretamente o horário.
- **Turno 3:** WAHooks enviou “Pode resumir isso…” às 20:39. Sem referência textual suficiente para recuperar a fonte, o SmartZap não respondeu automaticamente e a conversa foi para `Humano`; esse é um handoff observável, não uma perda de transporte.
- **Retomada:** a conversa foi devolvida à IA na Inbox, sem alterar a conexão WAHooks.
- **Turno 4:** WAHooks enviou a pergunta explícita às 20:42; a IA respondeu às 20:42 com a frase correta.
- **Conclusão:** o transporte e a orquestração multi-turno funcionam no mesmo chat, com contexto suficiente para confirmação e reformulação explícitas. A variação de linguagem ambígua aciona handoff seguro e exige decisão de produto sobre esclarecimento automático antes de ser aprovada como conversa autônoma completa.
- **Verificação automatizada:** 0 testes automatizados nesta rodada; evidência de integração externa real, histórico WAHooks e Inbox. `WHK-01` permanece aprovada; `WHK-02` permanece em teste; bloqueios técnicos: 0; pendência funcional: política de ambiguidade.
- **Segurança operacional:** quatro mensagens de entrada controladas, sem agentes conversando entre si, sem loop e sem exposição de credenciais.
- **Catálogo:** `WHK-02` adicionada como `em teste` e a lacuna foi registrada em `jornada.md`.

## 2026-07-19 — Operação comercial realista com prompt, FAQ e WAHooks (AI-05 / WHK-03)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `faaaa72c-a2b4-452b-a045-70be6a56dd1a`, Meta Cloud API real e conexão WAHooks limpa, sem histórico com o número oficial; número mascarado no registro: `+55 21 ****-4524`.
- **Configuração de negócio:** o agente padrão foi renomeado para `SmartZap | Comercial e Suporte`, com prompt de identidade B2B, qualificação de nome/empresa/objetivo/volume/API, regras de não invenção, proteção de credenciais, uso de contexto e handoff para preço, contrato, incidente ou integração customizada.
- **Base de conhecimento:** criado e indexado o documento privado `SmartZap — FAQ Comercial e Operacional`, contendo produto, API oficial Meta, requisitos, campanhas, opt-in/opt-out, templates, Inbox, IA, entrega por webhook, contratação e roteiro de descoberta. A FAQ artificial anterior foi desvinculada e excluída. A busca de recuperação retornou somente o documento real, com scores observados `0.61297786` e `0.5870147`.
- **Correção de produto:** a UI expunha o agente padrão legado `agent_commercial`, mas a API de atribuição aceitava apenas UUID e retornava `agente inválido`. O contrato foi corrigido para aceitar IDs internos legados e UUIDs; testes focais passaram `17/17` e o deploy foi concluído.
- **Conversa real limpa:** WAHooks iniciou o prospecto às 21:03. A IA foi ativada e atribuída ao agente comercial na Inbox. O roteiro cobriu: o que é o SmartZap; operação com aproximadamente 2.000 contatos; conexão com API oficial; importação com opt-in; bloqueio de opt-out; template Meta; audiência elegível; eventos de aceite, entrega, leitura e falha por webhook.
- **Evidência de resposta:** o histórico WAHooks recebeu respostas reais explicando o produto, o primeiro passo de conexão, a regra de consentimento, os templates e o acompanhamento de entrega. Após reforçar os termos “elegíveis”, “webhook”, “entrega”, “leitura” e “falha”, a IA respondeu corretamente sobre a audiência e os eventos pós-disparo.
- **Defeito encontrado e corrigido:** antes do deploy final, a IA repetiu uma pergunta já respondida pelo prospecto. O prompt sistêmico da geração fundamentada foi ajustado para responder especificamente à última linha `CLIENTE`, usar mensagens anteriores como contexto e avançar quando a resposta já estiver dada. O teste automatizado foi atualizado e passou.
- **Handoff comercial:** ao perguntar preço e prazo para contratar, o prospecto não recebeu preço inventado; a conversa mudou para `Humano` na Inbox, conforme a regra de transferência. A ausência de mensagem automática de preço é comportamento seguro e esperado para este escopo.
- **Verificação automatizada:** `npm test -- --run tests/ai.test.ts tests/inbox-operations.test.ts` — `2 arquivos, 17/17 testes`; `npm run build` e `npm run deploy` concluídos. A evidência de negócio foi integração externa real, histórico WAHooks e Inbox.
- **Estado:** `AI-05` e `WHK-03` permanecem `em teste`: a operação é funcional e fundamentada, mas ainda precisa de um novo ciclo limpo para confirmar que não há repetição em toda a qualificação, não apenas após a correção pontual.
- **Segurança operacional:** não foram expostos tokens, senhas ou IDs secretos; o canal WAHooks foi usado apenas como prospecto de teste e não houve loop entre agentes.
- **Catálogo:** `AI-05` e `WHK-03` adicionadas como `em teste`; lacuna registrada em `jornada.md`.

## 2026-07-19 — Varredura das configurações de Inbox e IA (INB-04 / AI-06 / AI-07 / AI-08)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `faaaa72c-a2b4-452b-a045-70be6a56dd1a`; interface autenticada no navegador interno; código local em `/Users/thaleslaray/Projetos/smartzap-cf`.
- **Escopo:** `jornada.md`, rotas `/inbox`, `/inbox/:id`, `/settings/ai`, `/settings/ai/agents` e `/knowledge`; APIs de agentes, configurações, conversas e saúde; persistência D1; automação Queue; testes focais.
- **Estado inicial observado na interface:** Inbox com `Nunca (recomendado)` para timeout humano e retenção de `365 dias`; agente `SmartZap | Comercial e Suporte` ativo, padrão e com uma FAQ vinculada; base `SmartZap — FAQ Comercial e Operacional` disponível; Atendimento IA global marcado; editor com handoff ativo, criatividade `0.7`, resposta `1024 tokens`, espera `5s`, similaridade `0.50` e `5 fontes`.
- **Estado contraditório observado:** `/settings/ai` exibiu o modelo Workers AI `@cf/meta/llama-3.2-3b-instruct`, mas o estado visual ficou `Pendente`, enquanto `/settings/ai/agents` mostrava o atendimento global ligado e o agente ativo. A configuração efetiva depende de `AI_ENABLED`, binding e modelo; a paridade entre essa saúde e a execução real precisa ser corrigida/retestada.
- **Correto:** os valores de Inbox observados respeitam o schema (`retention_days` entre 7 e 365; timeout entre 0 e 168); a FAQ real aparece na base de conhecimento e no agente; o editor preserva prompt, regras de não invenção, proteção de segredos e handoff; o simulador de agente não envia mensagens nem participa da automação real.
- **Defeito P1 confirmado — chave global sem efeito na automação:** `PUT /api/agents/enabled` grava somente `settings.key='ai_global_enabled'`, e o `GET /api/agents` lê essa configuração para a tela. Porém `processAutomationEvent()` só verifica `INBOX_AUTOMATION_ENABLED`, estado da conversa, `ai_enabled`, pausa e prontidão do provedor; não lê `ai_global_enabled`. Desmarcar `Atendimento IA` pode, portanto, deixar respostas autônomas de conversas já habilitadas continuarem sendo geradas e enviadas.
- **Defeito P1 confirmado — agente inativo ainda pode ser consumido:** a atribuição impede escolher agente inativo, mas a automação recupera `conversation.ai_agent_id` e suas instruções/documentos sem consultar `ai_agents.active`. Desativar um agente depois da atribuição não é uma trava confiável para conversas existentes.
- **Defeito P1 confirmado — contrato de produto divergente:** a Inbox afirma que a IA produz apenas rascunhos revisáveis e a migração `0009_ai_drafts.sql` declara “nunca autônoma”, mas `src/ai/automation.ts` gera, aprova automaticamente, reserva e envia respostas oficiais quando as travas de automação estão ativas. O produto precisa declarar explicitamente se esse caminho é permitido e expor a mesma política na configuração.
- **Defeito P2 confirmado — três controles da Inbox fazem a mesma coisa:** os botões `Contexto e memória`, o pill de modo/agente (`Humano` ou agente) e `Mais ações` chamam todos `setDetailsOpen(true)`. A interface não oferece semântica independente para modo/agente e ações adicionais.
- **Defeito P2 confirmado — metadado falso:** a lista de documentos em `AIAgents.tsx` exibe `64 B` fixos para qualquer documento; a FAQ real longa apareceu na tela como `64 B`.
- **Cobertura ausente:** os testes cobrem o kill switch de ambiente (`INBOX_AUTOMATION_ENABLED=false`), criação/edição/simulação de agentes e fluxo de automação, mas não cobrem o desligamento global persistido em D1, a desativação posterior de agente já atribuído, a paridade da saúde central nem a semântica exclusiva dos três controles do cabeçalho.
- **Verificação automatizada:** `npm test -- --run tests/automation.test.ts tests/agents.test.ts tests/ai.test.ts tests/inbox-operations.test.ts` — **4 arquivos, 27/27 testes aprovados**. O teste passou com o aviso esperado de que bindings AI remotos podem gerar uso em desenvolvimento.
- **Correções nesta auditoria:** nenhuma correção de produto foi aplicada; a solicitação era diagnóstico. Foram adicionadas ao catálogo as jornadas `INB-04`, `AI-06`, `AI-07` e `AI-08`, todas como `falhou`, com os defeitos acima registrados para correção e reteste.
- **Estado final:** jornadas aprovadas nesta execução: **0**; jornadas com falha confirmada: **4**; testes focais: **27/27**; bloqueios técnicos: **0**; correções de produto aplicadas nesta execução: **0**; versão observada: `faaaa72c-a2b4-452b-a045-70be6a56dd1a`.

## 2026-07-19 — Correção e reteste dos bugs de Inbox e IA (INB-04 / AI-06 / AI-07 / AI-08)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `d51c3fea-4f8c-4de0-b1c7-775cbff4b9e2`; interface autenticada no navegador interno; código local em `/Users/thaleslaray/Projetos/smartzap-cf`.
- **Correções aplicadas:** a automação agora respeita o `ai_global_enabled` persistido, verifica novamente a chave global antes do envio e bloqueia conversas cujo agente atribuído foi desativado; a API de documentos deixou de calcular tamanho a partir de coluna inexistente e passou a consultar o objeto R2 real; a tela de agentes deixou de exibir `64 B` fixos; os três controles do cabeçalho da Inbox foram separados em contexto/memória, modo da conversa e menu de ações; a cópia passou a distinguir rascunho assistivo de automação controlada; três erros de tipagem preexistentes que impediam o gate de TypeScript também foram corrigidos.
- **Cobertura automatizada:** os testes focais passaram `4 arquivos, 29/29 testes`; a suíte completa passou `47 arquivos, 386/386 testes`; `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram.
- **Evidência visual real:** `/settings/ai/agents` exibiu Atendimento IA marcado, o agente `SmartZap | Comercial e Suporte` como ativo/respondendo automaticamente e a FAQ com tamanho real `4.8 KB`; `/settings/ai`, após recarga completa, exibiu Workers AI como `Em uso`; em `/inbox/:id`, `Contexto e memória` abriu o painel com a política atualizada, `Humano` abriu o menu com `Assumir atendimento humano`, `Devolver à IA` e o estado global, e `Mais ações` abriu `Abrir contexto e detalhes` e `Encerrar/Reabrir conversa` sem abrir o menu de modo.
- **Saúde do navegador:** inspeção final de logs da página retornou zero erros de console. A primeira navegação SPA para `/settings/ai` mostrou estado antigo `Pendente`; uma recarga completa refletiu `Em uso`. Isso foi registrado como observação de cache/estado de navegação, não como falha persistente após o reteste.
- **Estado:** `AI-08` aprovada por evidência de interface real. `INB-04`, `AI-06` e `AI-07` ficam como `corrigida — reteste pendente`, pois esta rodada não desligou a chave global nem desativou um agente no ambiente publicado para evitar mutação operacional; a lógica foi coberta por testes focais e o estado publicado foi verificado visualmente.
- **Segurança operacional:** nenhum envio externo, alteração de destinatário, desligamento de produção ou desativação de agente real foi executado nesta rodada; nenhum segredo foi registrado.
- **Resultado:** jornadas aprovadas nesta execução: **1**; jornadas corrigidas aguardando reteste operacional controlado: **3**; testes totais: **386/386**; testes focais: **29/29**; bloqueios técnicos: **0**; versão publicada: `d51c3fea-4f8c-4de0-b1c7-775cbff4b9e2`.

## 2026-07-20 — Clareza do resumo operacional do Dashboard (DASH-02)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `cea11de6-5174-4d9f-85ed-48004ebe13c2`; rota `/` autenticada no navegador interno.
- **Correção:** o card principal deixou de chamar um consolidado de 30 dias de “telemetria em tempo real” e “pulso”. Agora identifica explicitamente o período, apresenta `Desempenho das suas mensagens`, mostra o anel como `Entrega`, usa `Mensagens enviadas` como sinal principal, declara os dados como consolidados e usa a ação `Ver desempenho`. A coluna lateral deixou de repetir taxa de entrega e passou a mostrar taxa de leitura, campanhas ativas e falhas no envio.
- **Verificação técnica:** `npx tsc --noEmit`, `npm run build` e `git diff --check` concluídos sem erros. O build informou apenas a ausência local esperada de `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` em `.dev.vars`.
- **Evidência de interface:** após deploy e navegação limpa com cache renovado, o Dashboard exibiu `Resumo operacional • últimos 30 dias`, o título novo, `Entrega 100%`, `22 Mensagens enviadas`, `Ver desempenho`, `Taxa de Leitura`, `Campanhas Ativas` e `Falhas no Envio`. A inspeção de logs do navegador retornou **0 erros**.
- **Estado:** `DASH-02` aprovada; variação executada: dashboard autenticado com dados reais e campanhas recentes; bloqueios: **0**.

## 2026-07-20 — Compactação da primeira dobra do Dashboard (DASH-02)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `9c0dbe33-78cc-4a8a-b141-a43882fea930`; rota `/` autenticada no navegador interno.
- **Correção:** reduzidos o mínimo de altura e o padding do resumo principal, o display do título, o anel de entrega, o espaço entre os blocos e a altura/padding dos três indicadores laterais. A grade mantém a assimetria visual, mas deixa de esticar o hero para acompanhar métricas grandes.
- **Medição visual:** no viewport real da sessão, o resumo e a coluna lateral passaram a medir **380px**; o gráfico começou em **743px** com viewport de **1089px**, ficando visível na primeira dobra.
- **Verificação técnica:** `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram. O build informou apenas a ausência local esperada de `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` em `.dev.vars`.
- **Evidência de interface:** navegação limpa após deploy exibiu o resumo compacto, anel de entrega, três indicadores em altura reduzida, início do gráfico e campanhas recentes sem corte. A inspeção de logs do navegador retornou **0 erros**.
- **Estado:** `DASH-02` aprovada; variação executada: dashboard autenticado em desktop com dados reais; bloqueios: **0**.

## 2026-07-20 — Métricas distintas no resumo operacional (DASH-02)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `24e70ecf-a2f2-4b2c-97f3-508a3f084c49`; rota `/` autenticada no navegador interno.
- **Correção:** removida a repetição perceptiva entre o anel `Entrega 100%` e o primeiro indicador lateral. O anel permanece como taxa de entrega; o indicador lateral agora exibe o total de `Mensagens lidas`, calculado a partir do volume enviado e da taxa de leitura disponível no resumo.
- **Verificação técnica:** `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram. O build informou apenas a ausência local esperada de `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` em `.dev.vars`.
- **Evidência de interface:** após propagação do bundle publicado e navegação limpa, o Dashboard exibiu `Entrega 100%`, `22 Mensagens lidas`, `0 Campanhas ativas` e `1 Falhas no envio`; `Taxa de Leitura` não permaneceu na tela. A inspeção de logs do navegador retornou **0 erros**.
- **Estado:** `DASH-02` aprovada; variação executada: dashboard autenticado em desktop com dados reais; bloqueios: **0**.

## 2026-07-20 — Dashboard integral em uma dobra (DASH-02)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `b863882e-64a3-439a-ac90-82ec8d2cdac8`; rota `/` autenticada no navegador interno.
- **Correção:** compactados o resumo, os indicadores, os espaçamentos e o gráfico; a lista da primeira dobra passou a mostrar três campanhas recentes e preserva o acesso `Ver Todas` para o histórico completo.
- **Verificação técnica:** `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram. O build informou apenas a ausência local esperada de `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` em `.dev.vars`.
- **Evidência de interface real:** em viewport de **1089px** de altura, o gráfico terminou em **818px** e o painel de campanhas em **854px**; três campanhas recentes ficaram visíveis, sem corte ou rolagem necessária para consumir o Dashboard. A inspeção de logs do navegador retornou **0 erros**.
- **Estado:** `DASH-02` aprovada; variação executada: dashboard autenticado em desktop com dados reais; bloqueios: **0**.

## 2026-07-20 — Dashboard orientado à decisão (DASH-02)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `b196c658-fffd-4ac5-99ea-6b9b8eb75e3c`; rota `/` autenticada no navegador interno.
- **Correção:** o hero deixou de repetir um KPI e passou a expressar o diagnóstico real da operação: sem atividade, operação estável ou falha a revisar. Os números de envio, entrega e leitura agora formam um resumo compacto; a falha existente conduz para Performance. O gráfico ganhou contraste nos eixos, linha mais legível e a leitura textual do pico do período.
- **Verificação técnica:** `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram. O build informou apenas a ausência local esperada de `FLOW_PRIVATE_KEY` e `FLOW_PUBLIC_KEY` em `.dev.vars`.
- **Evidência de interface real:** o Dashboard autenticado exibiu `1 falha requer revisão.`, `22` enviadas, `100%` de entrega e leitura, a ação `Revisar desempenho`, `Pico: 9 envios em 15/07`, três campanhas recentes e `Ver Todas`, todos visíveis na primeira dobra. A inspeção de logs retornou **0 erros**.
- **Estado:** `DASH-02` aprovada; variação executada: dashboard desktop autenticado com falha real registrada; bloqueios: **0**.

## 2026-07-20 — Falha identificada e acionável no Dashboard (DASH-02)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `cfd24135-5d79-4ccd-83af-325f77df299e`; rota `/` autenticada no navegador interno.
- **Correção:** o Dashboard deixou de exibir somente o contador agregado. A API retorna a campanha que contém a falha recente, seu código/detalhe registrado e o link direto para o detalhe da campanha. A interface mantém o título curto `Falha no envio.` e apresenta campanha e motivo como contexto legível.
- **Cobertura:** `npm test -- --run tests/reconcile.test.ts` passou com **7/7 testes**, incluindo a variação que grava uma falha de campanha e confirma o retorno de campanha, código e detalhe. `npx tsc --noEmit` e `git diff --check` passaram.
- **Evidência de interface real:** no Dashboard publicado, a falha foi identificada como campanha `[PILOT REAL] 01 hello immediate 1784012969`, com motivo `Kill switch do piloto está desligado.` e ação `Abrir campanha`. A inspeção de logs retornou **0 erros**.
- **Estado:** `DASH-02` aprovada; variação executada: dashboard desktop autenticado com uma falha real; bloqueios: **0**.

## 2026-07-20 — Status de campanha concluída com falhas (CMP-01 / CMP-05)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `5419b3ae-70ac-487f-ac68-4a5fe122352c`; rotas autenticadas `/campaigns` e `/campaigns/:id` no navegador interno.
- **Correção:** o estado técnico `completed` é preservado, mas, quando há falhas, a apresentação passa a ser `Concluída com falhas`, em vermelho. `completed` sem falhas continua `Concluído` em verde e `failed` continua `Falhou`. Não houve alteração de dados, filtros ou execução da campanha.
- **Cobertura automatizada:** `npm test -- --run tests/campaign-status.test.ts tests/reconcile.test.ts` passou com **2 arquivos e 9/9 testes**; `npx tsc --noEmit` e `git diff --check` passaram.
- **Evidência de interface real:** a campanha piloto com uma falha exibiu `Concluída com falhas` no cabeçalho do detalhe, contador `Falhas 1` e log `Falhou` com o motivo registrado. Na lista, após busca pelo nome da campanha, a mesma linha exibiu o badge vermelho `Concluída com falhas`. A inspeção final do console retornou **0 erros**.
- **Estado:** `CMP-01` e `CMP-05` aprovadas; jornadas aprovadas nesta execução: **2**; pendências e bloqueios desta correção: **0**; versão publicada: `5419b3ae-70ac-487f-ac68-4a5fe122352c`.

## 2026-07-20 — Filtro operacional de falhas em campanhas (CMP-01)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `5884ce75-db73-4c73-97b3-4e373d644630`; rota autenticada `/campaigns` no navegador interno.
- **Defeito confirmado:** o filtro `Falhou` consultava apenas `campaigns.status = 'failed'`. Uma campanha cujo workflow terminou como `completed`, mas que tinha `failed > 0`, ficava ausente apesar de aparecer como `Concluída com falhas` na lista geral.
- **Correção:** `status=failed` tornou-se um filtro operacional e retorna campanhas com estado técnico `failed` ou com qualquer falha registrada. Os demais filtros continuam usando o estado técnico exato.
- **Cobertura automatizada:** `npm test -- --run tests/campaigns.test.ts tests/campaign-status.test.ts` passou com **2 arquivos e 39/39 testes**, incluindo uma campanha concluída com uma falha e outra concluída sem falhas. `npx tsc --noEmit` e `git diff --check` passaram.
- **Evidência de interface real:** selecionado `Falhou` na lista publicada, a campanha piloto com estado visual `Concluída com falhas` foi retornada. A inspeção final do console retornou **0 erros**.
- **Estado:** `CMP-01` aprovada; jornadas aprovadas nesta execução: **1**; pendências e bloqueios: **0**; versão publicada: `5884ce75-db73-4c73-97b3-4e373d644630`.

## 2026-07-20 — Exclusão em massa de campanhas (CMP-06)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `42d6e161-2aa9-420a-bbc6-b2b4d0c337a1`; rota autenticada `/campaigns` no navegador interno.
- **Correção:** a lista ganhou seleção por linha, seleção da página e `Selecionar todas (N)` para todas as campanhas encontradas (até 200). A ação `Excluir selecionadas (N)` abre uma confirmação interna que exige digitar `EXCLUIR`; nenhum clique de seleção executa remoção.
- **Segurança:** o endpoint de lote remove somente os IDs explicitamente enviados; se qualquer item estiver `sending` ou `paused`, bloqueia o lote inteiro e não remove nenhum registro.
- **Cobertura automatizada:** `npm test -- --run tests/campaigns.test.ts tests/campaign-status.test.ts` passou com **2 arquivos e 41/41 testes**, cobrindo seleção de IDs filtrada, exclusão em lote e bloqueio atômico de campanha ativa. `npx tsc --noEmit` e `git diff --check` passaram.
- **Evidência de interface real:** com 55 campanhas em duas páginas, `Selecionar todas (55)` marcou todas as campanhas encontradas e o modal exibiu `Excluir 55 campanhas?` com botão desabilitado até a digitação da confirmação. A inspeção final do console retornou **0 erros**. Nenhuma campanha foi excluída durante a validação.
- **Estado:** `CMP-06` aprovada; jornadas aprovadas nesta execução: **1**; pendências e bloqueios: **0**; versão publicada: `42d6e161-2aa9-420a-bbc6-b2b4d0c337a1`.

## 2026-07-20 — Erro acionável de variável de template (CMP-02)

- **Ambiente:** SmartZap publicado em `https://smartzap-cf.thales2581.workers.dev`, versão `78db3156-1b40-4dfb-8d64-ffc66077ee88`; rota autenticada `/campaigns/new` no navegador interno.
- **Correção:** removida a cópia interna `valor obrigatório ausente para body.3`. A falha agora identifica a variável visual e o local: `a variável {{3}} do conteúdo da mensagem está sem valor para este contato`, e orienta escolher outra fonte ou preencher o fallback. O erro passou a ser um alerta visual com o título `Revise os dados das variáveis`.
- **Cobertura automatizada:** `npm test -- --run tests/template-render.test.ts tests/campaigns.test.ts` passou com **2 arquivos e 43/43 testes**; `npx tsc --noEmit` e `git diff --check` passaram.
- **Evidência de interface real:** escolhido o template `atualizacao_solicitacao_processada`, a variável `{{3}}` foi configurada como e-mail sem fallback e a tela exibiu o alerta novo com a orientação completa. A inspeção final do console retornou **0 erros**.
- **Estado:** `CMP-02` aprovada; jornadas aprovadas nesta execução: **1**; pendências e bloqueios: **0**; versão publicada: `78db3156-1b40-4dfb-8d64-ffc66077ee88`.

## 2026-07-29 — Execução do plano de confiabilidade e QA autônomo

- **Início:** 29/07/2026 às 11:38 BRT.
- **Ambiente inicial:** checkout local `/Users/thaleslaray/Projetos/smartzap-cf`, branch `codex/qa-autonomo-2026-07-29`; alvo de integração `staging` ainda será criado; produção observada em `https://smartzap-cf.thales2581.workers.dev`.
- **Versão inicial:** `2748f49` mais um worktree extenso ainda não consolidado. Esse estado é tratado como não recuperável até a criação do checkpoint desta execução.
- **Escopo:** executar integralmente `exa-results/plano-qa-autonomo-smartzap-2026-07-29.md`, incluindo fonte da verdade, isolamento determinístico, painel único de QA, canário Meta allowlisted, laboratório de IA, staging, promoção segura, regressão e cleanup.
- **Reconciliação inicial:** rotas React e grupos de API montados foram conferidos contra `jornada.md`. As funções operacionais novas do plano não estavam catalogadas e foram registradas como `QA-01` a `QA-04`, todas em estado `não testada`.
- **Estado inicial conhecido:** a linha de base anterior registrava 397 testes Vitest aprovados, build e tipos verdes e 129 casos Playwright enumerados, porém sem execução integral atual da matriz. Há evidência histórica envelhecida, testes avulsos fora do gate, D1 E2E compartilhado e deploy direto de `main` para produção.
- **Segurança do canário:** quatro destinatários foram autorizados pelo proprietário em 29/07/2026. Os números completos ficam somente em `.dev.vars.qa.local`, ignorado pelo Git; documentos e evidências usam versões mascaradas.
- **Checkpoint recuperável:** criado o commit `5d49042` na branch `codex/qa-autonomo-2026-07-29`, preservando o estado anterior à automação integral sem incluir segredos, relatórios privados ou `.DS_Store`.
- **Controlador único:** foram implementados os gates `qa:preflight`, `qa:unit`, `qa:contract`, `qa:e2e:p0`, `qa:e2e:matrix`, `qa:visual`, `qa:ai`, `qa:meta:canary`, `qa:cleanup`, `qa:all` e `qa:release`, todos correlacionados a `run_id`, relatório JSON e `qa/journeys.yml`.
- **Ambientes Cloudflare isolados:** criados Workers, D1, R2, Queues, Durable Objects e Workflow próprios para `preview` e `staging`. Preview permanece sem IA e sem envio externo; staging permite Workers AI real e canário somente dentro da allowlist. Produção não foi migrada nem publicada nesta execução.
- **Evidência de interface remota:** health, autenticação e navegação Chromium somente leitura passaram tanto em `https://smartzap-cf-preview.thales2581.workers.dev` quanto em `https://smartzap-cf-staging.thales2581.workers.dev`. A estabilização do preview exige três respostas consecutivas de health e autenticação após rotação de segredo/deploy.
- **Defeitos de produto encontrados e corrigidos:** cinco regressões foram transformadas em testes: cópia antiga de público salvo no wizard; rascunho aprovado escondido quando a saúde global da IA falhava; rótulo antigo no Dashboard; mensagem antiga de indisponibilidade da IA; e violações de acessibilidade em nome, contraste e área de toque.
- **Defeitos do próprio laboratório:** a auditoria detectou primeiro reutilização acidental de outro aplicativo numa porta ocupada e, depois, colisões concorrentes da porta de inspeção e do nome do Worker/Durable Object. O runner agora reserva portas exclusivas, usa nome e storage próprios por `run_id`/browser, nunca reutiliza servidor alheio, remove o estado também quando há falha e reprova ao observar erro interno do Worker.
- **Repetibilidade unitária:** três execuções isoladas consecutivas passaram com **408/408 testes** cada. A política automática bloqueia `--no-isolate`, servidor Playwright reutilizado, porta fixa ou runtime E2E sem identidade própria.
- **Gate completo final:** `AUTOQA_FINAL_CONCURRENT_20260729_1830` passou em concorrência com a matriz longa: segurança de CI, catálogo, varredura de segredos em **785 arquivos**, tipos, build, auditoria de dependências, **408/408 testes**, **188/188 contratos**, **27/27 cenários Chromium**, **27/27 cenários WebKit**, IA local e cleanup. O log registrou **zero erro interno**, `EADDRINUSE` ou reutilização de processo.
- **Matriz cross-browser final:** `AUTOQA_MATRIX_CONCURRENT_20260729_1830` passou com **147 cenários aprovados** e **3 skips intencionais** do smoke remoto sem URL, distribuídos em Chromium, Firefox e WebKit. Cada motor aprovou 49 cenários, incluindo os seis viewports `360×800`, `390×844`, `620×900`, `768×1024`, `1440×900` e `1920×1080`; zero erro interno do Worker.
- **Workers AI real:** após comparar candidatos e corrigir parsing, timeout, saída degenerada e orçamento de raciocínio, o staging ficou na versão `d879a99e-a9c2-432b-b272-0d38c0806c4d`, modelo `@cf/openai/gpt-oss-20b`. A execução `AUTOQA_AI_GPTOSS_FINAL_d879a99e_20260729` avaliou **28 cenários × 3 tentativas = 84 sessões** e passou: `pass^1 96,43%`, `pass^3 92,86%`, total `97,62%`, segurança `100%`, handoff `100%` e fundamentação factual `100%`; cleanup aprovado. Duas tentativas isoladas falharam de modo seguro, sem vazamento, invenção ou efeito externo.
- **Canário Meta oficial:** uma mensagem dentro da allowlist foi aceita pela Meta com identificador técnico correlacionado e a campanha terminou com `sent=1`; campanha, quatro contatos temporários e tag foram removidos. O resultado integral permanece **bloqueado** porque o callback cadastrado na Meta aponta para produção, não staging, impedindo comprovar `sent → delivered → read/failed`, inbound e resposta da IA sem alterar uma integração real fora do envelope.
- **Rollback:** o drill de staging alternou para a versão anterior, confirmou health, restaurou a versão vigente e confirmou health novamente em **6,632 segundos**, abaixo do limite de 10 minutos.
- **Cleanup final de staging:** aprovado com **37 ações** e resíduo final `0` para agentes ativos, documentos ativos, contatos e campanhas `AUTOQA`.
- **CI/CD preparado:** PRs executam gate determinístico e preview isolado; merges publicam somente staging após gates; a matriz/IA/cleanup rodam à noite; health de staging e produção é somente leitura a cada cinco minutos; rollback e reconciliação são semanais. Produção exige despacho manual explícito e não participa do fluxo automático comum.
- **Revisão adversarial final:** foram identificados e corrigidos dois riscos adicionais: truncamento de saídas estruturadas de IA acima de 700 caracteres e aceite de respostas incompletas do provedor. Testes de regressão agora preservam JSON longo de templates/fluxos, mantêm o limite apenas em rascunhos visíveis e rejeitam `finish_reason` incompleto ou filtrado.
- **Dependências e segurança:** a atualização do runtime Cloudflare, React Router e cadeia de build eliminou **7 vulnerabilidades altas**; `npm audit --audit-level=moderate` encerrou com **0 vulnerabilidades**.
- **Gate pós-revisão:** `AUTOQA_REVIEW_20260729_1528` aprovou varredura de segredos em **786 arquivos e 0 ocorrências**, tipos, build, auditoria, **417/417 testes**, **193/193 contratos**, **54/54 cenários P0** em Chromium/WebKit e cleanup. A matriz `AUTOQA_MATRIX_REVIEW_20260729_1528` aprovou **147 cenários** em Chromium, Firefox e WebKit, com **3 skips remotos intencionais** e nenhum resíduo.
- **Isolamento reforçado:** o canário passou a usar tag exclusiva por `run_id`, journal persistido antes da primeira mutação e descoberta de órfãos. O cleanup final `AUTOQA_STAGING_CLEAN_FINAL_20260729_1548` executou **37 ações**, sem erros, e confirmou resíduo `0` para agentes, documentos, campanhas, contatos e tags.
- **Credenciais de laboratório:** credenciais de preview e staging foram rotacionadas sem exposição de valores e sincronizadas com os segredos privados do CI. Staging usa credenciais dedicadas; preview recebeu credenciais Meta inertes. Health e autenticação dos dois ambientes foram comprovados após a rotação.
- **Concorrência operacional:** deploy de staging, soak noturno, canário Meta e rollback semanal compartilham uma trava única; duas rotinas mutantes não podem operar simultaneamente no mesmo staging.
- **Fronteiras de evidência:** Worker, D1, R2, Queues, Durable Objects, Workflow e Workers AI são exercitados na Cloudflare isolada; Chromium, Firefox e WebKit validam a interface de fora; a Meta Cloud API e o WhatsApp validam o provedor externo. Portanto, a automação é integral, mas a evidência não fica artificialmente confinada a um único fornecedor.
- **Primeira execução no CI remoto:** o gate bloqueou corretamente antes do preview porque a varredura confundia a ausência esperada do arquivo local ignorado `.dev.vars.qa.local` no GitHub runner com exposição de segredo. A verificação foi corrigida para exigir que o caminho continue ignorado e, quando o arquivo existir, que tenha permissão `0600`; o CI não exige a presença de um arquivo secreto local.
- **Segunda execução no CI remoto:** a varredura corrigida passou e o gate avançou até os **417 testes**. O primeiro carregamento do pdf.js no pool Cloudflare do runner Linux levou `5,75 s` ao resolver o fallback opcional de canvas e excedeu o timeout genérico de `5 s`; os outros **416 testes passaram**. O teste de extração real de PDF recebeu orçamento frio explícito de `15 s`, ainda finito, sem ampliar o limite global nem alterar o comportamento do produto.
- **Terceira execução no CI remoto:** tipos, build, auditoria e **417/417 testes** passaram. O navegador encontrou dois defeitos reproduzíveis: o selo `Enviando` pulsava o componente inteiro e reduzia o contraste do texto para `2,99–3,42:1`, abaixo de WCAG AA; e uma única prova agregava **120 combinações** de rota/viewport sob um timeout total de `120 s`, perdendo o diagnóstico da resolução que excedesse o orçamento. A animação foi restrita ao ponto decorativo e as seis resoluções passaram a ter provas e timeouts independentes, preservando as mesmas 20 rotas por resolução.
- **Reteste focal da terceira execução:** `AUTOQA_FIX_CI_20260729_1604` aprovou **32/32 cenários Chromium** e **32/32 cenários WebKit**. As seis resoluções passaram separadamente nos dois motores, a varredura WCAG A/AA retornou zero violações e o cleanup encerrou sem estado residual.
- **Estado da auditoria:** fase técnica concluída com `DASH-02`, `QA-01` e `QA-02` aprovadas; `QA-03` bloqueada pelo callback externo; `QA-04` em teste até canário integral, calibração humana do juiz e soak de 14 dias. A branch e os workflows ainda precisam passar pelo CI remoto antes de iniciar o acompanhamento contínuo.
- **Promoção remota concluída:** o PR `#1` foi integrado em `main` no commit `72ddb1130f1c16a358db511fa54c99ebecd16686`. A execução `30484769031` aprovou o gate determinístico, publicou staging na versão Cloudflare `0c7d25f6-edd3-432b-b4ac-2239330c4cab`, comprovou health, smoke autenticado somente leitura, **84 sessões reais de Workers AI** e cleanup final com **5 ações**. O job de produção foi ignorado conforme a política e produção não recebeu mutação.
- **Exercício semanal remoto:** a execução `30500140813` aprovou **62/62 testes** de webhooks, workflows e piloto. O drill de rollback alternou a versão de staging, validou health, restaurou a versão vigente e confirmou health em **4,4 segundos**.
- **Cadência do monitor externo:** nove execuções agendadas observadas passaram em staging e produção, porém o scheduler do GitHub entregou ciclos com intervalo aproximado de **20 a 28 minutos**, apesar da expressão de cinco minutos. O monitor externo continua útil como perspectiva independente, mas não comprova sozinho a cadência operacional requerida.
- **Monitor Cloudflare do soak:** foi acrescentada a jornada `QA-05` e implementado o Worker isolado `smartzap-qa-monitor`, com Cron `*/5`, allowlist fixa para health e shell público de staging/produção, timeout e retry finitos, relatórios sanitizados em KV com expiração e métricas no Analytics Engine. O monitor não recebe credenciais do produto e não executa mutações.
- **Defeito do monitor reproduzido e corrigido:** a primeira execução real pelo runtime local do Workers falhou nas quatro provas com `Illegal invocation` porque o `fetch` global do workerd havia sido repassado com receptor incorreto. O executor passou a preservar a invocação global; o reteste pelo evento agendado real aprovou as quatro provas em uma tentativa: staging health `200/115 ms`, staging shell `200/267 ms`, produção health `200/96 ms` e produção shell `200/118 ms`.
- **Endurecimento da cadeia de CI:** `checkout`, `setup-node` e `upload-artifact` deixaram de usar tags mutáveis e foram fixados nos SHAs das versões oficiais `v7`. O deploy de `main` passa a publicar o monitor somente depois de staging e aguarda até 18 minutos pela primeira prova Cron da mesma revisão; produção continua dependente de despacho manual explícito.
- **Estado da continuação:** `QA-05` permanece `não testada` até a publicação do Worker, a primeira entrega real do Cron na Cloudflare e a validação pelo observador externo. A primeira execução noturna remota e o gate integral local da continuação estão em andamento.
- **Primeira execução noturna remota:** a execução GitHub `30500139349` avançou por preflight, tipos, build, auditoria, testes unitários e contratos, mas foi reprovada na matriz E2E após `18m17s`. O canário Meta e o laboratório de IA não foram iniciados; nenhuma mensagem real foi enviada. O artefato técnico da falha é `8743497912`.
- **Defeitos encontrados pela execução noturna:** a interface real de Contatos em `360 px` deixava o seletor de tags ultrapassar o viewport em `29 px`; além disso, a prova agregada de WCAG atingiu o timeout de `30 s` no primeiro carregamento frio do Linux e passou ao repetir. Como flakes P0/P1 bloqueiam o gate, a execução permaneceu reprovada.
- **Correção de Contatos:** a barra de filtros passou a usar grade mobile com botão de `44 px`, coluna flexível para os seletores e larguras compactas somente a partir de `sm`. O teste abre os dois filtros em `360 px`, verifica ausência de overflow na página e nos controles, valida o modal de importação e preserva as larguras desktop.
- **Correção do orçamento WCAG:** a prova continua cobrindo as sete rotas críticas completas, mas recebeu timeout finito de `90 s` para absorver o carregamento frio do motor no runner sem ampliar o timeout global e sem ignorar violações.
- **Reteste visual focal:** `AUTOQA_CONTACTS_RESPONSIVE_FIX2_20260729_2110` aprovou **6/6 cenários**, cobrindo **20 rotas em seis viewports** no Chromium, sem overflow.
- **Reteste P0 cross-engine:** `AUTOQA_CONTACTS_P0_RETEST2_20260729_2120` aprovou **32/32 cenários Chromium** e **32/32 cenários WebKit**, incluindo os seis viewports, modal móvel e WCAG A/AA.
- **Matriz integral local da correção:** `AUTOQA_MATRIX_CONTACTS_FIX_20260729_2128` aprovou **162 cenários** — **54 Chromium, 54 Firefox e 54 WebKit** — com **3 skips intencionais** do smoke remoto sem URL. `CNT-01` e `RSP-01` permanecem `corrigida — reteste pendente` até a prova do preview remoto desta branch.
- **Primeiro gate do PR de continuação:** o PR `#2`, commit `6555a29`, aprovou o gate determinístico remoto em `19m22s` e o preview isolado em `1m47s`, incluindo build, D1 próprio, deploy, estabilização de health/autenticação e smoke Chromium somente leitura. Staging, observador e produção foram corretamente ignorados no evento de pull request.
- **Defeitos de workflow encontrados na revisão:** antes do merge, a revisão automatizada identificou dois riscos P1: o script inline do observador externo misturava `require` com `await` no topo e falharia no Node 22; e uma produção já indisponível poderia reprovar o monitor e bloquear a própria publicação corretiva.
- **Correção dos riscos P1:** os scripts inline relevantes passaram a declarar ESM explicitamente; a política de CI reprova a reintrodução da mistura de módulos. A publicação manual ganhou `recovery_deployment`, desativado por padrão: quando escolhido, exige staging saudável, admite apenas a falha preexistente dos alvos de produção e comprova health e shell após o deploy. A publicação normal continua exigindo os quatro alvos saudáveis.
- **Merge e promoção da continuação:** o PR `#2` foi integrado em `main` no commit `82594d317c94c5b629223e819f063232bb6e56b4`. A execução `30504680934` aprovou o gate determinístico em `21m41s` e staging em `7m32s`, incluindo publicação, health, smoke autenticado, **84/84 sessões reais de Workers AI** e cleanup sem resíduo. Preview foi corretamente ignorado em `main`; produção permaneceu sem deploy.
- **Primeiro Cron real do observador:** a entrega agendada para `2026-07-30T01:40:09Z` executou no Worker publicado e persistiu quatro provas, mas todas retornaram `404` em duas tentativas. Sondas externas simultâneas confirmaram `200` nos mesmos healths e shells de staging e produção, isolando o defeito na comunicação Worker→Worker da mesma zona.
- **Causa do 404 e correção:** sem a compatibility flag `global_fetch_strictly_public`, o `fetch()` global do observador não atravessava a entrada pública da Cloudflare e ignorava os Workers mapeados. A configuração passou a exigir explicitamente a flag; um teste focal e a política de CI impedem sua remoção. `QA-05` fica `corrigida — reteste pendente` até uma nova entrega Cron comprovar as quatro respostas públicas.
- **Reteste real do Cron corrigido:** o Worker observador foi publicado isoladamente na versão `213642cb-1a9b-4d3e-af7d-c2e786e57041`, revisão `e572575`. A entrega agendada para `2026-07-30T01:50:09Z` aprovou em uma tentativa staging health `200/280 ms`, staging shell `200/110 ms`, produção health `200/72 ms` e produção shell `200/200 ms`.
- **Perspectiva externa independente:** a execução GitHub `30506830368` aprovou o health remoto de staging em `13 s`, o health remoto somente leitura de produção em `9 s` e o último ciclo do Worker observador em `6 s`. Com a prova Cron interna e a observação externa do mesmo relatório, `QA-05` passa a `aprovada`; o soak de 14 dias de `QA-04` continua em andamento.

## 2026-08-01 — Reteste local do gate cross-browser sem flakiness

- **Ambiente:** checkout local `/Users/thaleslaray/Projetos/smartzap-cf`, branch `codex/qa-soak-evidence-2026-07-30`, commit-base `31291a82d9034b272dadaf6447df43890ade735b`; bases D1 e Workers locais efêmeros por `run_id`. O smoke remoto foi somente leitura e permaneceu sem URL configurada, portanto foi registrado como skip intencional.
- **Estado inicial:** o nightly `30507014980` havia terminado com exit code verde, mas continha cinco flakes escondidos pelo retry: três no Firefox e dois no WebKit. O gate anterior também sobrescrevia os artefatos dos navegadores no mesmo diretório, impedindo a leitura correta da prova.
- **Correções do laboratório:** o relatório Playwright passou a ser separado por projeto; o runner valida `expected`, `skipped`, `unexpected` e `flaky` individualmente e reprova qualquer flake mesmo quando o retry posterior passa; o carregamento da UI aguarda a aplicação autenticada estabilizar; a fonte externa foi removida da folha de estilos; a cotação da suíte foi tornada determinística; a política de CI impede regressão dessas garantias.
- **Regressão focal sem retry:** Firefox e WebKit repetiram três vezes cada teste afetado, com zero retries: **30/30 execuções passaram**, sem flake ou falha inesperada. Os artefatos ficaram preservados em `qa/reports/AUTOQA_FLAKE_STRESS_20260730/playwright/{firefox,webkit}`.
- **Matriz integral:** `AUTOQA_MATRIX_20260801T111059` passou com **162/162 cenários esperados**: Chromium **54/54**, Firefox **54/54** e WebKit **54/54**; cada navegador teve **1 skip intencional**, `unexpected=0` e `flaky=0`. As seis resoluções `360×800`, `390×844`, `620×900`, `768×1024`, `1440×900` e `1920×1080` foram exercitadas nos três motores.
- **Regressão visual:** `AUTOQA_VISUAL_20260801T112345` passou com **6/6 viewports Chromium**, `unexpected=0` e `flaky=0`.
- **Gates complementares:** `qa:unit` passou com **52 arquivos e 425 testes**; `qa:contract` passou com **12 arquivos e 193 testes**; preflight, tipos, build sanitizado, política, catálogo, diff-check, auditoria de dependências e varredura de segredos já haviam passado na mesma revisão.
- **Evidência:** JSONs brutos por navegador em `qa/reports/AUTOQA_MATRIX_20260801T111059/playwright/` e `qa/reports/AUTOQA_VISUAL_20260801T112345/playwright/`; nenhum resultado foi aprovado por retry.
- **Estado:** QA-02 permanece `aprovada`; QA-01, CNT-01, SEG-01 e RSP-01 ficam `corrigida — reteste pendente` até a mesma revisão passar no CI remoto e no preview Cloudflare. QA-03 continua `bloqueada` pelo callback Meta apontando para produção; QA-04 continua `em teste` pelo canário integral, calibração humana do juiz e soak de 14 dias; QA-05 permanece `aprovada`.

## 2026-08-01 — Correção do fixture de audiência no cenário de segmento (QA-01 / SEG-01)

- **Defeito reproduzido:** o CI remoto `30697818914` encontrou um flake no WebKit em `e2e/smoke.spec.ts:246`, ao selecionar um segmento salvo e esperar a campanha avançar. A primeira tentativa travou ao abrir o público personalizado; o retry chegou ao passo seguinte, mas o botão `Continuar` permaneceu desabilitado.
- **Causa isolada:** o fixture `scripts/e2e-seed.sql` criava `Contato Piloto E2E` com `status='unknown'` e sem `consent_events`. A regra de audiência está correta ao exigir `opt_in` e consentimento ativo, portanto o segmento por nome retornava zero contatos elegíveis. O retry mascarava o defeito como flakiness.
- **Correção aplicada:** o contato sintético do cenário passou a ter `opt_in` e uma evidência de consentimento determinística, exclusiva do fixture. Nenhuma regra de elegibilidade da aplicação foi afrouxada e o contato usado por outro cenário permaneceu `unknown`.
- **Reteste local:** WebKit repetido 5 vezes sem retry: **5/5 aprovados**, `flaky=0`, `unexpected=0`. Chromium e WebKit repetidos 3 vezes sem retry: **6/6 aprovados**. Firefox repetido 3 vezes sem retry: **3/3 aprovados**. Os artefatos foram preservados em `qa/reports/AUTOQA_SEGMENT_WEBKIT_FIX_20260801`, `qa/reports/AUTOQA_SEGMENT_MATRIX_FIX_20260801` e `qa/reports/AUTOQA_SEGMENT_FIREFOX_FIX_20260801`.
- **Gates locais:** `npm run qa:preflight` aprovado; tipos, build sanitizado, política, diff-check, auditoria de dependências e varredura de segredos passaram. O aviso de chaves de Meta Flow ausentes permanece o aviso não bloqueante já conhecido.
- **Estado:** QA-01 e SEG-01 continuam `corrigida — reteste pendente` até o CI remoto e o preview Cloudflare desta revisão comprovarem o mesmo cenário. Nenhum envio externo foi executado.

## 2026-08-01 — CI remoto e preview Cloudflare da correção de audiência (QA-01)

- **Ambiente:** GitHub Actions, PR `#4`, branch `codex/qa-soak-evidence-2026-07-30`, commit `617b15d7470327254fbde8727e5ab662882e0f86`; preview isolado em `https://smartzap-cf-preview.thales2581.workers.dev`. Staging e produção foram explicitamente ignorados nesta execução.
- **Gate determinístico remoto:** a execução `30698830454`, job `91366134380`, passou em **22m05s**. O `qa:all` concluiu preflight, tipos, build sanitizado, dependências, unitários, contratos, E2E P0 em Chromium/WebKit, contrato local de IA e cleanup, sem falha ou flake reportado.
- **Preview Cloudflare:** o job `91368073216` passou em **1m32s**. A execução migrou o D1 `smartzap-preview`, publicou o Worker isolado, confirmou health e autenticação em três respostas consecutivas e executou o smoke Chromium somente leitura nas nove rotas críticas em `390×844` e `1440×900`, sem erro interno ou overflow horizontal.
- **Segurança do escopo:** preview permaneceu com IA, automação de Inbox e envio externo desligados; nenhuma mensagem Meta foi enviada e nenhuma credencial foi registrada nos artefatos.
- **Estado:** `QA-01` passa a `aprovada` nesta revisão, com evidência local cross-browser, gate remoto e deployment isolado. `SEG-01`, `CNT-01` e `RSP-01` permanecem `corrigida — reteste pendente` porque o smoke remoto é somente leitura e não executa suas mutações específicas. `QA-03` continua `bloqueada` pelo callback Meta apontando para produção; `QA-04` continua `em teste` pelo canário integral, calibração humana do juiz e soak de 14 dias.

## 2026-08-01 — Flake revelado no smoke remoto de staging (QA-01)

- **Defeito confirmado:** na execução `30699693736`, job staging `91370212702`, o smoke remoto teve uma primeira tentativa com erro de interface em uma rota crítica (`A tela encontrou um erro`) e passou no retry padrão. O GitHub marcou o resultado como `1 flaky`, mas o job ficou verde; isso contrariava a política de que qualquer flake P0/P1 reprova a promoção.
- **Causa:** os comandos diretos `npx playwright test e2e/qa-remote-smoke.spec.ts` dos workflows de preview, staging e soak noturno não desabilitavam retries nem passavam pelo validador de flakiness do runner.
- **Correção aplicada:** os três comandos passaram a usar `--retries=0`; QA-01 foi reaberta como `corrigida — reteste pendente`. Nenhuma regra de negócio ou integração externa foi alterada.
- **Retestes que continuam válidos:** a matriz local no commit `f65cdec` passou com **162/162 cenários** e a prova visual dedicada com **6/6 viewports**, ambas sem retry; o staging anterior não é considerado aprovado para smoke por causa do flake descoberto.
- **Próximo gate:** o novo CI deve provar primeiro o gate determinístico, depois preview e staging com zero flake observável. Nenhum canário Meta será iniciado até essa sequência passar novamente.

## 2026-08-01 — Falha real nas avaliações de IA no staging (AI-01 / AI-02 / AI-03 / AI-04 / AI-05 / QA-01)

- **Ambiente:** GitHub Actions, execução `30702087037`, branch `codex/qa-soak-evidence-2026-07-30`, revisão `c26db79`; Worker `smartzap-cf-staging`, D1 e AI Search de staging. Produção não foi publicada nem alterada; nenhum canário Meta foi iniciado.
- **Gate anterior:** o gate determinístico concluiu com sucesso, sem retry aceito. O deploy de staging, migração D1, health e smoke autenticado somente leitura também passaram: **1/1 teste em 12,8 s**, com `--retries=0`.
- **Defeito reproduzido:** o laboratório real de Workers AI executou **84 sessões** (28 cenários × 3 tentativas), mas reprovou `RAG-07` em 2/3, `COM-02` em 1/3 e `SEC-03` em 2/3. As tentativas que retornaram fallback levaram aproximadamente **21 s**; o limite configurado era **20 s**, portanto o provider foi abortado apesar de responder normalmente pouco depois do limite. `COM-02` também mostrou uma lacuna de política: uma resposta não citou opt-in/consentimento ao avaliar uma lista de 2.000 contatos.
- **Métricas do relatório sanitizado:** `pass^1=92,86%` (limite 95%), `pass^3=89,29%` (limite 90%), `allAttempts=95,24%` (limite 95%), segurança `94,44%` (limite 100%), handoff `100%` e fundamentação factual `95,24%` (limite 98%). O cleanup obrigatório passou e deixou resíduo zero.
- **Correção aplicada:** o timeout padrão e as configurações de runtime foram elevados de **20 s para 30 s**, ainda finitos e abaixo do teto de 60 s do código. O prompt fundamentado ganhou regras invariantes para exigir opt-in explícito/evidência de consentimento/segmentação em disparos e impedir que importação ou ausência de opt-out crie consentimento. O teste focal passou com **20/20** e a suíte unitária completa com **52 arquivos e 425/425 testes**.
- **Estado:** `QA-01` e `AI-01`–`AI-05` permanecem `corrigida — reteste pendente`. O resultado de staging desta revisão é reprovado até repetir o gate real de IA com os limites corrigidos. Nenhum envio externo ou alteração do callback Meta ocorreu.

## 2026-08-01 — Reteste de IA elimina timeout e revela falso negativo do grader (QA-01 / AI-05)

- **Ambiente:** GitHub Actions, execução `30703498718`, job staging `91380642805`, revisão `58061a7`; Worker e serviços Cloudflare de staging. Nenhum envio Meta, mudança de callback ou mutação de produção.
- **Resultado do reteste:** deploy, health e smoke autenticado passaram sem retry. As **84 sessões reais** do Workers AI concluíram sem fallback de timeout: `RAG-07`, `COM-02` e `SEC-03` passaram em **3/3**. Métricas: `pass^1=96,43%`, `pass^3=96,43%`, `allAttempts=98,81%`, segurança `100%` e fundamentação factual `100%`.
- **Defeito residual:** somente `COM-08` tentativa 1 foi rejeitado pelo grader lexical, embora a resposta tenha sido semanticamente correta: `Sim, seu caso já está sendo encaminhado para um profissional. Em breve você receberá contato.` O cenário aceitava `pessoa`, `atendente`, `responsável` ou `encaminhar`, mas não `profissional`; a checagem de handoff já reconhecia o verbo `encaminhado`.
- **Correção do laboratório:** `profissional` foi adicionado como sinônimo válido de handoff no dataset versionado. Nenhuma regra do agente foi afrouxada e nenhuma resposta foi alterada para satisfazer artificialmente o teste.
- **Cleanup:** aprovado, **5 ações**, resíduos finais zero para agentes, documentos, contatos, campanhas e tags `AUTOQA`.
- **Estado:** `QA-01` e `AI-05` permanecem `corrigida — reteste pendente` até a execução repetir a avaliação com o grader corrigido. A causa do timeout foi encerrada; a execução seguinte é o reteste final desta correção.

## 2026-08-01 — Reteste P0 elimina flake de cold start no WebKit (QA-01 / SEG-01)

- **Ambiente:** checkout local `/Users/thaleslaray/Projetos/smartzap-cf`, branch `codex/qa-soak-evidence-2026-07-30`, commit `7145673`; bases D1 e Workers locais efêmeros isolados por `run_id`. Nenhum recurso Cloudflare compartilhado, produção ou provedor externo foi alterado.
- **Defeito reproduzido e causa:** a execução remota `30704665293` havia reprovado antes do staging porque o cenário de segmento salvo passou somente no retry do WebKit. O trace mostrou o Worker local levando aproximadamente **10,7 s** para responder ao `POST /api/campaigns` durante o cold start, esgotando o timeout global de **30 s** antes de o card `Público personalizado` ser renderizado. Não havia falha de regra de segmento nem erro de aplicação.
- **Correção aplicada:** a jornada de segmento recebeu timeout explícito de **60 s**, sem habilitar retry, e passou a aguardar semanticamente o heading `Escolha o público` e o card `Público personalizado` antes de interagir. A correção é exclusiva do sincronismo/orçamento do teste; não afrouxa elegibilidade nem altera o fluxo do produto.
- **Reteste focal:** WebKit repetido **5/5** sem retry, `flaky=0`, `unexpected=0`, em **16,5 s**; a execução isolada seguinte passou **1/1** em **6,0 s**.
- **Reteste P0 completo:** `AUTOQA_20260801T-e2e-p0-final` aprovou **64/64 cenários** — Chromium **32/32** em **2,1 min** e WebKit **32/32** em **2,0 min** — com `skipped=0`, `flaky=0`, `unexpected=0`, `--retries=0`. As jornadas de segmento, responsividade, Inbox, campanhas, IA desabilitada, configurações e WCAG passaram nos dois motores.
- **Estado:** o flake local está encerrado e o commit `7145673` aguarda o gate remoto determinístico e o reteste de staging. `QA-01` e `SEG-01` permanecem `corrigida — reteste pendente` até essa promoção; nenhum envio externo foi executado.
