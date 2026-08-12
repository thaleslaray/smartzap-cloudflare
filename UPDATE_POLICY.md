# Política de atualizações do SmartZap Community

O SmartZap Community é open-source e autogerenciado. O projeto publica código,
releases e instruções; não opera, monitora, migra ou atualiza instalações de
terceiros.

## Modelos de instalação

| Modelo | Atualização | Quem decide e executa |
|---|---|---|
| Fork próprio | Manual, por pull request do upstream | Proprietário do fork |
| Instalação rápida OAuth | Não incluída; versão instalada permanece fixa | Proprietário |
| Serviço gerenciado | Somente por contrato separado | Prestador contratado |

Uma release oficial nunca faz merge, aplica migration, resolve conflito ou
promove produção automaticamente. O workflow opcional
`.github/workflows/upstream-sync.yml` apenas cria `sync/vX.Y.Z` a partir da tag
oficial e abre um pull request para revisão.

## Canais

- `stable`: candidata a produção após os gates documentados;
- `rc`: homologação de release;
- `beta`: experimentação.

Produção deve apontar para uma tag SemVer exata (`v1.2.3`), jamais para
`latest`. Cada release informa commit, checksums, schema, migrations, requisitos,
breaking changes e recuperação.

## Fluxo recomendado

1. Buscar a tag oficial, verificar sua assinatura e criar `sync/vX.Y.Z`.
2. Revisar changelog, checksums, migrations e conflitos.
3. Executar testes sem publicar.
4. Capturar bookmark D1 e backups necessários.
5. Homologar no ambiente físico de staging, com recursos separados.
6. Aprovar o pull request.
7. Permitir que Workers Builds publique o `main` do proprietário.
8. Validar `/setup`, health, filas e webhooks.

Consulte [docs/UPGRADING.md](docs/UPGRADING.md) e
[docs/MIGRATIONS_AND_ROLLBACK.md](docs/MIGRATIONS_AND_ROLLBACK.md).
