# Changelog

## 1.0.0-rc.30

- Separa fisicamente os projetos Workers Builds de produção e staging.
- Exige correspondência entre branch, `SMARTZAP_INSTALL_ID` e Worker conectado antes de qualquer mutação Cloudflare.
- Transforma branch enviada ao projeto errado em validação sem deploy, impedindo que staging alcance produção.
- Remove a tentativa incompatível de publicar o Worker `-staging` pelo token conectado ao Worker de produção.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue SemVer.

## [Unreleased]

## [1.0.0-rc.29] - 2026-08-13

### Corrigido

- modela o canário físico como Wrangler Environment oficial do Worker-base e
  publica com `--env staging`, conforme a restrição de nome do Workers Builds;
- mantém D1, R2, Queues, Workflows e variáveis integralmente isolados no bloco
  `env.staging`, enquanto valida o Worker final `smartzap-<id>-staging`;
- evita qualquer tentativa de publicar um nome arbitrário a partir do projeto
  Cloudflare conectado ao Worker de produção.

## [1.0.0-rc.28] - 2026-08-13

### Corrigido

- retoma com segurança uma instalação inicial interrompida quando o D1 já
  existe, mas o Worker isolado ainda não foi criado;
- aceita exclusivamente `Worker does not exist [code: 10007]` como ausência de
  runtime anterior, mantendo qualquer outra falha como bloqueante;
- evita criar bookmark ou checkpoint D1 quando não existe versão anterior do
  Worker e neutraliza também no rollback o override de nome do Workers Builds.

## [1.0.0-rc.27] - 2026-08-13

### Segurança

- neutraliza `WRANGLER_CI_OVERRIDE_NAME`, variável injetada pelo Workers Builds
  que podia substituir o nome isolado de staging pelo nome do Worker conectado;
- passa `--name` explicitamente ao Wrangler e exige a confirmação estruturada
  pós-deploy do nome, da versão e do destino exatos antes de aceitar a publicação.

### Operação

- a `rc.26` foi reprovada no canário físico porque o staging foi publicado
  temporariamente sobre o Worker conectado; produção recebeu rollback imediato
  para a `rc.24` e a proposta da `rc.26` não será integrada;
- a `rc.27` só pode avançar após criar um Worker físico de staging separado e
  comprovar que a versão ativa de produção não mudou.

## [1.0.0-rc.26] - 2026-08-13

### Corrigido

- o atualizador deixa de tentar enviar arquivos de workflow com o token padrão
  do GitHub Actions, operação recusada pelo GitHub por exigir permissão
  específica de `Workflows` que o `GITHUB_TOKEN` não concede;
- cada release publica uma branch oficial `release/vX.Y.Z`, obrigatoriamente no
  mesmo SHA da tag assinada, e o fork abre um PR cruzado a partir dessa branch;
- o cliente continua sem PAT, sem GitHub App adicional, sem merge automático e
  sem qualquer publicação acionada pelo workflow de proposta.

### Operação

- a `rc.26` não altera runtime nem schema D1; ela substitui o transporte da
  proposta de atualização após a `rc.25` reprovar com segurança no canário real.

## [1.0.0-rc.25] - 2026-08-13

### Segurança

- o workflow congela a âncora de confiança já aprovada no fork em um arquivo
  temporário antes de buscar a tag candidata, tornando explícito que nenhuma
  chave entregue pela atualização participa da verificação da própria tag;
- o contrato automatizado comprova a ordem `copiar âncora -> buscar tag ->
  verificar assinatura` e recusa regressão para âncora extraída da candidata.

### Operação

- a `rc.25` não altera runtime, dependências de produção nem schema D1 da
  `rc.24`; ela endurece e torna auditável o mecanismo de proposta de atualização.

## [1.0.0-rc.24] - 2026-08-12

### Segurança

- neutraliza as páginas de privacidade e exclusão para que cada proprietário do
  fork seja identificado como responsável pela própria instalação, sem atribuir
  dados de terceiros ao mantenedor do projeto;
- o fluxo de atualização verifica tags com a âncora de confiança já aprovada no
  fork, em vez de aceitar uma lista de assinantes fornecida pela própria tag;
- adiciona Dependabot somente para dependências npm e GitHub Actions, sem merge,
  deploy ou sincronização automática do core;
- inclui um check de pull request sem permissão de escrita e proteção executável
  da `main` contra force-push, exclusão ou merge sem validação.

### Instalação e atualização

- a página fork-first consulta a API pública do GitHub e só libera a etapa
  Cloudflare após confirmar um fork público verdadeiro, vinculado ao upstream e
  com branch `main`;
- o workflow opcional detecta diariamente a release `stable` mais recente ou
  aceita uma tag SemVer exata informada pelo proprietário, executa typecheck,
  testes e build e apenas então abre o pull request;
- o clone público passa a incluir declarações de tipos para os módulos do
  instalador, migration, rollback e release, tornando `npm run typecheck` um
  gate real do pacote inteiro.

### Operação

- a `rc.24` não altera runtime de negócio nem schema D1 da `rc.23`; as mudanças
  atingem governança do fork, supply chain, documentação legal e instalador.

## [1.0.0-rc.23] - 2026-08-12

### Segurança

- a GitHub Release passa a anexar pacote derivado da tag pública exata,
  manifesto com commit, árvore, inventário e migrations, `SHA256SUMS` e
  assinatura SSH destacada;
- o verificador recusa tag, commit, pacote, manifesto, checksum agregado ou
  assinatura divergentes antes de qualquer atualização;
- o snapshot público deixa de versionar um manifesto pré-commit que apontava
  para o checkout privado de origem.

### Operação

- a `rc.23` não altera runtime nem schema da `rc.22`; é uma correção da cadeia
  de distribuição e pode ser homologada sem migration D1.

## [1.0.0-rc.22] - 2026-08-12

### Corrigido

- uma atualização após rollback para runtime anterior à `rc.18` remove do
  ledger público somente o marcador sintético interno `0035`, que podia ser
  recriado mesmo quando a baseline já continha todas as colunas;
- o postcheck da publicação reprova a atualização se esse marcador legado
  permanecer no D1.

### Operação

- a migration pública `0003` é compatível com o código anterior, não altera
  dados de negócio nem exige indisponibilidade; a remoção do registro de ledger
  é declarada como destrutiva e exige o bookmark já capturado pelo instalador;
- restaurar o bookmark D1 continua recuperando exatamente o estado anterior,
  inclusive o marcador legado, e por isso uma retomada deve reaplicar a
  `rc.22` antes de reabrir o tráfego.

## [1.0.0-rc.21] - 2026-08-12

### Corrigido

- o verificador de fork agora aceita corretamente a conta pessoal autenticada
  do instalador e recusa somente o proprietário do repositório upstream;
- a candidata `rc.20` comparava incorretamente o login autenticado ao destino,
  bloqueando o caso normal de um cliente validar o próprio fork.

### Adicionado

- ensaio local e isolado das três situações de atualização: patch limpo,
  customização sem conflito e conflito intencional;
- o conflito precisa interromper o merge sem resolução automática, e o aborto
  precisa restaurar integralmente o fork anterior.

## [1.0.0-rc.20] - 2026-08-12

### Adicionado

- verificador executável de fork verdadeiro, que exige o vínculo GitHub com o
  upstream oficial, proprietário esperado, branch padrão `main` e visibilidade
  pública;
- preparação idempotente da branch `upstream-sync` a partir do SHA exato de
  `main`, sem criar customizações artificiais nem tocar na Cloudflare;
- documentação e cobertura automatizada para rejeitar cópia independente,
  upstream falso ou repositório no proprietário errado.

## [1.0.0-rc.19] - 2026-08-12

### Segurança

- adiciona uma política fail-closed para Workers Builds: somente `main`
  publica produção e somente `staging/*` pode criar o ambiente físico de
  homologação;
- branches `sync/*`, `customer/*` e quaisquer outras branches não autorizadas
  concluem a validação sem chamar Wrangler, migrar D1 ou publicar recursos;
- ausência de `WORKERS_CI_BRANCH` interrompe o comando em vez de assumir um
  ambiente.

### Adicionado

- o workflow de atualização passa a materializar no Pull Request o changelog
  exato, a matriz de migrations, incompatibilidades, recuperação e checklist
  de aprovação do proprietário;
- o pacote público reprova a build se o executor de branches, a política ou o
  gerador auditável do Pull Request estiverem ausentes.

## [1.0.0-rc.18] - 2026-08-12

### Corrigido

- o fallback de reconciliação não registra mais a migration legada `0035` ao
  apenas verificar uma baseline nova que já possui todas as colunas.

## [1.0.0-rc.17] - 2026-08-12

### Segurança

- remove o `.dev.vars` gerado pelo plugin Vite tanto em `smartzap` quanto no
  nome legado `smartzap_cf`;
- o deploy fork-first recusa artefatos sem `dist/client` ou com qualquer
  `.dev.vars`, mesmo quando o build foi invocado fora do pipeline recomendado.

## [1.0.0-rc.16] - 2026-08-12

### Corrigido

- inclui no Git os módulos de validação de migrations e de assinatura usados
  pelos entrypoints públicos;
- o contrato da distribuição agora reprova a release quando qualquer módulo
  transitivo do deploy, rollback ou verificação estiver ausente.

## [1.0.0-rc.15] - 2026-08-12

### Adicionado

- primeira migration pública pós-baseline (`schema 1 → 2`), expansiva e sem
  downtime, com histórico imutável das releases instaladas;
- validação fail-closed de sequência, metadados e SHA-256 de todas as migrations
  antes de qualquer operação na Cloudflare;
- postchecks que vinculam versão, commit e schema realmente persistidos.

## [1.0.0-rc.14] - 2026-08-12

### Corrigido

- o checkpoint de upgrade não usa `commit` como alias SQL reservado no D1.

## [1.0.0-rc.13] - 2026-08-12

### Corrigido

- a retomada consulta diretamente o bucket R2 pelo nome, evitando o limite da
  listagem da conta e impedindo tentativas de recriação durante upgrades.

## [1.0.0-rc.12] - 2026-08-12

### Corrigido

- o instalador confirma o trigger agendado somente após o deploy bem-sucedido,
  permitindo validar a infraestrutura sem aguardar a primeira execução do cron.

## [1.0.0-rc.11] - 2026-08-12

### Corrigido

- bootstrap D1 passa a obter o UUID pela listagem JSON estruturada do Wrangler;
- tabelas internas `_cf_*` deixam de ser confundidas com conteúdo pré-existente;
- retomada segura da instalação após a criação física do D1.

## [1.0.0-rc.10] - 2026-08-12

### Adicionado

- fluxo fork-first com código próprio e Workers Builds;
- instalação rápida OAuth preservada como versão fixa;
- bootstrap isolado de D1, R2, Queues, Workflows, Durable Objects e secrets;
- contratos de atualização, suporte, segurança, OAuth e marca;
- workflow opcional de sincronização por tag e pull request;
- metadados de migration e procedimento duplo de rollback.

## [1.0.0] - não publicada

Primeira release Community será publicada somente após o gate de homologação
descrito em `jornada.md` e `Auditoria.md`.
