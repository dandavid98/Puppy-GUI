import { describe, expect, it } from 'vitest'
import { readReasoning } from './reasoning'

describe('readReasoning', () => {
  it('reads the reasoning and a list of next steps', () => {
    expect(readReasoning({ reasoning: ' Checking the config ', next_steps: ['Read it', ' Fix it '] })).toEqual({
      reasoning: 'Checking the config',
      nextSteps: ['Read it', 'Fix it'],
    })
  })

  it('accepts next steps as one string', () => {
    expect(readReasoning({ reasoning: 'Hmm', next_steps: 'Look around' })?.nextSteps).toEqual(['Look around'])
  })

  it('copes with either half missing', () => {
    expect(readReasoning({ reasoning: 'Just thinking' })).toEqual({ reasoning: 'Just thinking', nextSteps: [] })
    expect(readReasoning({ next_steps: ['Go'] })).toEqual({ reasoning: '', nextSteps: ['Go'] })
  })

  it('is null for anything else', () => {
    expect(readReasoning(undefined)).toBeNull()
    expect(readReasoning('text')).toBeNull()
    expect(readReasoning({ command: 'ls' })).toBeNull()
    expect(readReasoning({ reasoning: '  ', next_steps: [] })).toBeNull()
  })
})
