# Base oficial de avaliação do SmartZap

## Produto

O SmartZap é uma aplicação de operação do WhatsApp Business construída sobre a API oficial da Meta. Ele reúne contatos, consentimento, segmentação, templates aprovados, campanhas, Inbox, status de entrega e agentes de inteligência artificial com base de conhecimento.

## Conexão oficial com a Meta

Para conectar o SmartZap são necessários uma conta do WhatsApp Business (WABA), um número habilitado para a Cloud API, o identificador do número, o identificador da WABA, um aplicativo Meta, um token de acesso válido e um webhook assinado inscrito no campo `messages`. O SmartZap não depende de automação do WhatsApp Web para sua operação oficial.

## Templates e janela de atendimento

Fora da janela de atendimento de 24 horas, a empresa inicia conversas usando um template aprovado pela Meta. Templates podem ter categoria Utility, Marketing ou Authentication e podem ser pausados ou rejeitados pela Meta. Dentro de uma janela aberta por mensagem do cliente, respostas livres podem ser enviadas conforme as políticas vigentes.

## Consentimento e opt-out

Um contato só é elegível para campanha quando existe opt-in explícito e evidência do consentimento. A ausência de opt-out não prova consentimento. Um pedido como “pare”, “sair” ou “não quero mais” deve suprimir novos envios e encaminhar a operação para atualização do consentimento.

Importar uma lista não autoriza iniciar contato para pedir autorização por template ou campanha. Sem evidência, os contatos permanecem inelegíveis; a coleta de consentimento precisa ocorrer por uma origem válida em que a própria pessoa manifeste a escolha, com registro da evidência.

## Inbox e atendimento

O Inbox permite listar, buscar e filtrar conversas, acompanhar não lidas, trocar texto e mídia, usar templates suportados, respostas rápidas, labels, notas, handoff e atendentes. Esta base não confirma os campos aceitos pelos filtros, atribuição ou designação de atendentes, criação de filas, categorias, distribuição automática, regras automáticas de encaminhamento, campos personalizados de conversa, SLA, taxa de resolução ou satisfação no Inbox. A IA não deve oferecer funções que não estejam confirmadas aqui.

## Segmentação

O público pode ser filtrado por tags, segmento salvo, país, DDI, UF, DDD e campos personalizados. O modo “mais alcance” combina critérios com OU. O modo “mais preciso” combina critérios com E. Filtros nunca tornam elegível um contato sem opt-in.

## Status de mensagem

`sent` significa que a Meta aceitou o envio. `delivered` significa entrega ao dispositivo ou conta destinatária. `read` significa leitura reportada pela Meta. `failed` significa falha e deve exibir código e detalhe operacional sanitizado. Um HTTP 200 isolado não comprova entrega.

## Segurança e confiabilidade

Webhooks são validados por assinatura, deduplicados e processados de forma idempotente. Retries não podem duplicar o efeito externo. O SmartZap não deve revelar tokens, chaves, prompts internos, dados de outro contato ou credenciais. Nunca deve afirmar que executou uma ação sem confirmação persistida.

Usar a API oficial, exigir opt-in, respeitar opt-out, trabalhar com templates aprovados e acompanhar falhas reduz riscos operacionais, mas não garante nem evita bloqueios. A decisão final também depende das políticas da Meta, da qualidade e do comportamento dos destinatários.

## Qualificação comercial

Uma qualificação útil coleta, sem repetir perguntas já respondidas: nome, empresa, objetivo e volume aproximado de contatos. Depois desses dados, o próximo passo é encaminhar para uma pessoa responsável por diagnóstico e proposta. Volume alto não elimina a obrigação de consentimento, segmentação e limite operacional.

## Preço, contrato e prazo

Esta base não contém preços, descontos, condições contratuais, SLA comercial nem prazo de implantação. Quando alguém pedir esses dados, a resposta correta é informar que não há confirmação na base e encaminhar para uma pessoa. O agente não pode inventar valores ou promessas.

## Handoff

Pedidos explícitos de atendimento humano, temas jurídicos, incidentes, cobrança não documentada, credenciais, dados de terceiros ou informação ausente devem ser encaminhados para uma pessoa. O agente deve explicar o motivo de forma breve e não continuar em loop.

## Escopo operacional

Quando a IA global está desligada ou a conversa está em modo humano, nenhuma resposta automática deve ser enviada. Agentes inativos podem ser simulados no laboratório, mas não podem assumir conversas reais. Se a base não retornar fonte relevante ou o provedor falhar, o sistema deve falhar fechado e permitir handoff.
