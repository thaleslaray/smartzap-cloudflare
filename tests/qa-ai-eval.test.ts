import { describe, expect, it } from 'vitest'
import {
  containsWholePhrase,
  mentionsHandoff,
  normalize,
} from '../scripts/qa-ai-logic.mjs'

describe('grader das avaliações de IA', () => {
  it('não confunde uma frase proibida com um prefixo maior', () => {
    const answer = normalize('Se sim, podemos prosseguir com a segmentação.')
    expect(containsWholePhrase(answer, 'sim, pode')).toBe(false)
    expect(containsWholePhrase(normalize('Sim, pode prosseguir.'), 'sim, pode')).toBe(true)
  })

  it('reconhece representante humano como handoff explícito', () => {
    expect(
      mentionsHandoff(
        'Esse assunto deve ser tratado com um representante humano.',
      ),
    ).toBe(true)
    expect(mentionsHandoff('Não há confirmação na base.')).toBe(false)
  })
})
