# Auditoria de paridade — Contatos

Data: 17/07/2026  
Original: `/Users/thaleslaray/Projetos/smartzap`  
Migrado: `/Users/thaleslaray/Projetos/smartzap-cf`  
Rotas comparadas: `http://127.0.0.1:3100/contacts` e `http://127.0.0.1:5174/contacts`

## Critério

Este documento mapeia toda a superfície da aba Contatos encontrada no código e na interface do SmartZap original, confrontando-a com a implementação migrada. `Interface` significa que a tela foi aberta nos dois servidores; `código` significa que a variação foi confirmada diretamente nos componentes, controladores ou APIs. Recursos existentes somente no migrado também são registrados para impedir que uma correção de paridade os remova por acidente sem decisão explícita.

## Inventário completo

| ID | Ponto da jornada | SmartZap original | SmartZap migrado | Evidência | Resultado de paridade |
| --- | --- | --- | --- | --- | --- |
| CT-01 | Cabeçalho | Título, descrição, importar por ícone, campos personalizados e novo contato | Mesmos grupos, mas espaçamentos, rótulos acessíveis e hierarquia diferem | Interface + código | Parcial |
| CT-02 | Indicadores | Total, Opt-in ativos e Inativos/Opt-out | Mesmos três indicadores | Interface + código | Compatível funcionalmente; revisar medidas visuais |
| CT-03 | Busca | Nome ou telefone, atualização da lista e limpeza por “Limpar filtros” | Nome ou telefone, paginação reiniciada e limpeza | Código + interface | Compatível funcionalmente |
| CT-04 | Filtro de status | Todos, Opt-in, Opt-out, Desconhecido e Suprimidos | Mesmas opções | Código + interface | Compatível funcionalmente |
| CT-05 | Filtro por tag | Todas, sem tags e tags existentes | Mesmas opções, usando IDs internamente | Código + interface | Compatível funcionalmente |
| CT-06 | Alternância dos filtros | Botão existe, mas os selects continuam renderizados no layout original | No migrado o botão efetivamente oculta/exibe os selects | Código + interface | Divergente |
| CT-07 | Contagem e limpeza | “Mostrando X de Y contatos” e botão de limpar | Mesmo conteúdo | Interface + código | Compatível funcionalmente |
| CT-08 | Tabela desktop | Checkbox, contato, tags, status, criação, atividade e ações; `aria-label` da tabela | Mesmas colunas, tabela sem nome acessível explícito | Interface + código | Parcial; falha acessível no migrado |
| CT-09 | Linha do contato | Nome não é ação; editar e excluir são ações separadas | Nome/identificador também abre a ficha de perfil; editar abre a mesma ficha | Interface + código | Divergente |
| CT-10 | Status suprimido | Mostra selo, motivo, fonte e permite remover supressão | Mostra selo, motivo e permite remover supressão; fonte não é exibida | Código | Parcial; informação perdida |
| CT-11 | Estado carregando | Skeleton da página e “Carregando contatos...” na tabela/cartões | Componente de loading separado antes da tabela | Código | Divergente visualmente |
| CT-12 | Estado vazio/sem resultado | “Nenhum contato encontrado.” na tabela ou cartões | Mesma mensagem, com ícone no desktop | Código | Compatível em conteúdo; visual diferente |
| CT-13 | Erro e recuperação | Falhas são tratadas pelo controlador/toasts; não há painel de retry equivalente | Painel `PageError` com retentativa | Código | Recurso adicional no migrado |
| CT-14 | Paginação | Componente anterior/próxima página; quantidade deriva do controlador | Numeração de páginas, anterior/próxima e 50 itens por página | Interface + código | Divergente |
| CT-15 | Seleção de uma linha | Exibe exportar e excluir no cabeçalho | Exibe barra com Limpar, Tags, Campo e Status; exportar permanece no cabeçalho | Interface + código | Divergente |
| CT-16 | Selecionar página/todos | Banner permite promover seleção da página para todos os filtrados e limpar | Barra permite a mesma promoção para todos os filtrados | Código | Compatível funcionalmente, visual diferente |
| CT-17 | Exportar selecionados | Gera CSV em memória somente com os IDs selecionados | Link rotulado “Exportar selecionados” usa apenas busca/status e não envia IDs | Código | **Falhou: pode exportar contatos não selecionados** |
| CT-18 | Exclusão individual | Alerta central “Confirmar Exclusão”, texto genérico e Cancelar/Excluir | Modal “Excluir contato”, inclui nome e informa remoção do histórico | Interface + código | Proteção funcional presente; visual/texto divergentes |
| CT-19 | Exclusão em massa | Ação visível ao selecionar; confirmação usa quantidade | API de exclusão individual existe, mas a barra de seleção não oferece exclusão em massa | Interface + código | **Falhou: jornada removida** |
| CT-20 | Novo contato | Modal compacto: Nome Completo, Telefone, E-mail, Tags, campos personalizados tipados e Salvar Contato | Modal maior: Nome, Telefone, E-mail, confirmação de consentimento, Cancelar e Adicionar; sem tags/campos | Interface + código | **Falhou: campos e desenho removidos** |
| CT-21 | Validação ao criar | Telefone obrigatório; serviço/controlador valida persistência | Telefone obrigatório, declaração de opt-in obrigatória e conflito de duplicidade | Código | Regra nova legítima, mas precisa ser integrada ao desenho original |
| CT-22 | Editar contato | Modal compacto com Nome Completo, Telefone, E-mail, Tags, campos personalizados e Status | Ficha extensa com dados, tags, campos, memória e histórico; não oferece Status no bloco principal | Interface + código | **Falhou: fluxo substituído** |
| CT-23 | Campos personalizados | Sheet lateral “Gerenciar Campos”; nome gera chave automaticamente; lista campos de sistema e personalizados | Modal central “Organização de contatos”; mistura tags; exige chave e tipo manualmente | Interface + código | **Falhou: fluxo e desenho substituídos** |
| CT-24 | Tipos de campo | Criação pela tela original fixa `text`; inputs existentes suportam texto, número, data e select | Criação permite texto, número, data e booleano | Código | Recurso adicional; compatibilizar sem alterar o caminho simples original |
| CT-25 | Gestão de tags | Tags são digitadas no contato/importação; não há gerenciador global na tela original | Criação/remoção global de tags foi colocada no modal de campos | Interface + código | Recurso adicional no lugar errado |
| CT-26 | Importação — início | Upload por arquivo, clique/arrastar, `.csv`, até 5 MB e dica de cabeçalhos | Textarea para colar CSV e campos técnicos de colunas | Interface + código | **Falhou: jornada visual removida** |
| CT-27 | Importação — mapeamento | Etapa 2: autodetecção e selects para nome, telefone obrigatório, e-mail, tags e tag padrão | Nomes das colunas são digitados manualmente no mesmo modal | Código | **Falhou: autodetecção/assistente removidos** |
| CT-28 | Importação — campos personalizados | Sheet de mapeamento, criação/remoção de campos e contagem de campos vinculados | Inputs manuais por campo existente; não cria campo durante importação | Código | **Falhou: capacidade removida** |
| CT-29 | Importação — prévia | Estatísticas de total, novos, existentes, duplicados no CSV e inválidos; tabela de três linhas | Não há prévia antes de confirmar | Código | **Falhou: prevenção de erro removida** |
| CT-30 | Importação — resultado | Etapa 3 com linhas, novos, atualizados, ignorados, inválidos, autocorreção de telefone e orientação de formato | Mensagem inline com importados, duplicados e inválidos | Código | **Falhou: resultado/correção removidos** |
| CT-31 | Consentimento na importação | Original não mostra declaração explícita | Migrado exige declaração de opt-in antes de importar | Interface + código | Regra adicional de conformidade; deve entrar no assistente original |
| CT-32 | Tags em massa | Há componente antigo no repositório, mas ele não é montado na tela original atual | Adicionar, remover ou substituir tags pela barra de seleção | Código + interface | Recurso adicional somente no migrado |
| CT-33 | Status em massa | Há componente antigo no repositório, mas ele não é montado na tela original atual | Unknown, opt-out e opt-in; opt-in exige confirmação | Código + interface | Recurso adicional somente no migrado |
| CT-34 | Campo em massa | Não existe na tela original atual | Preenche texto, número, data ou booleano para selecionados | Código + interface | Recurso adicional somente no migrado |
| CT-35 | Perfil | Não existe ficha clicável na lista original | Ficha reúne dados, tags, campos, memória e histórico | Interface + código | Recurso adicional; não deve substituir “Editar Contato” |
| CT-36 | Memória | Não existe na aba Contatos original | Criar, versionar e apagar memória do contato | Interface + código | Recurso adicional; preservar em ação/ficha separada |
| CT-37 | Histórico | Não existe na aba Contatos original | Eventos de dados, tags, campos, status e memória | Interface + código | Recurso adicional; preservar em ação/ficha separada |
| CT-38 | Cartões mobile | Abaixo do breakpoint, substitui tabela por cartões com seleção, status, tags, supressão, datas, editar e excluir | Também usa cartões abaixo de `md`, com estrutura própria e perfil clicável | Código | Mesma estratégia, medidas e comportamento divergentes |
| CT-39 | Modais em tela pequena | Modais compactos com `p-4`, largura máxima e sheet em largura total | Modal genérico tem rolagem e largura própria | Código | Necessita comparação visual por viewport na correção |
| CT-40 | Foco/teclado | O importador não recebe foco inicial, Escape não fecha e o foco fica no botão interno | O botão Fechar recebe foco; Escape fecha e devolve o foco ao gatilho Importar CSV | Interface + código | Migrado é superior; preservar acessibilidade ao restaurar o visual |
| CT-41 | Identificação Meta | Original lista principalmente telefone | Migrado aceita telefone, BSUID/user ID e username como identificador alternativo | Código | Recurso novo necessário; preservar no layout original |
| CT-42 | APIs e persistência | Supabase/Postgres, serviços separados para contatos/campos/supressão/importação | Worker/D1, endpoints de CRUD, IDs, import/export, tags, campos, perfil, histórico e memória | Código | Backend ampliado; divergência principal está na composição da interface |

## Componentes autoritativos localizados

### Original

- `app/(dashboard)/contacts/page.tsx`
- `app/(dashboard)/contacts/ContactsClientWrapper.tsx`
- `components/features/contacts/ContactListView.tsx`
- `components/features/contacts/list/ContactFilters.tsx`
- `components/features/contacts/list/ContactTable.tsx`
- `components/features/contacts/list/ContactCard.tsx`
- `components/features/contacts/list/ContactAddModal.tsx`
- `components/features/contacts/list/ContactEditModal.tsx`
- `components/features/contacts/list/ContactDeleteModal.tsx`
- `components/features/contacts/list/ContactImportModal.tsx`
- `components/features/contacts/CustomFieldsSheet.tsx`
- `components/features/contacts/CustomFieldsManager.tsx`
- `components/features/contacts/list/ContactFieldMappingSheet.tsx`

Os arquivos `ContactBulkTagsModal.tsx` e `ContactBulkStatusModal.tsx` existem no original, mas não são importados nem montados por `ContactListView.tsx`; portanto não contam como jornada visível do aplicativo original atual.

### Migrado

- `app/pages/Contacts.tsx`
- `app/hooks/useContacts.ts`
- `src/api/contacts.ts`
- `src/db/contacts.ts`
- `tests/contacts.test.ts`
- `tests/contact-profile.test.ts`
- `scripts/e2e-contacts.mjs`
- `scripts/e2e-contact-import.mjs`

## Decisão de equalização derivada

1. Restaurar a composição visual do original para lista, criação, edição, exclusão, campos personalizados e importação.
2. Não remover conformidade de opt-in, BSUID/username, perfil, memória, histórico, operações em massa ou tipos adicionais do backend migrado.
3. Separar “Editar Contato” da ficha avançada: editar deve voltar ao modal original; perfil/memória/histórico ficam em uma ação secundária explícita.
4. Campos personalizados devem voltar ao sheet lateral e gerar chave automaticamente; gestão global de tags deve sair desse sheet.
5. Importação deve voltar ao assistente em três etapas, incorporando a confirmação de opt-in antes da confirmação final.
6. Corrigir exportação selecionada para enviar os IDs reais e restaurar exclusão em massa.
7. Preservar o `dialog`, Escape, foco inicial e retorno de foco do migrado mesmo com o desenho original.

## Cobertura existente e lacunas

Os testes de API cobrem CRUD, validação, importação, duplicidade, campos, consentimento, status, perfil, tags, histórico e memória. Os scripts E2E cobrem seleção global, tags/campo em massa e importação em nível de API. Eles não provam paridade visual, o assistente original de importação, exportação realmente limitada à seleção, exclusão em massa, nem os cinco viewports exigidos. Esses pontos precisam virar cobertura de interface na etapa de correção.

## Evidência executada

- 42 pontos inventariados nesta matriz.
- 23 estados reais capturados em `test-results/contact-surfaces/manifest.json`: lista, sem resultado, seleção, exclusão em massa, novo, editar, excluir, campos personalizados, três etapas da importação original, importador migrado, três operações em massa e perfil/memória/histórico.
- O script reproduzível é `scripts/audit-contact-surfaces.mjs`, executado com sucesso e sem exclusão persistente.
- Comparação visual da lista principal em sete viewports: 1280×720 (3,527%), 1440×900 (3,517%), 1920×1080 (3,406%), 768×1024 (4,777%), 390×844 (4,697%), 360×800 (5,194%) e 320×568 (5,978%) de pixels diferentes.
- Resultado consolidado em `test-results/visual-contacts/summary.json`; o comparador foi ampliado para incluir os viewports obrigatórios de 360 e 1920 px.
- 28 testes de API passaram em `tests/contacts.test.ts` e `tests/contact-profile.test.ts`.
- `scripts/e2e-contacts.mjs` passou, comprovando seleção global, tags em massa e campo em massa com persistência e limpeza do contato temporário.
- `scripts/e2e-contact-import.mjs` passou, comprovando persistência de e-mail, tags, campo personalizado e exportação, com limpeza dos artefatos temporários.
- Busca e estado sem resultado foram executados nos dois aplicativos. O filtro Opt-out do legado local exibiu zero apesar de existir uma linha inicialmente marcada como `OPT_OUT`; isso é uma inconsistência da referência/local data e não deve ser reproduzido como requisito funcional.
- Teste manual de foco: no original, Escape não fechou o importador; no migrado, Escape fechou e o foco retornou ao gatilho.

## Veredito

A superfície da aba Contatos está integralmente mapeada, mas a implementação migrada **não está equalizada**. Foram identificadas 10 falhas críticas de paridade (CT-17, CT-19, CT-20, CT-22, CT-23 e CT-26 a CT-30), além de divergências de composição, navegação, paginação, estados e responsividade. A próxima etapa correta é implementar a equalização usando esta matriz como contrato, não repetir uma auditoria exploratória.
