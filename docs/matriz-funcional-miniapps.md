# Matriz funcional dos MiniApps

## Objetivo

Fechar o contrato funcional real dos MiniApps antes de iniciar carga, concorrência ou soak. A fonte executável é `qa/miniapps-functional-matrix.json`; este documento explica como usá-la.

“100% funcional” significa cobrir todas as capacidades declaradas, suas partições válidas e inválidas, limites e interações pairwise relevantes. Não significa testar o produto cartesiano de todas as combinações, que seria infinito ou redundante.

## O que o produto declara hoje

- Três origens: em branco, modelo pronto e IA.
- Oito modelos: feedback, interesse, suporte, pesquisa rápida, lead/cadastro, agendamento, NPS e agendamento dinâmico com Google Calendar.
- Quatorze opções visuais de bloco, contando os quatro subtipos de `TextInput`.
- Até 10 telas, 48 blocos editáveis por tela e cinco `OptIn` por tela.
- Oito operadores de ramificação, destino padrão, tela final e prévia.
- Mapeamento para nome, e-mail e campos personalizados.
- Flow estático, Flow dinâmico, publicação, envio e submissão pela Meta.

## Contrato divergente resolvido

O contrato interno não está perfeitamente alinhado:

| Recurso | Decisão aplicada | Comportamento verificável |
| --- | --- | --- |
| `DatePicker` | bloqueado | usar `CalendarPicker`; o alias antigo recebe diagnóstico antes de salvar |
| `PhotoPicker` | bloqueado | recebe diagnóstico antes de salvar e nunca é descartado pelo publicador |
| `DocumentPicker` | bloqueado | recebe diagnóstico antes de salvar e nunca é descartado pelo publicador |
| `open_url` | bloqueado | ação customizada recusada; usar navegação declarada |
| `update_data` | bloqueado | ação customizada recusada; usar ramificações e endpoint declarados |

A regra de aceite é simples: nenhum bloco ou ação pode ser aceito e depois desaparecer do Flow publicado. O contrato central em `src/domain/flow-definition.ts` é aplicado na criação, edição e publicação; o renderer também falha fechado.

## Famílias da matriz

| Família | Foco | Casos executados | Situação atual |
| --- | --- | ---: | --- |
| `MF-CONTRACT` | paridade do pipeline e bloqueio de perda silenciosa | 8/8 | coberta |
| `MF-ENTRY` | entradas, cancelamento e retomada | 8/8 | coberta |
| `MF-TEMPLATES` | os oito modelos do catálogo | 8/8 | coberta |
| `MF-BLOCKS` | os 14 blocos declarados | 14/14 | coberta |
| `MF-BOUNDARIES` | máximos, máximo + 1 e diagnósticos | 28/28 | coberta |
| `MF-SCREENS` | telas, ordem, IDs e rotas | 10/10 | coberta |
| `MF-BRANCHES` | oito operadores e fallback | 12/12 | coberta |
| `MF-MAPPING` | contato, campos e submissão | 10/10 | coberta |
| `MF-LIFECYCLE` | ciclo local e Meta | 12/12 | coberta |
| `MF-DYNAMIC` | criptografia, Data API e Calendar | 13/13 | coberta |
| `MF-CROSS` | pairwise, browsers, viewports e acessibilidade | 24/24 | coberta |

Total executado: **147/147 casos funcionais**. A primeira execução passou 142/147 e revelou cinco violações de limite nos modelos; após a correção, o reteste passou integralmente. A regressão E2E complementar passou 27/27 em Chromium, Firefox e WebKit, sem retry.

## Ordem de implementação dos testes

1. `MF-CONTRACT`: eliminar a possibilidade de perda silenciosa.
2. `MF-BOUNDARIES`: alinhar os limites entre interface, domínio e Meta.
3. `MF-SCREENS` e `MF-BRANCHES`: fechar o motor estrutural.
4. `MF-MAPPING` e `MF-DYNAMIC`: fechar dados, idempotência e integrações.
5. `MF-ENTRY`, `MF-TEMPLATES` e `MF-LIFECYCLE`: fechar as jornadas completas.
6. `MF-CROSS`: gerar a cobertura pairwise e repetir nos três motores e cinco viewports.
7. Somente depois liberar `MINI-10`, que contém concorrência, escala e soak. O gate foi executado em 04/08/2026 e aprovado nos seis grupos previstos.

## Estresse executado

`MINI-10` passou nos seis grupos no ambiente local isolado; cinco grupos também foram repetidos no staging Cloudflare. O replay do endpoint ficou deliberadamente no D1 isolado: 20 chamadas paralelas produziram uma mutação e recuperaram um claim abandonado. O ciclo local completo criou, editou, publicou, enviou, submeteu e limpou oito MiniApps. No staging, a execução cobriu salvamento e publicação concorrentes, listagem paginada de 220 itens, payload de 24.443 bytes e 20 ciclos CRUD. A aplicação agora rejeita revisões concorrentes com conflito explícito, trava publicações simultâneas, recupera claims abandonados e pagina a listagem sem quebrar clientes existentes. O cleanup remoto removeu 243/243 artefatos temporários, sem Flow remoto órfão.

Evidências principais: `qa/reports/AUTOQA_MINI_STRESS_20260804_FINAL2/miniapps-stress.json` e `qa/reports/AUTOQA_MINI_E2E_20260804/playwright-results.json`.

## Gate de saída

- Todos os casos P0 e P1 verdes sem retry.
- Nenhuma decisão `implement-or-block` aberta.
- Nenhum componente aceito e descartado silenciosamente.
- Limites aprovados no valor máximo e em máximo + 1.
- Chromium, Firefox e WebKit aprovados com retry zero.
- Prova real somente nos casos identificados como `provider-real`, com IDs não secretos e destinatário mascarado.
- Cleanup sem resíduos `AUTOQA`.

## Comandos

```bash
npm run qa:miniapps:matrix
npm run qa:miniapps:functional
npm run qa:miniapps:meta
npm run qa:miniapps:stress
npm run qa:validate
```

O primeiro comando valida a estrutura e exige que todos os arquivos-alvo existam e que não haja decisão de contrato aberta. O segundo executa exatamente os 147 casos e falha se a contagem por família divergir. O terceiro executa o canário descartável somente em staging: publica e envia um Flow para destinatário autorizado, depois deprecia o remoto e remove o registro local. IDs técnicos ficam no relatório privado, sem credenciais.
