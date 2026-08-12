# Instalação com fork próprio

Esta é a modalidade recomendada para produção.

## Pré-requisitos

- conta GitHub capaz de criar fork;
- conta Cloudflare com Workers Builds e R2 habilitados;
- limites compatíveis com D1, R2, seis Queues/DLQs, Workflows, Durable Objects e
  Workers AI;
- repositório público oficial: `thaleslaray/smartzap-cloudflare`.

## Passos

1. Abra `https://instalar.escoladeautomacao.com/smartzap/fork/`.
2. Crie o fork verdadeiro no GitHub.
   Ative o GitHub Actions no fork antes de proteger a branch, para que o check
   obrigatório `validar` possa executar nos pull requests.
   Depois da criação, confirme o vínculo e prepare a branch de sincronização com
   `npm run fork:verify -- --owner=SEU_OWNER --prepare --protect-main`. O comando recusa uma
   cópia sem vínculo com `thaleslaray/smartzap-cloudflare`.
   Com `--protect-main`, ele também exige pull request, histórico linear,
   resolução das conversas e o check `validar`, e proíbe force-push e exclusão
   da branch. O comando usa a autenticação local do GitHub do proprietário.
3. Gere `SMARTZAP_INSTALL_ID`, a chave do cofre e defina sua senha.
4. Baixe o recovery file e guarde-o fora do Git.
5. Em Workers & Pages, escolha **Import a repository** e selecione seu fork.
6. Use build `npm ci && npm run build` e deploy `npm run fork:deploy`.
7. Cadastre como Build secrets: `SMARTZAP_INSTALL_ID`, `MASTER_PASSWORD` e
   `SMARTZAP_VAULT_KEY`.
8. Configure o comando de branch não produtiva como `npm run fork:branch`.
   Somente `staging/*` cria recursos com sufixo `-staging`; `sync/*`,
   `customer/*` e branches desconhecidas validam sem publicar nada.
9. Após o deploy, abra `/setup` e conclua a homologação Meta real.

O bootstrap cria ou retoma somente recursos derivados de
`smartzap-xxxxxxxx`. Colisão sem ledger correspondente interrompe o deploy. A
baseline única é aplicada somente a D1 novo; atualizações usam apenas migrations
posteriores declaradas em `release/migrations.json`.

## Branches

- `main`: produção do proprietário;
- `upstream-sync` ou `sync/vX.Y.Z`: código oficial recebido;
- `customer/*`: customizações;
- branches de staging: deploy físico isolado antes do merge.

`customer/*` é criada somente quando houver uma customização real; o verificador
não cria uma branch artificial apenas para satisfazer o catálogo.

O comando `npm run fork:preview` continua disponível para execução manual e
explícita. Não o configure diretamente como comando geral de branches da
Cloudflare, pois isso faria uma proposta `sync/*` criar recursos antes da
aprovação.

Durable Objects, R2 e Queues exigem staging real; preview visual isolado não
substitui a homologação operacional.
