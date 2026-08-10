export function redactOperationalDetail(value: unknown): string {
  const text = typeof value === 'string' ? value : 'erro desconhecido'
  return text
    .replace(/\b(?:EA[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{40,})\b/g, '[REDACTED_SECRET]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[REDACTED_ID]')
    .slice(0, 500)
}
