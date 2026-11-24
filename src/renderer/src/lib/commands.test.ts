import { describe, expect, it } from 'vitest'
import { matchCommands } from './commands'

const commands = ['help', 'model', 'agent', 'compact', 'mcp'].map((name) => ({ name, description: `${name} command` }))
const names = (value: string) => matchCommands(value, commands).map((c) => c.name)

describe('matchCommands', () => {
  it('lists everything for a bare slash', () => {
    expect(names('/')).toHaveLength(5)
  })

  it('ranks prefix matches before substring matches', () => {
    expect(names('/m')).toEqual(['model', 'mcp', 'compact'])
  })

  it('stops suggesting once arguments start or without a leading slash', () => {
    expect(names('/model gpt')).toEqual([])
    expect(names('help')).toEqual([])
    expect(names('what is /help')).toEqual([])
  })
})
