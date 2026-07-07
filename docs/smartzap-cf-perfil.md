# Perfil de mercado e persona — smartzap-cf

**Fase 2 (Discovery) da /planejar** · 2026-07-05
Fonte: pesquisa em funil verificada (Phase Gate aprovado) — relatório completo em `~/pesquisas/pesquisa-mercado-whatsapp-smartzap-2026-07-05.md`

## O mercado em uma frase

WhatsApp é o canal dominante de vendas no Brasil (82% dos pequenos negócios o têm como canal principal — Sebrae; 65% o apontam como o canal que mais converte — Zenvia/Opinion Box), mas quem opera marketing nele ainda sofre de esforço manual (dor nº 1, 48% — RD Station) e o mercado de ferramentas bifurca entre SaaS caro e pirata arriscado.

## Personas (para quem o smartzap-cf existe)

### 1. Operador de PME digital (persona primária)
- WhatsApp é O canal de vendas; usa (ou quer usar) a API oficial sem pagar R$ 99–450/mês de plataforma.
- Sabe seguir um guia técnico ou tem alguém que saiba (deploy `wrangler deploy` é aceitável; wizard morreu junto com o installer).
- Dores: esforço manual de disparos, medo de banimento, custo de plataforma que come a margem.

### 2. Infoprodutor / lançador
- Bases de 500–10.000 leads, minoria ativa; precisa de campanhas segmentadas de reativação e lançamento (estimativas Nexxou — hipótese, não dado auditado).
- Dores: segmentação pobre, opt-out/compliance, reaproveitar a base sem queimar o número.

### 3. Agência (persona secundária)
- Gerencia números de vários clientes (multi-instância = várias implantações single-tenant).
- Dores: métricas granulares por campanha (enviada/entregue/lida/respondida) para provar ROI; opt-in documentado (LGPD art. 7º) para não expor o cliente.

## Posicionamento

**"Self-hosted, API oficial, custo de infra ~zero."** Entre o SaaS oficial (R$ 99–450+/mês) e o self-hosted pirata (Evolution API, custo zero mas número em risco), o smartzap-cf ocupa o meio: você paga só as taxas da Meta + ~US$ 5/mês de Cloudflare, com dados próprios e API oficial.
⚠️ Confiança MÉDIA: o "vão" no mercado vem de fontes comerciais; tratar como hipótese de posicionamento a validar, não fato.

## O fato de mercado que valida o escopo do MVP (confiança ALTA)

Mudança de pricing da Meta confirmada em 01/07/2026 (vigência 01/10/2026):
- **Templates NÃO mudaram**: marketing R$ 0,3217 · utility R$ 0,035 · auth R$ 0,035 (BRL, oficial).
- **Respostas não-template passam a custar R$ 0,035 cada** (humano ou IA de terceiros), com 2 exceções: agentes Meta Business Agents (US$ 2/1M tokens) e janela 72h de click-to-WhatsApp ads.
- Consequência para o produto: o MVP (campanhas com template) tem economia INALTERADA; a onda futura do inbox/IA precisará de análise de custo própria (R$ 0,035/resposta × volume de conversa) — decisão registrada para quando a onda chegar.
- Billing em BRL obrigatório para WABAs brasileiras até 30/06/2027 (migração de moeda — checar no cutover).

## Implicações diretas no produto

1. **Opt-in é feature, não burocracia**: importação CSV deve ter campo/fluxo de consentimento documentado (LGPD + política Meta anti-spam).
2. **Métricas granulares por campanha** (enviada/entregue/lida/respondida/falha) são o argumento de valor nº 1 para agência — já está no schema (campaign_contacts + status_events).
3. **Warm-up/throttle adaptativo** protege contra ban por volume súbito — o PhoneThrottle DO não é otimização, é feature de sobrevivência.
4. **Custo por campanha visível**: com pricing por mensagem em BRL, mostrar custo estimado da Meta antes do dispatch (total × R$ 0,3217) é trivial e diferencia.
5. **Inbox (onda 2)**: reavaliar economia sob a cobrança de respostas; a janela de 72h de CTWA e o pricing de Meta Business Agents entram nessa análise.

## Confiança e limites desta pesquisa

- ALTA: pricing Meta (fonte oficial + 2 veículos independentes convergentes).
- MÉDIA: paisagem competitiva (rankings comerciais Tier C — ordens de grandeza) e persona (pesquisas primárias de vendors: RD Station fonte única robusta; OmniChat dado proprietário).
- Fatos-chave: 2/5 confirmados independentes, 1/5 corroborado direcionalmente, 2/5 fonte única (detalhe no relatório).
