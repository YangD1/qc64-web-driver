import { Moon, Sun, SunMoon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useI18n } from '../i18n'
import { setThemePref, useThemePref, type ThemePref } from '../theme'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Panel({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('glass rounded-3xl p-6', className)}>
      {(title || aside) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Button({
  variant = 'ghost',
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'subtle' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' &&
          'bg-linear-to-b from-klein-hi to-klein text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_16px_-4px_rgb(47_91_255/0.55)] hover:brightness-110',
        variant === 'ghost' &&
          'border border-surface/80 bg-surface/55 text-fg shadow-[inset_0_1px_0_var(--color-sheen),0_2px_8px_-2px_rgb(30_45_90/0.15)] backdrop-blur-xl hover:bg-surface/85',
        variant === 'subtle' && 'text-dim hover:bg-surface/60 hover:text-fg',
        variant === 'danger' && 'border border-danger/30 bg-surface/50 text-danger backdrop-blur-xl hover:bg-danger/10',
        className,
      )}
    />
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="font-mono text-xs text-dim">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <Field label={label} hint={format(value)}>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )
}

export function Toggle({ label, hint, checked, onChange }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-1">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-dim">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-klein-hi' : 'bg-fg/15')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-[0_2px_6px_rgb(20_30_60/0.25)] transition-transform', checked && 'translate-x-5')} />
      </button>
    </label>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" className={cx('inline-flex flex-wrap gap-1 rounded-2xl bg-ink p-1 shadow-[inset_0_1px_2px_rgb(20_30_60/0.06)]', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-xl px-3 py-1.5 text-sm font-medium transition-all',
            o.value === value ? 'bg-surface text-fg shadow-[inset_0_1px_0_var(--color-sheen),0_1px_4px_rgb(20_30_60/0.14)]' : 'text-dim hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const SWATCHES = ['#002fa7', '#4a74ff', '#00e5ff', '#3ddc97', '#ffb547', '#ff5c6c', '#ff4fd8', '#ffffff']

export const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
export const fromHex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SWATCHES.map((s) => (
        <button
          key={s}
          aria-label={s}
          onClick={() => onChange(s)}
          className={cx('size-7 rounded-full border-2 transition-transform hover:scale-110', value.toLowerCase() === s ? 'border-fg' : 'border-white shadow-[0_1px_3px_rgb(20_30_60/0.2)]')}
          style={{ background: s }}
        />
      ))}
      <label className="relative flex h-7 items-center gap-2 rounded-full border border-surface/80 bg-surface/55 pr-3 pl-1 font-mono text-xs text-dim hover:bg-surface/85">
        <span className="size-5 rounded-full" style={{ background: value }} />
        {value.toUpperCase()}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

export function ProgressBar({ i, n }: { i: number; n: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fg/10">
      <div className="h-full rounded-full bg-linear-to-r from-klein-hi to-[#8a6bff] transition-[width]" style={{ width: `${(i / Math.max(1, n)) * 100}%` }} />
    </div>
  )
}

export const REPO_URL = 'https://github.com/YangD1/qc64-web-driver'

export function GitHubLink() {
  return (
    <a href={REPO_URL} target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub" className="rounded-full p-2 text-dim hover:bg-surface/70 hover:text-fg">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.82 1.19 3.08 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
      </svg>
    </a>
  )
}

const THEME_NEXT: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_ICON = { auto: SunMoon, light: Sun, dark: Moon }

/** Cycles auto (by time of day) → light → dark. */
export function ThemeToggle() {
  const { t } = useI18n()
  const pref = useThemePref()
  const Icon = THEME_ICON[pref]
  const label = t(`theme.${pref}`)
  return (
    <button onClick={() => setThemePref(THEME_NEXT[pref])} title={label} aria-label={label} className="rounded-full p-2 text-dim hover:bg-surface/70 hover:text-fg">
      <Icon size={16} />
    </button>
  )
}
