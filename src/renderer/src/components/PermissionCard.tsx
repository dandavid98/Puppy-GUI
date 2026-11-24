import { Shield } from 'lucide-react'
import type { PermissionPrompt } from '@shared/api'

interface Props {
  prompt: PermissionPrompt
  onAnswer: (requestId: string, optionId: string | null) => void
}

/** Inline approval card. Allow options are primary; nothing is pre-approved. */
export function PermissionCard({ prompt, onAnswer }: Props) {
  return (
    <section
      role="alertdialog"
      aria-labelledby={`perm-${prompt.requestId}`}
      className="my-3 rounded-xl border border-accent/40 bg-accent-soft p-4"
    >
      <div className="flex items-start gap-3">
        <Shield size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h3 id={`perm-${prompt.requestId}`} className="text-sm font-medium">
            Code Puppy wants permission
          </h3>
          <p className="selectable mt-1 font-mono text-sm break-words text-muted">{prompt.title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {prompt.options.map((option, index) => {
              const allow = option.kind.startsWith('allow')
              return (
                <button
                  key={option.optionId}
                  type="button"
                  autoFocus={index === 0}
                  onClick={() => onAnswer(prompt.requestId, option.optionId)}
                  className={
                    allow
                      ? 'rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90'
                      : 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-raised'
                  }
                >
                  {option.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
