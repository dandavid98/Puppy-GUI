import { useId, type ReactNode } from 'react'

/** A full-width page in the main area (Settings, Agents): serif title, then cards. */
export function Page({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-6 pt-2 pb-12">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
          {description && <p className="mt-2 text-sm text-muted">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

/** A card on a Page. */
export function Section({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 id={headingId} className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export const BUTTON = 'inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60'
export const SEARCH_INPUT = 'w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-9 text-sm focus:border-accent/60 focus:outline-none'
