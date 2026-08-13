# Guia completo: instalar sistemas na Cloudflare

> Documento autônomo para equipes e agentes que nunca viram o SmartZap nem o provisionador atual.
>
> Última revisão: 13/08/2026. Antes de implementar, confira novamente a documentação oficial da Cloudflare indicada no final deste guia, pois APIs, escopos e limitações podem mudar.

## 1. Objetivo

Este guia explica dois modelos complementares de distribuição:

1. **fork próprio**, recomendado para produção autogerenciada, no qual o usuário recebe o código, conecta o repositório ao Workers Builds e controla cada atualização;
2. **instalação rápida por OAuth**, adequada para avaliação ou versão fixa, na qual o provisionador cria os recursos sem GitHub ou terminal.

No modelo rápido, o fluxo é:

```text
Usuário abre o portal
  → escolhe o sistema
  → autoriza sua conta Cloudflare por OAuth
  → escolhe a conta
  → confere um plano somente leitura
  → define os segredos iniciais
  → instala os recursos
  → conclui a configuração do produto
```

No modelo rápido, o usuário final não precisa:

- fornecer API Token;
- clonar um repositório;
- usar terminal ou Wrangler;
- configurar GitHub Actions;
- criar manualmente D1, R2, Queues, Workflows ou Worker;
- entregar credenciais Cloudflare à equipe do produto.

No modelo com fork, GitHub ou GitLab e Workers Builds fazem parte deliberadamente do fluxo porque o proprietário assume manutenção, customizações, homologação e publicação. O modelo foi comprovado inicialmente no SmartZap, mas a arquitetura serve para outros sistemas implantados em infraestrutura Cloudflare.

### 1.1 Escolha do modelo e responsabilidade

| Modelo | Código do cliente | Atualizações | Responsável por revisar e publicar |
|---|---|---|---|
| Fork próprio | Fork na conta Git do proprietário | Pull request opcional a partir de release oficial assinada | Proprietário do fork |
| Instalação rápida OAuth | Release imutável instalada sem repositório | Não incluídas; a versão permanece fixa | Proprietário da instalação |
| Serviço gerenciado | Definido em contrato separado | Conforme contrato | Prestador contratado |

Uma nova release do publicador nunca deve alterar automaticamente uma instalação de terceiro. No fork, a automação pode **propor** uma atualização, mas não pode resolver conflitos, fazer merge, migrar o banco ou publicar produção. Na instalação rápida, atualizar exige uma operação futura explícita ou uma migração deliberada para fork.

## 2. A decisão mais importante

O **portal pode ser compartilhado**, mas o **cliente OAuth e o provisionamento devem ser isolados por produto**.

Exemplo:

| Item | Compartilhado? | Exemplo |
|---|---:|---|
| Domínio de entrada | Sim | `https://instalar.exemplo.com` |
| Página que lista os sistemas | Sim | `/` |
| Componentes visuais | Sim | botões, cards, mensagens e layout |
| Biblioteca de OAuth | Sim, como código | funções PKCE, state e revogação |
| Biblioteca de provisionamento | Sim, como código | cliente da API, ledger e rollback |
| Rota pública do produto | Não | `/produto-a`, `/produto-b` |
| Cliente OAuth | Não | `Produto A Provisioner` |
| Redirect URL OAuth | Não | `/produto-a/oauth/callback` |
| Cookie de sessão | Não | restrito a `/produto-a` |
| Escopos OAuth | Não | somente os recursos daquele produto |
| Banco de controle | Preferencialmente não | D1 próprio do provisionador do produto |
| Bucket de releases | Preferencialmente não | R2 próprio ou prefixo rigidamente isolado |
| Manifesto e artefatos | Não | release específica do produto |
| Ledger de recursos | Não | conta + produto + instalação |
| Segredos do produto | Não | bindings secretos do Worker instalado |
| Ciclo de publicação | Não | uma versão do produto não altera outro |

### Regra prática

Para cada novo sistema, crie:

1. uma rota pública própria;
2. um cliente OAuth próprio;
3. callbacks próprios;
4. escopos mínimos próprios;
5. sessão e cookie próprios;
6. manifesto e release próprios;
7. ledger e rollback próprios;
8. homologação física própria.

Não reutilize o cliente `SmartZap Provisioner` em outro sistema.

## 3. Arquitetura recomendada

### 3.1 Estrutura pública

```text
https://instalar.exemplo.com/
├── /produto-a/
│   ├── fork/
│   ├── quick/
│   ├── oauth/start
│   ├── oauth/callback
│   ├── api/session
│   ├── api/account
│   ├── api/plan
│   ├── api/install
│   ├── api/disconnect
│   ├── logo.svg
│   └── release/manifest.json
└── /produto-b/
    └── ...mesmo contrato, com estado independente
```

### 3.2 Implantação simples e implantação isolada

Existem duas opções válidas:

#### Opção A — um Worker para o portal e todos os instaladores

É mais simples no começo. Um Worker atende `/` e roteia cada prefixo para um módulo de produto.

Vantagens:

- menos infraestrutura do publicador;
- um único Custom Domain;
- implementação inicial mais rápida.

Desvantagens:

- um deploy pode afetar todos os instaladores;
- observabilidade e rollback ficam acoplados;
- um defeito de roteamento pode atravessar produtos.

#### Opção B — gateway compartilhado e um Worker por produto

É a recomendação para vários produtos em produção.

```text
Custom Domain
    ↓
portal/gateway Worker
    ├── /produto-a/* → service binding → provisioner-produto-a
    └── /produto-b/* → service binding → provisioner-produto-b
```

Vantagens:

- deploy, rollback, logs e segredos isolados;
- permissões e releases independentes;
- menor raio de impacto.

Desvantagens:

- mais Workers e bindings para administrar;
- exige um gateway pequeno e estável.

O hostname tem um único Custom Domain e, por definição, todos os seus caminhos chegam ao Worker configurado como origem. Por isso, quando houver vários Workers de produto, o gateway deve encaminhar cada prefixo ao Worker correto, preferencialmente por service binding.

## 4. Componentes do sistema

### 4.1 Portal

O portal só apresenta os instaladores disponíveis. Ele não deve:

- receber API Token;
- gerar autorização genérica para todos os produtos;
- armazenar segredos;
- iniciar provisionamento sem escolha explícita;
- compartilhar cookie entre produtos.

### 4.2 Provisionador do produto

É um Worker controlado pelo publicador. Suas responsabilidades são:

- iniciar OAuth;
- validar callback, `state` e PKCE;
- listar e validar contas autorizadas;
- calcular o plano sem alterar a conta;
- criar somente os recursos previstos;
- registrar propriedade no ledger;
- instalar uma release imutável;
- executar rollback dos recursos criados pela tentativa;
- revogar a autorização ao terminar ou desconectar.

### 4.3 Banco de controle do provisionador

Um D1 do publicador guarda somente o controle da instalação:

- sessão OAuth;
- token OAuth cifrado;
- conta selecionada;
- instalação e release;
- plano calculado;
- recursos criados e respectivos IDs;
- lease de concorrência;
- eventos e erros sanitizados.

Ele não deve guardar em texto puro:

- access token;
- refresh token;
- client secret;
- senha administrativa do sistema instalado;
- chave do cofre do sistema instalado;
- credenciais externas do cliente.

### 4.4 Repositório de releases

Use um R2 controlado pelo publicador para armazenar:

- manifesto da release;
- módulo principal do Worker;
- módulos adicionais;
- assets estáticos;
- baseline D1;
- upgrades posteriores, quando existirem.

Todo item deve possuir SHA-256 no manifesto. O provisionador precisa verificar os hashes antes de enviar qualquer artefato à conta do cliente.

## 5. Pré-requisitos

O publicador precisa de:

- uma conta Cloudflare com permissão para criar OAuth clients;
- papel `Super Administrator`, `Administrator` ou `OAuth Client Write`;
- uma zona DNS ativa na Cloudflare;
- um hostname para o portal, como `instalar.exemplo.com`;
- um Worker do provisionador;
- D1 de controle;
- R2 de releases;
- domínio público com HTTPS;
- política de privacidade e termos, se o produto exigir;
- uma conta Cloudflare externa para homologar o OAuth público.

O cliente que instalará o produto pode precisar ativar produtos Cloudflare específicos. Por exemplo, uma conta pode exigir a ativação prévia do R2 e o cadastro de um meio de pagamento, mesmo que o consumo permaneça na franquia gratuita. O preflight deve detectar isso antes de criar qualquer recurso.

## 6. Defina o contrato do produto antes do OAuth

Preencha esta ficha:

```yaml
product_name: "Produto A"
product_slug: "produto-a"
provisioner_name: "Produto A Provisioner"
public_origin: "https://instalar.exemplo.com/produto-a"
callback_url: "https://instalar.exemplo.com/produto-a/oauth/callback"
logo_url: "https://instalar.exemplo.com/produto-a/logo.svg"
cookie_path: "/produto-a"
prefix_pattern: "produto-a-[a-f0-9]{8}"
required_resources:
  - worker
  - d1
optional_resources:
  - r2
oauth_scopes: []
```

Depois liste, um por um:

- recursos que serão criados;
- operações Cloudflare necessárias;
- binding resultante;
- motivo da permissão;
- comportamento de rollback;
- teste de aprovação.

Não escolha escopos “para garantir”. Comece das chamadas de API que o provisionador realmente executa e solicite somente os escopos correspondentes.

## 7. Criação do cliente OAuth

### 7.1 Um cliente por produto

No dashboard Cloudflare:

1. selecione a conta publicadora;
2. abra **Manage Account → OAuth clients**;
3. clique em **Create client**;
4. use o nome `[Produto] Provisioner`;
5. configure `authorization_code`;
6. configure a resposta `code`;
7. cadastre o callback exato;
8. informe Client URL e logo públicos;
9. selecione somente os escopos necessários;
10. crie o cliente inicialmente como privado.

Exemplo:

```text
Client name: Produto A Provisioner
Client URL: https://instalar.exemplo.com/produto-a/
Logo URL: https://instalar.exemplo.com/produto-a/logo.svg
Redirect URL: https://instalar.exemplo.com/produto-a/oauth/callback
Grant type: authorization_code
Response type: code
```

### 7.2 PKCE e segredo do cliente

Use Authorization Code com PKCE `S256`.

- Aplicativo puramente público, navegador, mobile, desktop ou CLI: `token_endpoint_auth_method=none`; PKCE é obrigatório; não existe client secret.
- Backend capaz de proteger um secret: pode usar `client_secret_basic` ou `client_secret_post`; PKCE continua recomendado como defesa adicional.

Nunca coloque um client secret no JavaScript entregue ao navegador.

### 7.3 Estado da sessão

Em cada início de OAuth:

1. gere `session_id` aleatório;
2. gere `state` aleatório e de uso único;
3. gere `code_verifier` aleatório;
4. calcule `code_challenge = BASE64URL(SHA256(code_verifier))`;
5. guarde somente dados cifrados no D1 de controle;
6. crie cookie `HttpOnly`, `Secure`, `SameSite=Lax` e restrito ao produto;
7. defina expiração curta, por exemplo 30 minutos.

Exemplo do cookie do Produto A:

```http
Set-Cookie: produto_a_session=<valor>; Path=/produto-a; HttpOnly; Secure; SameSite=Lax; Max-Age=1800
```

Não use `Path=/`: isso compartilharia a sessão com todos os instaladores do domínio.

### 7.4 URL de autorização

```text
https://dash.cloudflare.com/oauth2/auth
  ?response_type=code
  &client_id=...
  &redirect_uri=https%3A%2F%2Finstalar.exemplo.com%2Fproduto-a%2Foauth%2Fcallback
  &state=...
  &code_challenge=...
  &code_challenge_method=S256
  &scope=...
```

O callback deve:

- recusar ausência de `code` ou `state`;
- consumir o `state` apenas uma vez;
- comparar a sessão do cookie;
- trocar o código usando o mesmo callback exato;
- cifrar os tokens antes de persistir;
- remover `code` e `state` da URL por redirecionamento.

Endpoints oficiais atuais:

```text
Authorization: https://dash.cloudflare.com/oauth2/auth
Token:         https://dash.cloudflare.com/oauth2/token
Revoke:        https://dash.cloudflare.com/oauth2/revoke
Logout:        https://dash.cloudflare.com/oauth2/logout
User info:     https://dash.cloudflare.com/oauth2/userinfo
```

## 8. Cliente privado, verificação do domínio e cliente público

Clientes novos começam privados. Um cliente privado só pode ser autorizado por membros da conta Cloudflare que o criou.

### 8.1 Teste privado primeiro

Antes da promoção pública:

- autentique com um membro da conta publicadora;
- confira nome, logo e permissões na tela de consentimento;
- valide callback, PKCE, seleção de conta e revogação;
- execute somente um plano read-only;
- confirme que nenhum recurso foi criado.

### 8.2 Verificação DNS

Para tornar o cliente público:

1. preencha nome, logo, Client URL e escopos;
2. copie o TXT exibido no cliente OAuth;
3. crie o TXT no DNS do domínio da Client URL;
4. preserve o prefixo integral `cloudflare_oauth_client_publisher=`;
5. aguarde a Cloudflare marcar o domínio como `Verified`.

A Cloudflare consulta o TXT por até dois dias. Se expirar, reinicie a verificação mantendo o mesmo `client_uri`.

Depois da verificação, o domínio da Client URL não pode ser trocado; apenas a rota no mesmo domínio pode ser atualizada. Escolha o domínio definitivo antes de promover.

### 8.3 Promoção pública

Somente depois de `Verified`:

1. abra o menu do cliente;
2. selecione **Change Visibility**;
3. confirme `Public`;
4. registre a data e os campos finais.

**A promoção é permanente.** Não existe retorno para `Private`.

### 8.4 Contraprova obrigatória

Use uma conta Cloudflare que:

- não seja membro da conta publicadora;
- esteja limpa ou tenha inventário conhecido;
- permita conferir os recursos antes e depois.

Se a conta não aparecer no consentimento, o administrador pode ter desativado novos aplicativos OAuth públicos em **Manage Account → Members → Settings → Public OAuth App access**.

## 9. Domínio e roteamento

### 9.1 Custom Domain

Associe o hostname ao Worker de entrada:

1. abra **Workers & Pages**;
2. selecione o Worker do portal/gateway;
3. abra **Settings → Domains & Routes**;
4. escolha **Add → Custom Domain**;
5. informe `instalar.exemplo.com`.

A zona deve estar ativa na mesma conta e o hostname não pode possuir um CNAME incompatível. O Custom Domain envia todos os caminhos daquele hostname ao Worker configurado.

Exemplo Wrangler:

```jsonc
{
  "routes": [
    {
      "pattern": "instalar.exemplo.com",
      "custom_domain": true
    }
  ]
}
```

### 9.2 Isolamento por caminho

O roteador deve rejeitar caminhos fora do prefixo:

```ts
function productPath(pathname: string, basePath: string): string {
  if (pathname === basePath) return "/";
  if (!pathname.startsWith(`${basePath}/`)) return "__outside_product__";
  return pathname.slice(basePath.length) || "/";
}
```

URLs, formulários, `fetch`, redirects e assets devem ser relativos ao prefixo ou construídos a partir de um `PUBLIC_ORIGIN` canônico:

```text
PUBLIC_ORIGIN=https://instalar.exemplo.com/produto-a
```

## 10. Escopos OAuth

Os nomes de escopo correspondem às permissões de API da Cloudflare. Consulte o seletor atual do OAuth ou `GET /client/v4/oauth/scopes` antes de publicar.

Exemplo usado pelo SmartZap em agosto de 2026:

```text
account-settings.read
d1.write
queues.write
workers-r2.write
workers-scripts.write
ai.read
```

Esse conjunto **não é um padrão universal**. Outro produto que não use R2, Queues ou AI deve remover os escopos correspondentes. Um produto que use outros recursos precisa mapear as chamadas reais e adicionar somente a permissão necessária.

Mantenha uma tabela no repositório:

| Escopo | Chamada que exige | Recurso criado | Obrigatório? |
|---|---|---|---:|
| `d1.write` | criar e inicializar D1 | banco do produto | Sim |
| `workers-r2.write` | criar bucket | mídia/release | Se usado |
| `queues.write` | criar Queue e consumidor | processamento assíncrono | Se usado |
| `workers-scripts.write` | publicar Worker/versão | aplicação | Sim |

## 11. Segurança do provisionador

### 11.1 Segredos do próprio provisionador

Mantenha como secret do Worker:

- client secret, se o fluxo configurado usar um;
- chave usada para cifrar tokens OAuth no D1;
- qualquer credencial da conta publicadora.

Não use `vars` para informações sensíveis. A Cloudflare recomenda bindings do tipo secret. Nunca comite `.dev.vars`, `.env` ou configurações privadas.

### 11.2 Tokens OAuth

- cifre access e refresh tokens com uma chave que existe somente como secret;
- use criptografia autenticada, como AES-256-GCM;
- use IV aleatório por registro;
- vincule AAD à sessão e à versão do formato;
- nunca devolva token ao frontend;
- nunca registre prefixo, sufixo ou fragmento do token;
- revogue ao desconectar e após a instalação;
- limpe sessões expiradas periodicamente;
- apague o token local mesmo quando a revogação remota falhar.

### 11.3 Proteção das APIs

Todas as mutações devem exigir:

- sessão OAuth válida;
- conta explicitamente selecionada e validada;
- `Origin` exatamente igual à origem pública;
- `Content-Type: application/json`;
- plano válido e atual;
- lease de instalação contra concorrência;
- mensagens de erro sanitizadas.

Nunca aceite `account_id` em `/api/install` sem ligá-lo à sessão autorizada.

### 11.4 Segredos iniciais do produto instalado

Há dois tipos comuns:

1. **senha administrativa**, escolhida pelo usuário;
2. **chave do cofre**, aleatória, gerada localmente no navegador.

Regras:

- gerar a chave com `crypto.getRandomValues`;
- usar pelo menos 256 bits;
- não enviar para analytics;
- não guardar em `localStorage`, cookies ou D1 do provisionador;
- permitir que o usuário copie ou baixe um arquivo de recuperação;
- enviar uma única vez, por HTTPS, diretamente em `/api/install`;
- gravar como secrets do Worker de destino;
- apagar os campos do navegador após o sucesso;
- exigir redigitação se uma retomada ocorrer antes do upload da versão.

## 12. Release imutável

O instalador não deve compilar código arbitrário do GitHub durante a instalação. Prepare uma release antes e publique artefatos imutáveis.

Modelo de manifesto:

```json
{
  "schemaVersion": 2,
  "version": "1.0.0",
  "createdAt": "2026-08-12T00:00:00.000Z",
  "compatibilityDate": "2026-08-01",
  "compatibilityFlags": ["nodejs_compat"],
  "main": {
    "path": "release/1.0.0/index.js",
    "sha256": "...",
    "size": 12345
  },
  "modules": [],
  "assets": [],
  "baseline": {
    "name": "0001_fresh_install.sql",
    "sha256": "...",
    "statementsSha256": "...",
    "statements": []
  },
  "upgrades": []
}
```

### Banco novo

Para instalações novas, entregue um único baseline final com todas as tabelas. Não obrigue o cliente novo a repetir dezenas de migrações históricas.

Depois que o baseline for publicado:

- ele se torna imutável;
- mudanças futuras entram como upgrades ordenados;
- cada baseline/upgrade recebe checksum;
- o D1 registra o nome e checksum aplicados;
- checksum divergente bloqueia a instalação.

### 12.1 Fork, Workers Builds e atualizações

O fork próprio e a instalação rápida podem compartilhar os mesmos artefatos assinados, mas possuem ciclos de manutenção diferentes.

No modelo com fork:

1. o usuário cria um fork verdadeiro do repositório oficial;
2. conecta esse fork ao Cloudflare Workers Builds;
3. configura o comando de build e os comandos de deploy de produção e de branches não produtivas;
4. mantém produção ligada à branch `main` do próprio fork;
5. recebe atualizações oficiais por uma branch ou pull request revisável;
6. testa migrations e runtime em staging físico antes do merge;
7. decide quando publicar e mantém o próprio plano de rollback.

A integração Git da Cloudflare precisa ser autorizada uma vez na conta GitHub ou GitLab do proprietário. Ao conectar um repositório a um Worker existente, o nome do Worker deve permanecer compatível com o `name` da configuração Wrangler. Branches de proposta não devem promover tráfego produtivo; use upload de versão ou validação sem deploy até a aprovação.

No modelo rápido:

- o provisionador instala exatamente a versão declarada no manifesto;
- não cria nem conecta um repositório Git;
- não acompanha `latest`;
- não recebe atualização automática;
- uma release futura não muda o Worker instalado;
- a migração para fork deve preservar dados, secrets e rollback de forma explícita, sem tratar nomes semelhantes como prova de propriedade.

## 13. Plano somente leitura

Antes de criar qualquer recurso, `POST /api/plan` deve:

1. derivar todos os nomes de um prefixo aleatório;
2. consultar D1, R2, Queues, Workers e Workflows;
3. verificar o ledger da instalação;
4. classificar cada recurso;
5. falhar fechado em pré-requisito ausente.

Estados:

```ts
type PlanAction = "create" | "reuse" | "blocked";
```

- `create`: nome livre;
- `reuse`: recurso aparece no ledger da mesma conta e instalação;
- `blocked`: nome existe, mas não pertence ao ledger compatível.

O plano deve mostrar em linguagem humana exatamente o que será criado. O botão de instalar fica desabilitado quando houver qualquer `blocked` ou pré-requisito ausente.

Se o usuário mudar conta, prefixo, release ou configuração, invalide o plano anterior.

## 14. Ledger, lease e idempotência

A chave lógica da instalação deve incluir:

```text
produto + account_id + prefixo
```

O ledger registra cada recurso imediatamente após sua criação:

```json
{
  "kind": "d1",
  "name": "produto-a-1a2b3c4d-db",
  "id": "..."
}
```

Use um lease com expiração para impedir duas execuções simultâneas. Enquanto o lease estiver ativo, outra tentativa deve parar. Após expirar, uma nova sessão legítima pode retomar usando o mesmo prefixo e o arquivo de recuperação.

Não considere nome parecido prova de propriedade. Somente o ledger da mesma conta e instalação autoriza reutilização ou remoção.

## 15. Ordem de provisionamento

Uma ordem segura típica é:

1. validar novamente conta, release e plano;
2. adquirir lease;
3. criar D1;
4. criar R2, se usado;
5. criar Queues e DLQs, se usadas;
6. aplicar baseline D1 em transação;
7. verificar o ledger de migrações;
8. enviar assets e módulos verificando SHA-256;
9. criar versão imutável do Worker com bindings e secrets;
10. criar Workflows;
11. configurar consumidores de Queue;
12. configurar Cron e demais bindings;
13. publicar tráfego somente quando tudo obrigatório estiver pronto;
14. marcar instalação como completa;
15. revogar OAuth e apagar a sessão.

Recursos opcionais não devem impedir o núcleo, desde que a ausência esteja claramente indicada.

## 16. Rollback

Em caso de falha antes da liberação, remova somente os recursos criados pela tentativa atual.

Uma ordem prática de rollback é:

1. remover consumidores das Queues;
2. remover Workflows;
3. remover ou reverter o Worker;
4. remover Queues e DLQs;
5. remover R2 criado pela tentativa;
6. remover D1 criado pela tentativa;
7. registrar qualquer resíduo que não pôde ser removido;
8. liberar o lease.

A ordem importa: um Worker ainda ligado a Queues pode impedir a exclusão; uma Queue com consumidor ativo também pode impedir o cleanup.

Nunca apague recurso preexistente, recurso sem ledger ou recurso de outra instalação.

## 17. Interface mínima recomendada

O fluxo precisa de quatro passos visíveis:

### Passo 1 — Autorizar Cloudflare

- explica que usa OAuth;
- informa que não pede API Token;
- abre a tela oficial de consentimento;
- oferece “Desconectar”.

### Passo 2 — Escolher a conta

- lista somente contas autorizadas;
- mostra nome e Account ID mascarado;
- exige seleção explícita;
- valida a conta com chamada não destrutiva.

### Passo 3 — Criar acesso e recuperação

- usuário define a senha;
- navegador gera a chave do cofre;
- usuário pode copiar e baixar recuperação;
- valores nunca saem do navegador antes da instalação.

### Passo 4 — Conferir e instalar

- gera prefixo aleatório;
- permite carregar arquivo para retomar;
- calcula plano somente leitura;
- explica `criar`, `reutilizar` e `bloqueado`;
- habilita instalação apenas com plano seguro;
- leva ao `/setup` do produto instalado.

## 18. Assistente pós-instalação

O provisionador cria infraestrutura. O `/setup` configura o negócio e as integrações.

O assistente deve:

- verificar bindings e recursos;
- solicitar credenciais externas diretamente ao produto instalado;
- cifrar credenciais no banco do cliente;
- testar integrações reais;
- executar um canário autorizado;
- mostrar estados intermediários;
- liberar o núcleo somente quando os gates obrigatórios estiverem verdes;
- deixar módulos opcionais desligados por padrão.

Credenciais de terceiros não devem passar pelo Worker central do provisionador quando podem ser enviadas diretamente ao Worker instalado.

## 19. Contrato mínimo de endpoints

```text
GET  /<produto>/                  interface
GET  /<produto>/fork/            instalação autogerenciada com código próprio
GET  /<produto>/quick/           instalação rápida de versão fixa
GET  /<produto>/logo.svg         identidade OAuth
GET  /<produto>/health           saúde pública
GET  /<produto>/oauth/start      inicia Authorization Code + PKCE
GET  /<produto>/oauth/callback   valida e troca code
GET  /<produto>/api/session      estado sanitizado
POST /<produto>/api/account      seleciona e valida conta
POST /<produto>/api/plan         plano read-only
POST /<produto>/api/install      execução idempotente
POST /<produto>/api/disconnect   revoga token e sessão
GET  /<produto>/release/*        artefatos imutáveis
```

Respostas de sessão nunca devem conter tokens. Respostas de erro devem remover Bearer tokens, secrets e detalhes internos.

## 20. Testes obrigatórios

### 20.1 Unitários e contratos

- geração e consumo único de `state`;
- PKCE `S256`;
- callback exato;
- cookie restrito ao produto;
- criptografia e autenticação do token;
- expiração e cleanup;
- origem rejeitada;
- prefixo inválido;
- plano create/reuse/blocked;
- checksum de release;
- baseline imutável;
- lease concorrente;
- rollback na ordem correta;
- sanitização de erros;
- revogação de OAuth.
- separação entre fork e sessão OAuth rápida;
- ausência de promessa de atualização automática;
- proposta de atualização sem merge, migration ou deploy automático.

### 20.2 Navegador

- Chromium, Firefox e WebKit;
- mobile e desktop;
- teclado e foco;
- zoom 200%;
- ausência de overflow;
- redirecionamento OAuth;
- retomada pelo arquivo;
- mensagens de pré-requisito acionáveis.

### 20.3 Cloudflare física

Teste em contas reais e limpas:

1. conta membro do publicador, com cliente privado;
2. conta externa gratuita;
3. segunda conta externa gratuita;
4. conta paga, se o produto depende de recursos pagos.

Cubra:

- inventário antes/depois;
- R2 desativado;
- colisão de nome;
- interrupção no meio;
- retomada por nova sessão;
- execução concorrente;
- falha antes do deploy;
- rollback;
- cleanup sem resíduos;
- release e versão instaladas;
- setup real do produto.

Para o fork, acrescente uma instalação real via Workers Builds, uma proposta de atualização limpa, uma customização sem conflito, um conflito intencional, staging separado e rollback para a versão anterior. Um build verde sem deploy físico não comprova manutenção nem atualização.

### 20.4 Critério de homologação pública

Não divulgue “instalação em um clique” enquanto não houver evidência de:

- domínio OAuth verificado;
- cliente público;
- conta externa não membro autorizada;
- plano correto;
- instalação completa sem CLI;
- setup concluído;
- OAuth revogado;
- zero segredo em frontend, log ou Git;
- zero recurso residual após falhas de QA;
- rollback ensaiado.

## 21. Checklist para um novo produto

### Distribuição e manutenção

- [ ] fork próprio e instalação rápida claramente separados;
- [ ] modelo recomendado declarado;
- [ ] responsabilidades de manutenção sem ambiguidade;
- [ ] versão rápida fixa e visível;
- [ ] integração Git autorizada pelo proprietário;
- [ ] atualização somente por PR revisável;
- [ ] staging e rollback antes de produção;
- [ ] nenhuma promessa de merge, migration ou deploy automático.

### Produto e rotas

- [ ] nome e slug definidos;
- [ ] rota pública exclusiva;
- [ ] logo próprio;
- [ ] health próprio;
- [ ] cookie restrito ao prefixo;
- [ ] política e termos definidos.

### OAuth

- [ ] cliente OAuth exclusivo;
- [ ] callback exato;
- [ ] Authorization Code;
- [ ] PKCE `S256`;
- [ ] escopos mínimos documentados;
- [ ] teste privado concluído;
- [ ] TXT publicado;
- [ ] domínio `Verified`;
- [ ] promoção pública conscientemente aprovada;
- [ ] teste com conta externa.

### Provisionador

- [ ] D1 de controle;
- [ ] chave de cifragem como secret;
- [ ] tokens cifrados;
- [ ] sessões expiram;
- [ ] Cron limpa sessões;
- [ ] conta selecionada explicitamente;
- [ ] plano read-only;
- [ ] ledger por conta/instalação;
- [ ] lease concorrente;
- [ ] rollback seguro;
- [ ] revogação OAuth.

### Release

- [ ] manifesto versionado;
- [ ] SHA-256 de todos os artefatos;
- [ ] baseline final para banco novo;
- [ ] upgrades separados e imutáveis;
- [ ] assets e módulos verificados;
- [ ] versão do Worker imutável;
- [ ] health pós-deploy.

### UX e segurança

- [ ] não pede API Token;
- [ ] senha definida pelo usuário;
- [ ] chave gerada localmente;
- [ ] arquivo de recuperação;
- [ ] nada em `localStorage`;
- [ ] secrets nunca aparecem em logs;
- [ ] erro de pré-requisito explica como corrigir;
- [ ] botão instalar fica bloqueado sem plano seguro.

### Homologação

- [ ] testes unitários e contratos;
- [ ] três navegadores;
- [ ] mobile e desktop;
- [ ] acessibilidade manual;
- [ ] conta gratuita limpa;
- [ ] conta paga quando aplicável;
- [ ] interrupção e retomada;
- [ ] colisão;
- [ ] rollback;
- [ ] cleanup sem resíduo;
- [ ] setup real do produto.

## 22. O que não fazer

- Não use um cliente OAuth único para produtos diferentes.
- Não peça Global API Key ou API Token ao usuário.
- Não torne o OAuth público antes de verificar domínio e fluxo privado.
- Não promova para público “só para testar”; é irreversível.
- Não use `workers.dev` como domínio definitivo do publisher quando você precisa provar controle DNS.
- Não compartilhe cookie com `Path=/`.
- Não coloque client secret, token ou chave do cofre no frontend.
- Não registre segredos, nem parcialmente.
- Não reutilize recurso apenas porque o nome coincide.
- Não apague recurso sem prova de propriedade no ledger.
- Não crie recursos antes do plano read-only.
- Não trate “API respondeu 200” como instalação funcional.
- Não entregue dezenas de migrações históricas a um banco novo; gere um baseline final.
- Não publique o selo de instalação simples sem teste físico em conta externa.
- Não chame cópia independente, Deploy Button ou repositório renomeado de fork verificável.
- Não prometa atualização automática para uma instalação rápida de versão fixa.
- Não faça merge, migration ou deploy de produção no fork de terceiros sem ação explícita do proprietário.

## 23. Modelo de handoff para outro time ou agente

Copie o texto abaixo junto com este documento:

```text
Implemente a distribuição Cloudflare do sistema <NOME>, seguindo integralmente o guia “Guia completo: instalar sistemas na Cloudflare”.

Você não possui contexto prévio. Antes de editar:
1. inventarie o produto, sua infraestrutura Cloudflare e seus secrets;
2. consulte a documentação oficial atual da Cloudflare;
3. derive os escopos a partir das chamadas reais;
4. ofereça fork próprio como modelo autogerenciado e instalação OAuth rápida somente quando ambos fizerem sentido para o produto;
5. crie rota, OAuth client, callback, cookie, release, ledger e homologação exclusivos;
6. preserve o portal compartilhado e não altere os instaladores existentes;
7. implemente plano read-only, instalação idempotente, rollback e revogação;
8. teste primeiro como cliente privado e só proponha promoção pública após DNS Verified;
9. nunca exponha ou registre credenciais;
10. execute testes locais e físicos, corrigindo e repetindo até passar;
11. não atualize instalações de terceiros automaticamente; no fork, apenas proponha PR revisável;
12. entregue evidências exatas, pendências e rollback.

Não reutilize o OAuth client de outro produto. Não afirme que está pronto apenas porque compilou ou porque uma API respondeu 200.
```

## 24. Referências oficiais

- [Criar um OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)
- [Integrar o OAuth client com a Cloudflare](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/)
- [Autorizar e revogar aplicações](https://developers.cloudflare.com/fundamentals/oauth/authorizing-an-application/)
- [Custom Domains para Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Service Bindings entre Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Servir aplicação em subdiretório](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/)
- [Secrets em Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Importação, exportação e limitações do D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Referência da API Cloudflare](https://developers.cloudflare.com/api/)
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Integração Git do Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [Configuração de builds e branches](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

## 25. Exemplo concreto: SmartZap

O SmartZap usa atualmente:

```text
Portal:        https://instalar.escoladeautomacao.com/
Produto:       https://instalar.escoladeautomacao.com/smartzap/
Fork próprio:  https://instalar.escoladeautomacao.com/smartzap/fork/
Versão fixa:   https://instalar.escoladeautomacao.com/smartzap/quick/
OAuth client:  SmartZap Provisioner
Callback:      https://instalar.escoladeautomacao.com/smartzap/oauth/callback
Logo:          https://instalar.escoladeautomacao.com/smartzap/logo.svg
Cookie path:   /smartzap
```

O SmartZap recomenda o fork próprio para produção autogerenciada. A rota rápida instala uma release imutável, não cria GitHub e não inclui atualizações automáticas. A interface deve sempre ler e mostrar a versão exata do manifesto, sem depender deste texto.

Esse cliente OAuth pertence somente ao SmartZap e atende apenas a modalidade rápida. O fork não reutiliza a sessão OAuth do provisionador. Um novo sistema deve seguir o mesmo contrato de arquitetura, mas receber identidade, permissões, sessão, release, ledger e homologação próprios.
