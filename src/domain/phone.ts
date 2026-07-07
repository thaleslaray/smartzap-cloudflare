import { parsePhoneNumberFromString } from 'libphonenumber-js'

export function normalizePhone(raw: string, defaultCountry: 'BR' = 'BR'): string | null {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry)
  return parsed?.isValid() ? parsed.number : null
}
