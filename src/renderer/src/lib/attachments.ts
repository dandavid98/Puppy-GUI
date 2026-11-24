import type { Attachment } from '@shared/api'

const MB = 1024 * 1024

/** The biggest image we will take. Anything over `SEND_IMAGE_BYTES` is shrunk before it is sent. */
export const MAX_IMAGE_BYTES = 30 * MB
/**
 * What we actually send. Base64 adds a third on top, and Claude refuses images over 5 MB, so
 * stay safely under that rather than finding out from an error mid-conversation.
 */
export const SEND_IMAGE_BYTES = 3.5 * MB
/** Models scale images down to about this anyway, so extra pixels only cost bytes. */
export const MAX_IMAGE_EDGE = 2048
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
    return size <= MAX_IMAGE_BYTES ? { kind: 'image' } : { error: `${name} is over ${MAX_IMAGE_BYTES / MB} MB.` }
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || TEXT_EXTENSIONS.has(extension)) {
    return size <= MAX_TEXT_BYTES ? { kind: 'text' } : { error: `${name} is over 512 KB.` }
  }
  return { error: `${name} can't be attached. Images and text or code files only.` }
}

/** An accepted image too big to send as it is. */
export function needsShrinking(file: { type: string; size: number }): boolean {
  return IMAGE_TYPES.includes(file.type) && file.size > SEND_IMAGE_BYTES && file.size <= MAX_IMAGE_BYTES
}

/** Scale to fit `maxEdge` on the longer side, keeping the shape. Never enlarges. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export interface Attempt {
  maxEdge: number
  type: 'image/png' | 'image/jpeg'
  quality?: number
}

/**
 * Ways to encode a too-big image, best first: lossless PNG (keeps text in screenshots crisp) if
 * that fits, then JPEG at falling quality and size. The first attempt that fits wins.
 */
export function encodingAttempts(sourceType: string): Attempt[] {
  return [
    ...(sourceType === 'image/jpeg' ? [] : [{ maxEdge: MAX_IMAGE_EDGE, type: 'image/png' } as const]),
    { maxEdge: MAX_IMAGE_EDGE, type: 'image/jpeg', quality: 0.92 },
    { maxEdge: MAX_IMAGE_EDGE, type: 'image/jpeg', quality: 0.8 },
    { maxEdge: 1536, type: 'image/jpeg', quality: 0.8 },
    { maxEdge: 1024, type: 'image/jpeg', quality: 0.7 },
    { maxEdge: 768, type: 'image/jpeg', quality: 0.6 },
  ]
}

/** "shot.png" re-encoded as JPEG becomes "shot.jpg", so the name never lies about the contents. */
export function withExtensionFor(name: string, mimeType: string): string {
  return `${name.replace(/\.[^./\\]+$/, '')}.${mimeType === 'image/jpeg' ? 'jpg' : 'png'}`
}

const megabytes = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`

/** Tells the user their image was changed, and by how much, so it is never silent. */
export function shrinkNote(name: string, before: number, after: number): string {
  return `${name} was shrunk to fit (${megabytes(before)} to ${megabytes(after)}).`
}

/** Re-encode in the browser until it fits. Takes a moment for very large images. */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file) // honours the photo's rotation
  try {
    for (const attempt of encodingAttempts(file.type)) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, attempt.maxEdge)
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')!
      if (attempt.type === 'image/jpeg') {
        context.fillStyle = '#fff' // JPEG has no transparency: flatten onto white, not black
        context.fillRect(0, 0, width, height)
      }
      context.drawImage(bitmap, 0, 0, width, height)
      const blob = await canvas.convertToBlob({ type: attempt.type, quality: attempt.quality })
      if (blob.size <= SEND_IMAGE_BYTES) return blob
    }
  } finally {
    bitmap.close()
  }
  throw new Error(`${file.name || 'The image'} could not be shrunk small enough to send. Try a smaller one.`)
}

function base64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Read a dropped, pasted or picked file into an attachment (browser APIs only). Images that
 * are already small go through untouched; big ones are shrunk and `note` says so.
 */
export async function readAttachment(file: File): Promise<{ attachment: Attachment; note?: string }> {
  const verdict = classify(file.name, file.type, file.size)
  if ('error' in verdict) throw new Error(verdict.error)
  const name = file.name || 'pasted-image.png'
  if (verdict.kind === 'text') {
    return { attachment: { kind: 'text', name, mimeType: file.type || 'text/plain', text: await file.text() } }
  }
  if (!needsShrinking(file)) {
    return { attachment: { kind: 'image', name, mimeType: file.type, data: await base64(file) } }
  }
  const shrunk = await shrinkImage(file)
  const shrunkName = withExtensionFor(name, shrunk.type)
  return {
    attachment: { kind: 'image', name: shrunkName, mimeType: shrunk.type, data: await base64(shrunk) },
    note: shrinkNote(name, file.size, shrunk.size),
  }
}
