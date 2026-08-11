# SmartZap

WhatsApp oficial para campanhas, Inbox, contatos e templates, executado inteiramente na conta Cloudflare de quem instala.

## Candidata técnica — homologação final

O provisionador OAuth está em homologação física. Ele pode ser usado nos ensaios
controlados registrados em `Auditoria.md`; a divulgação como instalação simples
continua bloqueada até três instalações limpas aprovadas.

1. Abra o **[instalador seguro do SmartZap](https://smartzap-provisioner.thales2581.workers.dev/)**.
2. Autorize a Cloudflare pelo OAuth oficial e escolha explicitamente a conta de destino.
3. Defina sua senha administrativa; a chave do cofre é criada no navegador.
4. Baixe o arquivo de recuperação e guarde-o em um gerenciador de senhas.
5. Confira o plano somente leitura. Recurso incompatível ou sem ledger bloqueia a execução.
6. Instale e abra o `/setup` indicado ao final.
7. Cadastre a Meta, configure o webhook, sincronize os templates e conclua a mensagem real de homologação.

O instalador não pede senha da Cloudflare, API Token, CLI, GitHub Actions nem
configuração manual de bindings. Tokens OAuth ficam cifrados no D1 do control
plane, expiram em até 30 minutos e são apagados após instalação, desconexão ou
limpeza de sessão abandonada.

## O que o provisionador cria na conta escolhida

- Worker e assets da aplicação;
- D1 com uma única baseline final atômica;
- R2 para mídia;
- Queues e DLQs de webhook, automação e conversões;
- Durable Objects de tempo real e controle de vazão;
- Workflow de campanhas e Workflow isolado de diagnóstico do instalador;
- Cron operacional e rate limit de login;
- Workers AI disponível, mas desligado até ativação explícita.

AI Search não faz parte do núcleo. Se o usuário ativar a base de conhecimento de
IA no `/setup`, o assistente só apresenta o módulo como pronto depois de confirmar
um namespace próprio.

Antes de qualquer criação, o plano deriva nomes exclusivos do identificador
`smartzap-xxxxxxxx`, consulta cada recurso e classifica-o como `criar`,
`reutilizar` pelo mesmo ledger ou `bloquear`. A baseline D1, o Worker e os assets
são validados por SHA-256. Falha antes da liberação remove somente os recursos
criados pela rodada; uma nova sessão OAuth pode retomar a mesma instalação sem
duplicar versões ou consumidores.

## Segurança das credenciais

- `SMARTZAP_VAULT_KEY` é uma chave base64url de 256 bits e existe somente como secret do Worker.
- Tokens e segredos externos são cifrados com AES-256-GCM antes de entrar no D1.
- Cada registro usa IV aleatório e dados autenticados vinculados ao nome e à versão da chave.
- APIs e logs devolvem somente estado de configuração; nunca plaintext, prefixo de token ou chave.
- Perder a chave exige recadastrar as integrações. O arquivo de recuperação não é enviado ao SmartZap.
- Instalações antigas continuam podendo usar secrets do Worker durante a migração para o cofre.

### Rotação sem expor a nova chave ao aplicativo

1. Gere outra chave de 256 bits em `/install` e guarde o novo arquivo de recuperação.
2. Adicione-a temporariamente aos secrets do Worker como `SMARTZAP_VAULT_KEY_NEXT`.
3. Em `/setup`, use **Rotacionar cofre**. Todos os registros são recifrados em uma transação D1 única.
4. Promova o mesmo valor para `SMARTZAP_VAULT_KEY` e remova `SMARTZAP_VAULT_KEY_NEXT`.
5. Volte a `/setup`, use **Finalizar promoção** e valide Meta, templates e mensagem real.

Durante a transição o runtime tenta as duas chaves e bloqueia novas gravações no cofre. Se a execução cair antes de concluir a transação, o botão **Recuperar rotação interrompida** fica disponível após 15 minutos; ele só libera o cofre se todos os registros ainda abrirem com a chave ativa. A API de rotação nunca recebe nem devolve o valor das chaves. Se o arquivo de recuperação for perdido, a saída segura é gerar uma nova chave e recadastrar as integrações externas.

## Assistente `/setup`

O núcleo só é liberado quando estes gates passam:

1. D1, R2, filas e cada DLQ, Workflow real de diagnóstico, binding do Workflow de campanhas, Durable Objects, rate limit e Cron disponíveis.
2. Chave do cofre válida.
3. Token, App ID, App Secret, Verify Token, Phone Number ID e WABA validados ao vivo na Meta.
4. Webhook configurado em `https://SEU-DOMINIO/webhook`.
5. Pelo menos um template aprovado sincronizado.
6. Mensagem enviada para contato autorizado e confirmada como `sent → delivered → read` pelo webhook e Queue.

IA, CAPI, calendário, MiniApps dinâmicos e demais integrações são módulos opcionais e não bloqueiam o núcleo.

## Configuração do webhook Meta

No painel do aplicativo Meta:

- callback: copie exatamente a URL mostrada em `/setup`;
- verify token: use o valor cadastrado no assistente;
- campos obrigatórios: `messages`, `user_preferences` e `message_template_status_update`;
- confirme a inscrição do aplicativo em `WABA_ID/subscribed_apps`.

O SmartZap valida assinatura HMAC do `POST`, token do `GET`, aplicativo, WABA, número, escopos e callback efetivo.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior e Wrangler autenticado.

```sh
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Gere valores locais seguros para os dois campos vazios de `.dev.vars`. Não copie credenciais produtivas para o repositório.

Validação principal:

```sh
npm test
npx tsc --noEmit
npm run build
npm run e2e
```

## Variáveis e módulos opcionais

O provisionador solicita somente:

- `MASTER_PASSWORD`;
- `SMARTZAP_VAULT_KEY`.

As demais integrações são cadastradas após o deploy ou mantidas desligadas:

- `AI_ENABLED=false` por padrão;
- `INBOX_AUTOMATION_ENABLED=false` por padrão;
- Turnstile só deve ser ativado junto das duas chaves;
- CAPI exige Dataset e permissões Meta próprias;
- Google Calendar exige OAuth e chave de criptografia próprios;
- MiniApps dinâmicos exigem par RSA e endpoint de dados.

## Limites de evidência

Build e testes locais não provam instalação física. A divulgação como one-click exige, no mínimo:

- três instalações sem CLI em contas Cloudflare limpas;
- cobertura em conta gratuita e paga;
- interrupção, retomada, colisão de nomes e falha de provisionamento;
- Meta e webhook reais;
- ausência de credenciais no Git, D1 em plaintext, frontend e logs;
- cleanup sem recurso residual;
- regressão em Chromium, Firefox, WebKit e seis larguras.


## Licença

MIT. Consulte [`LICENSE`](./LICENSE).
