import type { Attachment } from '@shared/api'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_TEXT_BYTES = 512 * 1024

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'tsv', 'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'sql', 'log', 'ini', 'env',
  'py', 'js', 'jsx', 'ts', 'tsx', 'java', 'kt', 'go', 'rs', 'rb', 'php', 'c', 'h', 'cpp', 'cs', 'swift', 'sh', 'zsh',
])

export type FileKind = Attachment['kind']

/** Decide how to send a file, or explain (in plain words) why we can't. */
export function classify(name: string, mimeType: string, size: number): { kind: FileKind } | { error: string } {
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (IMAGE_TYPES.includes(mimeType)) {
    return size <= MAX_IMAGE_BYTES ? { kind: 'image' } : { error: `${name} is over 5 MB.` }
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || TEXT_EXTENSIONS.has(extension)) {
    return size <= MAX_TEXT_BYTES ? { kind: 'text' } : { error: `${name} is over 512 KB.` }
  }
  return { error: `${name} can't be attached. Images and text or code files only.` }
}

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Read a dropped, pasted or picked file into an attachment (browser APIs only). */
export async function readAttachment(file: File): Promise<Attachment> {
  const verdict = classify(file.name, file.type, file.size)
  if ('error' in verdict) throw new Error(verdict.error)
  const name = file.name || 'pasted-image.png'
  const mimeType = file.type || 'text/plain'
  return verdict.kind === 'image'
    ? { kind: 'image', name, mimeType, data: await base64(file) }
    : { kind: 'text', name, mimeType, text: await file.text() }
}
