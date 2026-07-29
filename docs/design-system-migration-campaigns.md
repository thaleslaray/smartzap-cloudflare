# Migração do design system — Campanhas

## Fonte de verdade

- Aplicação: `/Users/thaleslaray/Projetos/smartzap`
- Página inicial da validação: `/campaigns/new`
- Tema de referência: escuro
- Regra: portar decisões visuais e comportamentais; adaptar apenas roteamento, dados e infraestrutura.

## Auditoria inicial

| Superfície | SmartZap original | SmartZap CF antes da migração | Situação |
| --- | ---: | ---: | --- |
| Arquivos relacionados a Campanhas | 81 | 9 | Cobertura insuficiente |
| Tokens `--ds-*` declarados | 87 | 31 | Migração parcial |
| Tokens usados nas páginas de Campanhas | 11 | 6 | Classes avulsas dominavam |
| Assistente de criação | 4 etapas completas | 4 etapas simplificadas | Requer port funcional |
| Preview de template | Renderização do conteúdo | Placeholder textual | Ausente |
| Público | Todos, segmentos, teste e refinamentos | Todos ou segmento salvo | Incompleto |
| Validação | Precheck e correção de destinatários | Totais agregados | Incompleto |
| Agendamento | Fluxo próprio com calendário | Campo na configuração | Estrutura divergente |

## Contrato visual inicial

### Tokens

- Fundo base: `#09090b`
- Fundo elevado: `#18181b`
- Superfície: `#27272a`
- Texto principal: `#f4f4f5`
- Texto secundário: `#a1a1aa`
- Texto discreto: `#71717a`
- Marca: `#10b981`
- Borda padrão: `rgba(255, 255, 255, 0.10)`
- Fonte de corpo: Inter
- Fonte de apresentação: Satoshi com fallback Inter

### Componentes obrigatórios

| Componente | Variantes/estados que precisam existir |
| --- | --- |
| Shell | expandido, compacto, mobile, item ativo, hover, badge |
| Button | primário, secundário, ghost, perigo, disabled, loading |
| Input/Select | default, hover, focus, invalid, disabled |
| Container | default, elevated, surface, subtle, glass |
| Stepper | bloqueado, disponível, atual e concluído |
| Template picker | recentes, recomendados, busca, todos, selecionado, vazio, erro |
| Preview | vazio, hover, selecionado, variáveis e mídia |
| Audience picker | todos, segmentos, teste, estimativa e refinamento |
| Precheck | loading, válido, parcial, bloqueado e correção rápida |
| Scheduling | imediato, agendado, inválido e confirmação |

## Critério de conclusão

Cada estado deve ser capturado no original e no CF em 1280×720, 1440×900,
768×1024, 390×844 e 320×568. A implementação só é aprovada depois de:

1. equivalência estrutural e textual;
2. equivalência de posição, dimensão, cor e tipografia;
3. equivalência de hover, foco, bloqueio, loading, vazio e erro;
4. fluxo E2E funcional contra as APIs Cloudflare;
5. comparação visual automatizada sem diferença material remanescente.

## Migração em andamento

- [x] Tokens fundamentais de tema escuro portados para `app/index.css`.
- [x] Marca original restaurada no shell.
- [x] Seletor inicial de templates reestruturado em Recentes/Recomendados/Todos.
- [x] Navegação, marca, conta, versão e ferramentas do cabeçalho alinhadas ao shell original.
- [x] Agendamento removido da configuração e devolvido ao quarto passo.
- [x] Contrato Cloudflare para reagendamento de rascunhos criado e coberto por teste.
- [x] Preview estrutural do template portado (cabeçalho, corpo, rodapé, mídia e botões).
- [x] Público portado com modos Todos, Segmentos e Teste.
- [x] Segmentos rápidos portados com tags, DDI, UF e combinações alcance/precisão.
- [x] Audiência de teste limitada a um ou dois contatos explicitamente selecionados.
- [x] Resolução de audiência ampliada e coberta por testes de tags, prefixos e contatos de teste.
- [x] Colisão de parâmetros ao combinar segmento salvo e tags eliminada.
- [x] Comparador visual automatizado criado em `scripts/visual-diff-campaigns.mjs`.
- [x] Matriz base cobre 5 resoluções × 5 estados do assistente (25 pares de screenshots).
- [x] Fixtures isoladas impedem que a auditoria visual altere o Supabase real do legado.
- [x] Público, validação parcial e agendamento reestruturados a partir do código-fonte atual do legado.
- [x] Ações visíveis do detalhe alinhadas por estado (iniciar, cancelar agendamento, cancelar envio e atualizar).
- [x] Lista de Campanhas alinhada em desktop, tablet e mobile, inclusive o breakpoint original em 1024 px.
- [x] Cartões mobile restaurados com métricas, entregues, data e ações equivalentes.
- [x] Menus de pasta e tags portados, incluindo filtro múltiplo por interseção.
- [x] Modal de organização portado com criação, edição, cores e remoção de pastas e tags.
- [x] Comparador da lista cobre 5 resoluções × 3 estados interativos (15 pares).
- [x] Detalhe cobre rascunho, agendado, enviando, pausado, concluído e histórico populado em cinco resoluções (30 pares).
- [x] Histórico de envio usa os badges, ícones, cores, horários, erros e ação de correção do legado.
- [x] Correção rápida de contato persiste nome, telefone e campos personalizados sem sair da campanha.
- [x] Reenvio de ignorados revalida opt-in, supressão e variáveis antes de reenfileirar contatos elegíveis.
- [x] Cobertura integral dos 87 tokens originais, verificada por comparação nominal automatizada.
- [ ] Primitivos documentados e sem valores avulsos conflitantes.
- [ ] Shell fiel em desktop, tablet e mobile.
- [x] Lista de Campanhas fiel nos estados fechado, pasta aberta e tags abertas.
- [x] Quatro etapas da criação fiéis nos cinco estados automatizados.
- [x] Detalhe da Campanha fiel nos seis estados automatizados.
- [ ] Matriz E2E e pixel diff aprovada.

## Última medição visual

Matriz de 14/07/2026, com dados equivalentes nos dois frontends:

| Estado | Melhor diferença | Pior diferença confiável | Observação |
| --- | ---: | ---: | --- |
| Configuração | 0,024% | 0,104% | Estrutura, tipografia e seletor alinhados nas cinco resoluções. |
| Template selecionado | 0,117% | 0,524% | Conteúdo, rodapé responsivo, resumo e preview alinhados. |
| Público | 0,143% | 0,778% | Estrutura base alinhada nas cinco resoluções. |
| Validação | 0,076% | 0,721% | Painel de correção, ações e opt-out alinhados. |
| Agendamento | 0,092% | 0,655% | Seletores de data/hora, rodapé, resumo e preview alinhados. |
| Lista — fechada | 0,978% | 1,995% | Estrutura e geometria alinhadas; resíduo concentrado em rasterização tipográfica e status de dados demo inconsistentes do legado. |
| Lista — pasta aberta | 1,121% | 2,105% | Dropdown, cabeçalho, opções, contagens e seleção alinhados. |
| Lista — tags abertas | 1,079% | 2,811% | Dropdown multi-select alinhado; maior percentual ocorre no viewport mínimo de 320×568. |
| Detalhe — estados vazios | 1,384% | 4,051% | Geometria e conteúdo alinhados; maior percentual no viewport mínimo por rasterização tipográfica. |
| Detalhe — logs populados | 1,754% | 3,989% | Badges, erros, horários e correção rápida equivalentes ao legado. |

A matriz da lista foi executada em 15/07/2026 com autenticação persistente por
navegador, evitando falsos negativos causados por repetidas telas de login. O
domínio de campanhas passou em 34/34 testes após a inclusão do CRUD de
organização, filtro por interseção de tags e reenvio seguro de ignorados. A
correção de contato passou em 52/52 testes direcionados de contatos e campanhas,
e a suíte E2E passou em 6/6 fluxos, incluindo a correção pela própria interface.

Os percentuais não constituem aprovação enquanto houver perda de pintura no runner
ou divergências materiais nos estados interativos.
