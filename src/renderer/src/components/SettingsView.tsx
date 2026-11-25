import { useEffect, useState, type ReactNode, useId } from 'react'
import { FileText, Monitor, Moon, RotateCw, Sun, type LucideIcon } from 'lucide-react'
import type { AppInfo, QuotaSnapshot, Settings, ThemePreference } from '@shared/api'
import { prettyPath } from '../lib/format'
import type { AppState } from '../state/store'
import { ModelPicker } from './ModelPicker'
import { Switch } from './ui/Switch'
import { QuotaSettings } from './QuotaSettings'

interface Props {
  settings: Settings
  model: AppState['model']
  quota: QuotaSnapshot | null | undefined
  onRefreshQuota: () => Promise<unknown>
  modelError: boolean
  onRetryModels: () => void
  loadAppInfo: () => Promise<AppInfo>
  onUpdate: (patch: Partial<Settings>) => void
  onModel: (value: string) => void
  onRevealLog: () => void
  onRestartAgent: () => void
}

const THEME_CARDS: { value: ThemePreference; label: string; icon: LucideIcon; preview: string }[] = [
  { value: 'system', label: 'System', icon: Monitor, preview: 'bg-[linear-gradient(135deg,#faf9f7_50%,#1e1d1b_50%)]' },
  { value: 'light', label: 'Light', icon: Sun, preview: 'bg-[#faf9f7]' },
  { value: 'dark', label: 'Dark', icon: Moon, preview: 'bg-[#1e1d1b]' },
]

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-line bg-surface p-5">
      <h2 id={headingId} className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ThemePicker({ value, onChange }: { value: ThemePreference; onChange: (theme: ThemePreference) => void }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
      {THEME_CARDS.map(({ value: theme, label, icon: Icon, preview }) => (
        <button
          key={theme}
          type="button"
          role="radio"
          aria-checked={value === theme}
          onClick={() => onChange(theme)}
          className={`overflow-hidden rounded-xl border-2 text-left ${value === theme ? 'border-accent' : 'border-line hover:border-muted/50'}`}
        >
          <div aria-hidden className={`flex h-16 items-end gap-1.5 p-2.5 ${preview}`}>
            <span className="h-8 w-5 rounded bg-[#b45309]/70" />
            <span className="h-5 flex-1 rounded bg-[#888]/40" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-sm">
            <Icon size={15} aria-hidden />
            {label}
          </div>
        </button>
      ))}
    </div>
  )
}

export function SettingsView({ settings, model, quota, onRefreshQuota, modelError, onRetryModels, loadAppInfo, onUpdate, onModel, onRevealLog, onRestartAgent }: Props) {
  const [name, setName] = useState(settings.displayName)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void loadAppInfo().then(setInfo)
  }, [loadAppInfo])

  const saveName = () => {
    if (name.trim() !== settings.displayName) onUpdate({ displayName: name })
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-6 pt-2 pb-12">
        <h1 className="font-serif text-3xl tracking-tight">Settings</h1>

        <Section title="Profile">
          <label className="block text-sm font-medium" htmlFor="display-name">
            What should Puppy call you?
          </label>
          <input
            id="display-name"
            value={name}
            maxLength={40}
            placeholder="Your first name"
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => event.key === 'Enter' && saveName()}
            className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-accent/60 focus:outline-none"
          />
        </Section>

        <Section title="Appearance" description="System follows your Mac's light or dark setting.">
          <ThemePicker value={settings.theme} onChange={(theme) => onUpdate({ theme })} />
        </Section>

        <Section title="Model" description="Code Puppy uses this model everywhere, including in the terminal.">
          {model ? (
            <ModelPicker
              model={model}
              value={undefined}
              onChange={onModel}
              placement="bottom"
              variant="field"
              quota={quota}
              onOpen={() => void onRefreshQuota()}
            />
          ) : modelError ? (
            <p className="flex items-center gap-3 text-sm text-danger">
              Could not load the model list.
              <button type="button" onClick={onRetryModels} className="rounded-lg border border-line px-2.5 py-1 text-ink hover:bg-raised">
                Try again
              </button>
            </p>
          ) : (
            <p className="text-sm text-muted">Loading models...</p>
          )}
        </Section>

        <Section title="Quota" description="Your real Code Puppy quota. The rings next to each model show where it stands.">
          <QuotaSettings quota={quota} onRefresh={onRefreshQuota} />
        </Section>

        <Section title="Thinking process">
          <Switch
            label="Show Code Puppy's work"
            description="Follow along like the terminal does: Code Puppy's thinking, its reasoning and next steps, and every file it reads, command it runs and result it gets, all opened up as it happens. Off keeps them tucked away until you click one."
            checked={settings.thinkingMode}
            onChange={(thinkingMode) => onUpdate({ thinkingMode })}
          />
        </Section>

        <Section title="Previews">
          <Switch
            label="Open previews automatically"
            description="When Code Puppy writes a web page or image, or starts a local server such as http://localhost:3000, show it in the side panel. You can still open one yourself with its Preview button."
            checked={settings.autoPreview}
            onChange={(autoPreview) => onUpdate({ autoPreview })}
          />
        </Section>

        <Section title="Conversations">
          <Switch
            label="Smart titles"
            description="After your first message, Code Puppy writes a short title for the sidebar. Uses one small extra request."
            checked={settings.smartTitles}
            onChange={(smartTitles) => onUpdate({ smartTitles })}
          />
        </Section>

        <Section title="About">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Version</dt>
            <dd>{info?.version ?? '...'}</dd>
            <dt className="text-muted">Data folder</dt>
            <dd className="selectable truncate font-mono text-xs leading-5" title={info?.dataPath}>
              {info ? prettyPath(info.dataPath) : '...'}
            </dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onRevealLog} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-raised">
              <FileText size={14} aria-hidden />
              Show log file
            </button>
            <button type="button" onClick={onRestartAgent} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-raised">
              <RotateCw size={14} aria-hidden />
              Restart Code Puppy
            </button>
          </div>
        </Section>
      </div>
    </div>
  )
}
