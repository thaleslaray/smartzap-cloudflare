// Taxonomia operacional baseada nos códigos oficiais da Cloud API.
// `critical` significa que repetir para outros contatos tende a reproduzir a falha.
export type ErrInfo = { critical: boolean; optOut: boolean; retryable: boolean; message: string }

const CRITICAL: Record<number, string> = {
  0: 'Falha de autenticação — token inválido ou expirado.',
  3: 'Aplicativo sem capacidade ou permissão para esta operação.',
  10: 'Permissão Meta ausente ou removida.',
  100: 'Payload incompatível com o contrato da Meta.',
  190: 'Token Meta expirado ou inválido.',
  200: 'Token ausente ou permissão Meta removida.',
  368: 'Conta WhatsApp restrita por política.',
  130497: 'Conta restrita para mensagens no país do destinatário.',
  131005: 'Permissão WhatsApp Business ausente ou removida.',
  131008: 'Parâmetro obrigatório ausente no envio.',
  131009: 'Parâmetro inválido no envio.',
  131042: 'Problema de pagamento na conta Meta — envios bloqueados.',
  131045: 'Número remetente não está registrado.',
  131057: 'Conta WhatsApp em modo de manutenção.',
  131063: 'Templates de marketing estão desativados nesta configuração.',
  131064: 'Limite atingido por violações de classificação de templates.',
  132000: 'Quantidade de parâmetros não confere com o template.',
  132001: 'Template inexistente, não aprovado ou ausente no idioma.',
  132015: 'Template pausado por baixa qualidade.',
  132016: 'Template desativado após pausas por baixa qualidade.',
}

const RETRYABLE: Record<number, string> = {
  1: 'Erro temporário ou requisição inválida na Meta.',
  2: 'Serviço Meta temporariamente indisponível.',
  4: 'Limite de chamadas do aplicativo atingido.',
  130429: 'Throughput da Cloud API atingido.',
  131016: 'Serviço Meta temporariamente indisponível.',
  131056: 'Limite por par remetente/destinatário atingido.',
  133004: 'Servidor Meta temporariamente indisponível.',
}

const TERMINAL: Record<number, { message: string; optOut?: boolean }> = {
  130403: { message: 'A empresa bloqueou este usuário; não repetir.' },
  131026: { message: 'Destinatário indisponível ou número inválido.' },
  131047: { message: 'Janela de 24h expirada; mensagem não-template não permitida.' },
  131049: { message: 'Limite de marketing por usuário; não repetir antes de 24 horas.' },
  131050: { message: 'Usuário interrompeu mensagens de marketing (opt-out).', optOut: true },
  131051: { message: 'Tipo de mensagem não suportado.' },
}

export function mapWhatsAppError(code: number, httpStatus = code): ErrInfo {
  if (CRITICAL[code])
    return { critical: true, optOut: false, retryable: false, message: CRITICAL[code] }
  if (RETRYABLE[code])
    return { critical: false, optOut: false, retryable: true, message: RETRYABLE[code] }
  const terminal = TERMINAL[code]
  if (terminal)
    return { critical: false, optOut: terminal.optOut ?? false, retryable: false, message: terminal.message }
  const retryable = httpStatus === 408 || httpStatus === 429 || httpStatus >= 500
  return { critical: false, optOut: false, retryable, message: `Erro Meta ${code}.` }
}
