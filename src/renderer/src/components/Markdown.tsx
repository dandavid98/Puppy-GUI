import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Check, Copy, Eye } from 'lucide-react'
import { asLocalUrl } from '@shared/preview'
import { usePreviewActions } from './previewContext'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-raised hover:text-ink"
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node.props as { children?: ReactNode }).children)
  }
  return ''
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const { showHtml } = usePreviewActions()
  const code = Array.isArray(children) ? children[0] : children
  const className = (code as { props?: { className?: string } })?.props?.className ?? ''
  const language = /language-(\w+)/.exec(className)?.[1] ?? 'text'
  const source = textOf(children).replace(/\n$/, '')
  const isPage = language === 'html' && /<\w+/.test(source)
  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-1">
        <span className="font-mono text-xs text-muted">{language}</span>
        <span className="flex items-center gap-1">
          {isPage && (
            <button type="button" onClick={() => showHtml(source)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-raised hover:text-ink">
              <Eye size={14} aria-hidden />
              <span>Preview</span>
            </button>
          )}
          <CopyButton text={source} />
        </span>
      </div>
      <pre className="selectable overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">{children}</pre>
    </div>
  )
}

/** Links to a local dev server open in the preview panel; everything else leaves the app as before. */
function MessageLink({ href, children }: { href?: string; children?: ReactNode }) {
  const { showUrl } = usePreviewActions()
  const local = href ? asLocalUrl(href) : null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={
        local
          ? (event) => {
              event.preventDefault()
              showUrl(local)
            }
          : undefined
      }
    >
      {children}
    </a>
  )
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-neutral max-w-none text-[15px] leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: CodeBlock,
          a: MessageLink,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
