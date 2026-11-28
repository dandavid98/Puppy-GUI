import { describe, expect, it } from 'vitest'
import { modelChoices, modelName } from './models'
import { modelOption } from './store'

const list = modelOption([
  {
    id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'a',
    options: [
      { group: 'one', name: 'One', options: [{ value: 'a', name: 'Alpha', description: 'The first' }] },
      { group: 'more', name: 'More', options: [{ value: 'b', name: 'Beta' }, { value: 'c', name: 'Gamma' }] },
    ],
  },
])

describe('model list', () => {
  it('is flat when Code Puppy groups it, with each model\'s name and description', () => {
    expect(modelChoices(list!)).toEqual([
      { value: 'a', name: 'Alpha', description: 'The first' },
      { value: 'b', name: 'Beta', description: undefined },
      { value: 'c', name: 'Gamma', description: undefined },
    ])
  })

  it('names a model as the user knows it, falling back to its id', () => {
    expect(modelName(list, 'b')).toBe('Beta')
    expect(modelName(list, 'zzz')).toBe('zzz')
    expect(modelName(null, 'a')).toBe('a')
  })
})

describe('an ungrouped model list', () => {
  it('is taken as it is', () => {
    const plain = modelOption([{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'a', options: [{ value: 'a', name: 'Alpha' }] }])
    expect(modelChoices(plain!)).toEqual([{ value: 'a', name: 'Alpha', description: undefined }])
  })
})
