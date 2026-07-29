import { z } from 'zod'

export type TemplateVariable = { component: 'header' | 'body' | 'button'; index: number; buttonIndex?: number }

const sourceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('contact_name'), fallback: z.string().max(1024).optional() }).strict(),
  z.object({ source: z.literal('contact_phone'), fallback: z.string().max(1024).optional() }).strict(),
  z.object({ source: z.literal('contact_email'), fallback: z.string().max(1024).optional() }).strict(),
  z.object({ source: z.literal('custom_field'), fieldId: z.string().uuid(), fallback: z.string().max(1024).optional() }).strict(),
  z.object({ source: z.literal('fixed'), value: z.string().max(1024) }).strict(),
])

export const variableMappingSchema = z.record(z.string(), sourceSchema)
export type VariableMapping = z.infer<typeof variableMappingSchema>

type TemplateComponent = { type?: unknown; text?: unknown; buttons?: unknown }

export function extractTemplateVariables(components: unknown): TemplateVariable[] {
  if (!Array.isArray(components)) throw new Error('componentes do template inválidos')
  const variables: TemplateVariable[] = []
  for (const raw of components) {
    if (!raw || typeof raw !== 'object') throw new Error('componente do template inválido')
    const component = raw as TemplateComponent
    const type = String(component.type ?? '').toLowerCase()
    if (type === 'header' || type === 'body') {
      const indexes = [...String(component.text ?? '').matchAll(/{{\s*(\d+)\s*}}/g)]
        .map((match) => Number(match[1]))
      for (const index of [...new Set(indexes)].sort((a, b) => a - b))
        variables.push({ component: type, index })
    }
    if (type === 'buttons' && Array.isArray(component.buttons)) {
      component.buttons.forEach((button, buttonIndex) => {
        const text = button && typeof button === 'object'
          ? String((button as { url?: unknown }).url ?? '') : ''
        const indexes = [...text.matchAll(/{{\s*(\d+)\s*}}/g)].map((match) => Number(match[1]))
        for (const index of [...new Set(indexes)].sort((a, b) => a - b))
          variables.push({ component: 'button', index, buttonIndex })
      })
    }
  }
  return variables
}

export function variableKey(variable: TemplateVariable): string {
  return variable.component === 'button'
    ? `button.${variable.buttonIndex}.${variable.index}`
    : `${variable.component}.${variable.index}`
}

function describeVariable(variable: TemplateVariable): string {
  const token = `{{${variable.index}}}`
  if (variable.component === 'header') return `a variável ${token} do cabeçalho`
  if (variable.component === 'button') return `a variável ${token} do botão ${Number(variable.buttonIndex) + 1}`
  return `a variável ${token} do conteúdo da mensagem`
}

export type RenderContact = {
  name: string | null
  phone: string
  email?: string | null
  customValues?: Record<string, string | number | boolean | null>
}

export function renderTemplateParameters(
  components: unknown,
  mappingInput: unknown,
  contact: RenderContact,
): { components: Array<Record<string, unknown>>; resolved: Record<string, string> } {
  const variables = extractTemplateVariables(components)
  const mapping = variableMappingSchema.parse(mappingInput)
  const resolved: Record<string, string> = {}

  for (const variable of variables) {
    const key = variableKey(variable)
    const source = mapping[key]
    if (!source) throw new Error(`mapeamento ausente para ${key}`)
    let raw: string | number | boolean | null | undefined
    if (source.source === 'contact_name') raw = contact.name
    else if (source.source === 'contact_phone') raw = contact.phone
    else if (source.source === 'contact_email') raw = contact.email
    else if (source.source === 'custom_field') raw = contact.customValues?.[source.fieldId]
    else raw = source.value
    const fallback = 'fallback' in source ? source.fallback : undefined
    const value = raw === null || raw === undefined || raw === '' ? fallback : String(raw)
    if (value === undefined || value === '')
      throw new Error(`${describeVariable(variable)} está sem valor para este contato. Escolha outra fonte ou informe um fallback para enviar um texto quando o campo estiver vazio.`)
    resolved[key] = value
  }

  const payloadComponents: Array<Record<string, unknown>> = []
  for (const group of ['header', 'body'] as const) {
    const groupVars = variables.filter((variable) => variable.component === group)
    if (groupVars.length) payloadComponents.push({
      type: group,
      parameters: groupVars.map((variable) => ({ type: 'text', text: resolved[variableKey(variable)] })),
    })
  }
  for (const variable of variables.filter((item) => item.component === 'button'))
    payloadComponents.push({
      type: 'button', sub_type: 'url', index: String(variable.buttonIndex),
      parameters: [{ type: 'text', text: resolved[variableKey(variable)] }],
    })
  return { components: payloadComponents, resolved }
}
