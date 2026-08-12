# Segurança

## Reportar vulnerabilidade

Não publique tokens, dados pessoais, provas de conceito exploráveis ou detalhes
de clientes em issues. Envie um advisory privado pelo GitHub Security Advisories
do repositório oficial. Inclua versão, impacto, reprodução mínima e mitigação.

## Cadeia de distribuição

- use somente tags SemVer e commits do repositório oficial;
- confira checksums do GitHub Release;
- mantenha lockfile e ações do workflow pinadas;
- guarde secrets exclusivamente na Cloudflare;
- não registre recovery files, `.dev.vars` ou configs geradas;
- revise a branch `sync/vX.Y.Z` antes de fazer merge;
- capture bookmark D1 antes de migration.

O provisionador OAuth mantém tokens cifrados apenas durante a sessão curta,
revoga a autorização ao concluir/desconectar e remove sessões abandonadas. Os
detalhes estão em [OAUTH_PRIVACY.md](OAUTH_PRIVACY.md).

Versões sem suporte de segurança explícito são fornecidas “como estão”. Uma
correção publicada não é aplicada automaticamente a forks ou instalações rápidas.
