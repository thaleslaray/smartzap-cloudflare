// Subconjunto do mapa de erros Meta relevante ao envio de campanha.
// Referência completa: repo antigo lib/whatsapp-errors.ts + developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
type ErrInfo = { critical: boolean; optOut: boolean; message: string }

const ERRORS: Record<number, ErrInfo> = {
  131042: { critical: true, optOut: false, message: 'Problema de pagamento na conta Meta — envios bloqueados.' },
  0:      { critical: true, optOut: false, message: 'Falha de autenticação — token inválido ou expirado.' },
  190:    { critical: true, optOut: false, message: 'Token expirado.' },
  131056: { critical: false, optOut: false, message: 'Limite de mensagens para este destinatário (1 msg/6s) — tente depois.' },
  131050: { critical: false, optOut: true,  message: 'Usuário bloqueou mensagens da empresa (opt-out).' },
  131026: { critical: false, optOut: false, message: 'Destinatário indisponível ou número inválido.' },
  131047: { critical: false, optOut: false, message: 'Janela de 24h expirada — mensagem exige template.' },
  132000: { critical: false, optOut: false, message: 'Número de parâmetros do template não confere.' },
  132001: { critical: false, optOut: false, message: 'Template inexistente ou não aprovado para o idioma.' },
}

export function mapWhatsAppError(code: number): ErrInfo {
  return ERRORS[code] ?? { critical: false, optOut: false, message: `Erro Meta ${code}.` }
}
