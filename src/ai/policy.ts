export type AutomationPolicyDecision = {
  text: string;
  handoffReason: string | null;
};

function normalizeIntent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Regras operacionais que não podem depender da qualidade variável do RAG.
 * Elas não inventam condições comerciais: transferem a negociação para humano
 * e explicam apenas estados canônicos persistidos pelo próprio SmartZap.
 *
 * Esta função é compartilhada pela automação real e pelo simulador de agentes
 * para impedir que os dois canais apresentem respostas contraditórias.
 */
export function automationPolicyDecision(
  latestText: string,
  handoffEnabled = true,
): AutomationPolicyDecision | null {
  const text = normalizeIntent(latestText);
  if (!text) return null;

  const asksForHuman = [
    /\b(?:falar|conversar) com (?:uma )?(?:pessoa|atendente|humano|alguem)\b/,
    /\b(?:atendimento|suporte) humano\b/,
    /\bquero (?:um )?atendente\b/,
  ].some((pattern) => pattern.test(text));
  const asksForSecretDisclosure = [
    /\b(?:mostre|mostrar|revele|revelar|exiba|exibir|forneca|fornecer|passe|passar)\b.*\b(?:token|tokens|senha|senhas|segredo|segredos|credencial|credenciais|chave da api|api key)\b/,
    /\b(?:diga|informe|envie)\b.*\b(?:o|a|os|as)\b.*\b(?:token|tokens|senha|senhas|segredo|segredos|credencial|credenciais|chave da api|api key)\b/,
  ].some((pattern) => pattern.test(text));
  if (asksForSecretDisclosure) {
    return {
      text:
        "Não posso divulgar tokens, senhas, chaves de API, credenciais ou outros segredos do sistema. Esses dados devem permanecer protegidos e acessíveis somente a responsáveis autorizados.",
      handoffReason: null,
    };
  }

  const asksForBulkDispatch = [
    /\b(?:lista|base)\b.*\b(?:contatos?|clientes?|leads?)\b.*\b(?:disparar|enviar|mandar|campanha)\b/,
    /\b(?:disparar|enviar|mandar|campanha)\b.*\b(?:todos?|toda|lista|base|contatos?|clientes?|leads?)\b/,
  ].some((pattern) => pattern.test(text));
  if (asksForBulkDispatch) {
    return {
      text:
        "Não é seguro disparar para toda a lista apenas porque os contatos estão cadastrados. Cada destinatário precisa ter opt-in explícito e evidência de consentimento, além de pertencer a um segmento elegível; sem isso, a campanha não deve ser enviada.",
      handoffReason: null,
    };
  }

  const asksForImpossibleGuarantee = [
    /\b(?:garanta|garantir|garantia)\b.*\b(?:nunca|zero|100|cem por cento)\b.*\b(?:indisponibilidade|falha|queda|interrupcao|downtime)\b/,
    /\b(?:contrato|sla)\b.*\b(?:nunca|zero|100|cem por cento)\b.*\b(?:indisponibilidade|falha|queda|interrupcao|downtime)\b/,
  ].some((pattern) => pattern.test(text));
  if (asksForImpossibleGuarantee) {
    return {
      text: handoffEnabled
        ? "Não é possível garantir em contrato que nunca haverá indisponibilidade. SLAs e responsabilidades precisam refletir limites reais; vou encaminhar o pedido para uma pessoa responsável revisar a condição contratual."
        : "Não é possível garantir em contrato que nunca haverá indisponibilidade. SLAs e responsabilidades precisam refletir limites reais e ser revisados por uma pessoa responsável.",
      handoffReason: handoffEnabled
        ? "Cliente solicitou garantia absoluta de disponibilidade"
        : null,
    };
  }

  const asksForCommercialDecision = [
    /\bquanto custa\b/,
    /\bpreco(?:s)?\b/,
    /\bvalor (?:do|dos|da|das) (?:plano|planos|smartzap|contrato)\b/,
    /\b(?:quero|preciso|podem|pode) (?:de )?(?:uma )?proposta\b/,
    /\bquero contratar\b/,
    /\b(?:prazo|tempo) (?:de|para|da) implantacao\b/,
    /\bem quanto tempo (?:fica|implanta|implantam|voc[e]?s implantam)\b/,
    /\b(?:desconto|condicao contratual|condicoes contratuais|condicoes de pagamento|sla)\b/,
  ].some((pattern) => pattern.test(text));
  if (handoffEnabled && asksForHuman) {
    return {
      text:
        "Entendi. Vou encaminhar a conversa para uma pessoa responsável continuar o atendimento.",
      handoffReason: "Cliente solicitou atendimento humano",
    };
  }
  if (handoffEnabled && asksForCommercialDecision) {
    return {
      text:
        "Preço, prazo de implantação e condições contratuais precisam ser confirmados pelo time comercial. Vou encaminhar sua solicitação para uma pessoa responsável preparar a proposta da sua operação.",
      handoffReason: "Cliente solicitou preço, prazo ou proposta comercial",
    };
  }

  const asksForDeliveryStatuses = [
    /\b(?:quais? (?:sao )?(?:os )?)?(?:quatro )?(?:nomes? (?:exatos? )?(?:dos? )?)?(?:status|estados) (?:de|da|das|do|dos) (?:mensag[a-z]*|envio|entrega)\b/,
    /\b(?:status|estados|acompanhar|acompanho|distingue|diferenca)\b.*\b(?:meta|aceit[a-z]*|enviad[a-z]*|entreg[a-z]*|lid[a-z]*|leituras?|falh[a-z]*)\b/,
    /\b(?:sent|delivered|read|failed)\b.*\b(?:sent|delivered|read|failed)\b/,
    /\bhttp 200\b.*\b(?:entreg[a-z]*|lid[a-z]*|leituras?)\b/,
  ].some((pattern) => pattern.test(text));
  if (asksForDeliveryStatuses) {
    return {
      text:
        "O SmartZap distingue estes estados: sent = aceita pela Meta; delivered = entregue ao destinatário; read = leitura confirmada; failed = falha registrada com código e detalhe sanitizados. HTTP 200 sozinho não comprova entrega nem leitura.",
      handoffReason: null,
    };
  }

  return null;
}
