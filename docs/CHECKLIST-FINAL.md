# CHECKLIST FINAL - SmartZap

> Siga na ordem. Cada item depende dos anteriores.

---

## FASE 1: ACESSO E CONFIGURAÇÃO

### 1.1 Login
- [ ] Acessar `/login`
- [ ] Fazer login com master password
- [ ] Verificar que redirecionou pro dashboard

### 1.2 Health Check
- [ ] Acessar `/api/health` - deve retornar OK
- [ ] Dashboard carrega sem erros

### 1.3 Configurações WhatsApp
- [ ] Ir em `/settings`
- [ ] Preencher credenciais WhatsApp (token, phone ID, business ID)
- [ ] Clicar "Testar Conexão" - deve mostrar sucesso
- [ ] Ver display name e quality rating aparecem

### 1.4 Webhook
- [ ] Verificar webhook está configurado na Meta
- [ ] Ver info do webhook em Settings

---

## FASE 2: CONTATOS

### 2.1 Importar Contatos
- [ ] Ir em `/contacts`
- [ ] Clicar "Importar"
- [ ] Fazer upload de CSV com contatos de teste
- [ ] Verificar validação de telefones (formato E.164)
- [ ] Confirmar importação

### 2.2 Verificar Contatos
- [ ] Ver contatos importados na lista
- [ ] Buscar contato por nome
- [ ] Buscar contato por telefone
- [ ] Filtrar por status (Opt-in)

### 2.3 Custom Fields
- [ ] Criar um custom field (ex: "Cidade")
- [ ] Editar um contato e preencher o custom field
- [ ] Verificar que aparece na lista

### 2.4 Tags
- [ ] Adicionar tag a um contato
- [ ] Filtrar contatos por tag
- [ ] Remover tag

---

## FASE 3: TEMPLATES

### 3.1 Sincronizar Templates
- [ ] Ir em `/templates`
- [ ] Clicar "Sincronizar com Meta"
- [ ] Aguardar sincronização
- [ ] Ver templates listados com status (APPROVED, PENDING, REJECTED)
- [ ] Filtrar por categoria (Marketing, Utilidade)
- [ ] Filtrar por status

### 3.2 Verificar Templates Existentes
- [ ] Clicar em um template aprovado
- [ ] Ver preview completo (header, body, footer, buttons)
- [ ] Identificar variáveis do template ({{1}}, {{2}}, etc)
- [ ] Ver detalhes do template (idioma, categoria)

### 3.3 Template Marketing - Texto Simples
- [ ] Clicar "Novo Template"
- [ ] Selecionar categoria: MARKETING
- [ ] Header: TEXTO com variável {{1}}
- [ ] Body: texto com variáveis {{1}}, {{2}}
- [ ] Footer: texto simples
- [ ] Sem botões
- [ ] Ver preview
- [ ] Salvar rascunho
- [ ] Enviar para aprovação na Meta

### 3.4 Template Marketing - Com Imagem
- [ ] Criar novo template
- [ ] Categoria: MARKETING
- [ ] Header: IMAGEM (fazer upload de imagem de teste)
- [ ] Body: texto promocional com variável
- [ ] Adicionar botão Quick Reply (ex: "Tenho interesse")
- [ ] Adicionar botão Quick Reply (ex: "Não, obrigado")
- [ ] Ver preview com imagem
- [ ] Salvar rascunho

### 3.5 Template Marketing - Com Vídeo
- [ ] Criar novo template
- [ ] Categoria: MARKETING
- [ ] Header: VÍDEO (fazer upload de vídeo curto)
- [ ] Body: texto com CTA
- [ ] Adicionar botão CTA - URL (ex: "Ver mais")
- [ ] Ver preview com player de vídeo
- [ ] Salvar rascunho

### 3.6 Template Utilidade - Com Documento
- [ ] Criar novo template
- [ ] Categoria: UTILIDADE
- [ ] Header: DOCUMENTO (fazer upload de PDF)
- [ ] Body: "Segue seu documento {{1}}"
- [ ] Adicionar botão CTA - Telefone
- [ ] Ver preview com ícone de documento
- [ ] Salvar rascunho

### 3.7 Template com Botões CTA
- [ ] Criar novo template
- [ ] Adicionar botão: URL (link externo)
- [ ] Adicionar botão: Telefone (ligar)
- [ ] Verificar limite de botões CTA (máx 2)
- [ ] Ver preview com botões

### 3.8 Gerenciar Rascunhos
- [ ] Ir em aba "Rascunhos"
- [ ] Ver lista de rascunhos criados
- [ ] Editar um rascunho
- [ ] Deletar um rascunho
- [ ] Submeter rascunho para Meta

### 3.9 Acompanhar Submissões
- [ ] Ver status das submissões pendentes
- [ ] Aguardar aprovação/rejeição da Meta
- [ ] Se rejeitado, ver motivo da rejeição

---

## FASE 4: CAMPANHAS

### 4.1 Criar Campanha
- [ ] Ir em `/campaigns`
- [ ] Clicar "Nova Campanha"
- [ ] Dar nome à campanha
- [ ] Selecionar template (da lista sincronizada)
- [ ] Preencher variáveis do template
- [ ] Ver preview da mensagem

### 4.2 Selecionar Destinatários
- [ ] Selecionar contatos para enviar
- [ ] Ou usar filtro/segmento
- [ ] Ver contagem de destinatários

### 4.3 Enviar Campanha
- [ ] Clicar "Enviar Agora"
- [ ] Confirmar envio
- [ ] Ver status mudar para "Enviando"

### 4.4 Monitorar Campanha
- [ ] Ver contadores atualizando (enviados, entregues, lidos)
- [ ] Aguardar status "Concluído"
- [ ] Clicar na campanha para ver detalhes
- [ ] Ver status individual de cada contato

### 4.5 Agendar Campanha
- [ ] Criar nova campanha
- [ ] Selecionar "Agendar"
- [ ] Escolher data/hora (5 min no futuro)
- [ ] Salvar
- [ ] Aguardar horário e verificar que enviou

### 4.6 Organização
- [ ] Criar pasta para campanhas
- [ ] Mover campanha para pasta
- [ ] Duplicar campanha existente

---

## FASE 5: INBOX

### 5.1 Receber Mensagem
- [ ] Enviar mensagem do WhatsApp pessoal para o número conectado
- [ ] Ir em `/inbox`
- [ ] Ver conversa aparecer na lista

### 5.2 Responder
- [ ] Abrir conversa
- [ ] Ver histórico de mensagens
- [ ] Digitar resposta
- [ ] Enviar
- [ ] Ver mensagem aparecer no histórico

### 5.3 Quick Replies
- [ ] Criar quick reply em Settings
- [ ] Usar quick reply na conversa
- [ ] Verificar mensagem enviada

### 5.4 Status da Conversa
- [ ] Marcar conversa como lida
- [ ] Pausar automação (handoff)
- [ ] Retomar automação

### 5.5 Realtime
- [ ] Manter inbox aberto
- [ ] Enviar outra mensagem do WhatsApp pessoal
- [ ] Ver mensagem aparecer sem dar refresh

---

## FASE 6: FLOWS (Beta)

### 6.1 Criar Flow
- [ ] Ir em `/flows`
- [ ] Clicar "Novo Flow"
- [ ] Dar nome ao flow

### 6.2 Construir Flow
- [ ] Adicionar nó "Start"
- [ ] Adicionar nó "Message"
- [ ] Conectar Start → Message
- [ ] Adicionar nó "Input" (coletar resposta)
- [ ] Conectar Message → Input
- [ ] Adicionar nó "End"
- [ ] Conectar Input → End

### 6.3 Publicar Flow
- [ ] Clicar "Publicar"
- [ ] Ver status "Publicado"

### 6.4 Testar Flow
- [ ] Disparar flow para um contato
- [ ] Responder às mensagens
- [ ] Ver submissão registrada

---

## FASE 7: FORMULÁRIOS (Beta)

### 7.1 Criar Formulário
- [ ] Ir em `/forms`
- [ ] Clicar "Novo Formulário"
- [ ] Dar nome
- [ ] Adicionar campos

### 7.2 Publicar
- [ ] Salvar formulário
- [ ] Copiar link público

### 7.3 Testar
- [ ] Abrir link em aba anônima (sem login)
- [ ] Preencher formulário
- [ ] Submeter
- [ ] Verificar que contato foi criado com os dados

---

## FASE 8: AI AGENTS (Beta)

### 8.1 Configurar IA
- [ ] Ir em Settings > AI
- [ ] Configurar API key do provedor (Gemini/OpenAI)
- [ ] Testar conexão

### 8.2 Criar Agente
- [ ] Ir em `/settings/ai/agents`
- [ ] Criar novo agente
- [ ] Configurar system prompt
- [ ] Salvar

### 8.3 Testar Agente
- [ ] Usar agente em um flow
- [ ] Ou testar resposta diretamente
- [ ] Verificar qualidade da resposta

---

## FASE 9: TESTES FINAIS

### 9.1 Fluxo Completo de Campanha
- [ ] Importar 3 novos contatos
- [ ] Criar campanha para esses 3
- [ ] Enviar
- [ ] Ver os 3 receberem
- [ ] Ver status "Concluído"

### 9.2 Fluxo Completo de Conversa
- [ ] Receber mensagem no inbox
- [ ] Responder
- [ ] Ver resposta chegar no WhatsApp do usuário

### 9.3 Rate Limit
- [ ] Enviar campanha para mesmo contato 2x seguidas
- [ ] Verificar que respeitou intervalo de 6 segundos

### 9.4 Erro e Recuperação
- [ ] Pausar campanha em andamento
- [ ] Retomar campanha
- [ ] Verificar que continuou de onde parou

### 9.5 Logout
- [ ] Fazer logout
- [ ] Tentar acessar `/campaigns` - deve redirecionar pro login

---

## RESULTADO

**Data do teste:** _______________

**Itens OK:** _____ / 171

**Problemas encontrados:**
1.
2.
3.

**Decisão final:** [ ] APROVADO  [ ] PRECISA AJUSTES

---

> Parabéns! Se chegou aqui com tudo OK, o SmartZap está pronto. 🚀
