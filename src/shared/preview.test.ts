import { describe, expect, it } from 'vitest'
import { asLocalUrl, isLocalUrl, isPreviewable, localUrlsIn, pathFromPreviewUrl, previewTarget, previewUrl, webTarget } from './preview'

describe('preview URLs', () => {
  it('round-trips paths with spaces and unusual characters', () => {
    const path = '/Users/me/my report #1/index (v2).html'
    expect(pathFromPreviewUrl(previewUrl(path))).toBe(path)
  })

  it('names the target after the file', () => {
    expect(previewTarget('/a/b/chart.html')).toMatchObject({ kind: 'file', title: 'chart.html', location: '/a/b/chart.html' })
  })

  it('only previews pages and images, never scripts or apps', () => {
    expect(isPreviewable('/a/index.HTML')).toBe(true)
    expect(isPreviewable('/a/logo.png')).toBe(true)
    expect(isPreviewable('/a/run.sh')).toBe(false)
    expect(isPreviewable('/Applications/Thing.app')).toBe(false)
    expect(isPreviewable('/a/noextension')).toBe(false)
  })
})

describe('local URLs', () => {
  it('accepts plain http loopback addresses only', () => {
    expect(isLocalUrl('http://localhost:3000/')).toBe(true)
    expect(isLocalUrl('http://127.0.0.1:8000/a?b=1')).toBe(true)
    expect(isLocalUrl('http://[::1]:5173')).toBe(true)
    expect(isLocalUrl('https://localhost:3000')).toBe(false)
    expect(isLocalUrl('http://example.com:3000')).toBe(false)
    expect(isLocalUrl('http://localhost.evil.com:3000')).toBe(false)
    expect(isLocalUrl('http://localhost@evil.com:3000')).toBe(false)
    expect(isLocalUrl('http://user:pw@localhost:3000')).toBe(false)
    expect(isLocalUrl('file:///etc/passwd')).toBe(false)
    expect(isLocalUrl('javascript:alert(1)')).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
  })

  it('finds them in prose and makes 0.0.0.0 reachable', () => {
    expect(localUrlsIn('Open http://localhost:3000/a, or (http://0.0.0.0:8000).')).toEqual(['http://localhost:3000/a', 'http://localhost:8000'])
    expect(localUrlsIn('http://localhost:3000 http://localhost:3000')).toEqual(['http://localhost:3000'])
    expect(localUrlsIn('no ports here: http://localhost/ and https://example.com:80')).toEqual([])
  })

  it('normalises a link only when the whole thing is a local address', () => {
    expect(asLocalUrl('http://0.0.0.0:8000/x')).toBe('http://localhost:8000/x')
    expect(asLocalUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(asLocalUrl('https://evil.com/?next=http://localhost:3000')).toBeNull()
    expect(asLocalUrl('http://0.0.0.0.evil.com:8000')).toBeNull()
  })

  it('builds a web target titled by host and port', () => {
    expect(webTarget('http://localhost:3000/x')).toEqual({ kind: 'web', title: 'localhost:3000', url: 'http://localhost:3000/x', location: 'http://localhost:3000/x' })
  })
})
