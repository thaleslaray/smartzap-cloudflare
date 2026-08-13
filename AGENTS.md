# Instruções permanentes do SmartZap

Estas regras valem para todo agente que trabalhar neste repositório.

## Documentos obrigatórios

- `jornada.md` é o catálogo vivo de todas as jornadas do usuário e integrações do produto.
- `Auditoria.md` é o registro cronológico e append-only das auditorias efetivamente executadas.
- `docs/auditoria-jornadas.md` é somente o histórico legado anterior a esta separação. Não registrar novas execuções nele.

## Regra para qualquer mudança de produto

Antes de concluir uma feature, correção ou mudança de comportamento:

1. Ler `jornada.md` e localizar as jornadas afetadas.
2. Adicionar ao `jornada.md` qualquer nova função, rota, estado, permissão, integração ou variação criada.
3. Atualizar a jornada existente quando o comportamento mudar.
4. Se um cenário esquecido for descoberto, registrá-lo imediatamente no `jornada.md` como `não testada`; não deixá-lo apenas no chat, em comentário ou na memória do agente.
5. Implementar ou atualizar a cobertura automatizada apropriada.
6. Não marcar uma jornada como `aprovada` sem evidência compatível com seu tipo.

Uma mudança funcional não está concluída se o `jornada.md` estiver desatualizado.

## Regra para auditorias

Toda solicitação de auditoria deve:

1. Começar pela leitura completa de `jornada.md`.
2. Conferir as rotas, APIs e funcionalidades reais do código contra o catálogo.
3. Incluir no `jornada.md` as jornadas ou variações ausentes antes de prosseguir.
4. Criar uma nova entrada em `Auditoria.md` com data, ambiente, versão, escopo e estado inicial.
5. Registrar por jornada o resultado, a evidência, os defeitos, as correções e o reteste.
6. Atualizar a mesma entrada durante a execução; nunca apagar ou reescrever auditorias anteriores.
7. Encerrar com números exatos de testes, jornadas aprovadas, pendências, bloqueios e versão publicada.

## Padrão de evidência

- Interface: executar pela interface real. Teste de unidade ou chamada direta à API não comprova a jornada visual.
- Integração externa: distinguir simulação, contrato local e confirmação real do provedor.
- Produção: registrar URL/ambiente, data e versão implantada, sem expor credenciais.
- Envio Meta: registrar somente IDs técnicos não secretos, destinatário autorizado de forma mascarada e progressão de status.
- Responsividade: registrar viewport e resultado.
- Falha corrigida: exigir reprodução, causa, correção, teste focal, regressão e reteste no ambiente relevante.

## Estados permitidos em `jornada.md`

- `não testada`
- `em teste`
- `aprovada`
- `falhou`
- `corrigida — reteste pendente`
- `bloqueada`
- `fora do escopo`
- `descontinuada`

Não usar `aprovada` para significar apenas “implementada”, “compilou” ou “a API respondeu”.

## Segurança e preservação

- Nunca registrar tokens, senhas, chaves privadas ou segredos nos documentos.
- Preservar dados e mudanças existentes do usuário.
- Testes destrutivos devem usar artefatos temporários identificáveis e removê-los ao final.
- Respeitar decisões de escopo registradas em `jornada.md`.

