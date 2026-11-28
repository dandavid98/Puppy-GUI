import { describe, expect, it } from 'vitest'
import { RUN_FAILED, switchingHelps, usageLimitIn } from './usageLimit'

/** The notice Code Puppy streams, around the gateway's own message. */
const failed = (detail: string) => `${RUN_FAILED}: ${detail}`

describe('usageLimitIn', () => {
  it('recognises the real notices: a spent large-model quota (Opus) before the plain token one it contains, and a spent token quota', () => {
    // As they appear in Code Puppy's own error log, word for word.
    const opus = "status_code: 402, model_name: claude-opus-5-5, body: {'error': {'message': \"Large-model token quota exceeded for job family 'DATA ANALYTICS'. Used 25218996/25000000 large-model tokens this period. Try again in 173 minutes.\", 'type': 'rate_limit_error'}, 'type': 'error'}"
    const sonnet = "status_code: 402, model_name: claude-sonnet-5-5, body: {'error': {'message': \"Token quota exceeded for job family 'DATA ANALYTICS'. Used 57526106/57368982 tokens this period. Try again in 49 minutes.\", 'type': 'rate_limit_error'}}"
    expect(usageLimitIn(failed(opus))).toBe('large_model_tokens')
    expect(usageLimitIn(failed(sonnet))).toBe('tokens')
    expect(usageLimitIn(failed('large model token quota exceeded'))).toBe('large_model_tokens')
  })

  it('recognises the backend\'s machine-readable kind, should it stop sending the prose', () => {
    expect(usageLimitIn(failed("status_code: 402, body: {'error': {'quota_kind': 'large_model_tokens'}}"))).toBe('large_model_tokens')
    expect(usageLimitIn(failed('status_code: 402, body: {"quota_kind": "Tokens"}'))).toBe('tokens')
    expect(usageLimitIn(failed("status_code: 402, body: {'quota_kind': 'requests'}"))).toBe('requests')
    expect(usageLimitIn(failed("status_code: 402, body: {'quota_kind': 'mystery'}"))).toBeNull()
  })

  it('recognises a spent token quota and a spent request limit', () => {
    expect(usageLimitIn(failed('Token quota exceeded. Resets in 3h.'))).toBe('tokens')
    expect(usageLimitIn(failed('Request limit exceeded'))).toBe('requests')
    expect(usageLimitIn(failed('request quota exceeded'))).toBe('requests')
  })

  it('does not take a passing provider overload, or any other failure, for a spent quota', () => {
    expect(usageLimitIn(failed("status_code: 429, body: {'error': {'type': 'rate_limit_error', 'message': 'Overloaded, try again'}}"))).toBeNull()
    expect(usageLimitIn(failed('Connection reset by peer'))).toBeNull()
    expect(usageLimitIn(failed('The VPN is off'))).toBeNull()
    expect(usageLimitIn(RUN_FAILED + '.')).toBeNull()
  })

  it("does not mistake the model's own words for a block, however much they talk about quotas", () => {
    expect(usageLimitIn('Your token quota exceeded the plan, so here is how to check it.')).toBeNull()
    expect(usageLimitIn('The agent run failed: token quota exceeded')).toBeNull() // without Code Puppy's mark
    expect(usageLimitIn('')).toBeNull()
  })

  it('reads it with stray whitespace around it', () => {
    expect(usageLimitIn(`\n  ${failed('Token quota exceeded')}  \n`)).toBe('tokens')
  })
})

describe('switchingHelps', () => {
  it('is true for token pools, which models draw from separately, and false for the request count, which is shared', () => {
    expect(switchingHelps('large_model_tokens')).toBe(true)
    expect(switchingHelps('tokens')).toBe(true)
    expect(switchingHelps('requests')).toBe(false)
  })
})
