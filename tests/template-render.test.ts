import { describe, expect, it } from 'vitest'
import { extractTemplateVariables, renderTemplateParameters } from '../src/domain/template-render'

const fieldId = '123e4567-e89b-12d3-a456-426614174000'
const components = [
  { type: 'HEADER', format: 'TEXT', text: 'Pedido {{1}}' },
  { type: 'BODY', text: 'Olá {{1}}, seu código é {{2}}.' },
  { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://exemplo.com/{{1}}' }] },
]

describe('renderização determinística de template', () => {
  it('extrai variáveis por componente e índice', () => {
    expect(extractTemplateVariables(components)).toEqual([
      { component: 'header', index: 1 },
      { component: 'body', index: 1 },
      { component: 'body', index: 2 },
      { component: 'button', buttonIndex: 0, index: 1 },
    ])
  })

  it('resolve contato, custom field, fixo e fallback no mesmo payload do envio', () => {
    const result = renderTemplateParameters(components, {
      'header.1': { source: 'fixed', value: 'ABC-1' },
      'body.1': { source: 'contact_name', fallback: 'cliente' },
      'body.2': { source: 'custom_field', fieldId },
      'button.0.1': { source: 'contact_phone' },
    }, { name: null, phone: '+5521999999999', customValues: { [fieldId]: 42 } })
    expect(result.resolved).toEqual({
      'header.1': 'ABC-1', 'body.1': 'cliente', 'body.2': '42', 'button.0.1': '+5521999999999',
    })
    expect(result.components[1]).toEqual({
      type: 'body', parameters: [{ type: 'text', text: 'cliente' }, { type: 'text', text: '42' }],
    })
  })

  it('resolve e-mail do contato como variável dinâmica', () => {
    const result = renderTemplateParameters(
      [{ type: 'BODY', text: 'Olá {{1}}' }],
      { 'body.1': { source: 'contact_email' } },
      { name: 'Ana', phone: '+5521999999999', email: 'ana@example.com' },
    )
    expect(result.resolved['body.1']).toBe('ana@example.com')
  })

  it('falha fechado quando variável obrigatória não pode ser resolvida', () => {
    expect(() => renderTemplateParameters(components, {
      'header.1': { source: 'fixed', value: 'ABC-1' },
      'body.1': { source: 'contact_name' },
      'body.2': { source: 'custom_field', fieldId },
      'button.0.1': { source: 'contact_phone' },
    }, { name: null, phone: '+5521999999999' })).toThrow('a variável {{1}} do conteúdo da mensagem está sem valor para este contato')
  })
})
