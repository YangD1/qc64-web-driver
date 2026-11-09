import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Panel({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel p-5', className)}>
      {(title || aside) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold tracking-wide text-dim uppercase">{title}</h2>
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
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-klein text-white hover:bg-[#0a3cc4]',
        variant === 'ghost' && 'border border-line text-fg hover:border-klein-hi/60 hover:bg-raised',
        variant === 'subtle' && 'text-dim hover:bg-raised hover:text-fg',
        variant === 'danger' && 'border border-danger/40 text-danger hover:bg-danger/10',
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
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-klein-hi' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
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
    <div role="radiogroup" className={cx('inline-flex flex-wrap gap-1 rounded-xl bg-ink p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            o.value === value ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--color-klein-hi)]' : 'text-dim hover:text-fg',
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
          className={cx('size-7 rounded-full border-2 transition-transform hover:scale-110', value.toLowerCase() === s ? 'border-fg' : 'border-transparent')}
          style={{ background: s }}
        />
      ))}
      <label className="relative flex h-7 items-center gap-2 rounded-full border border-line pr-3 pl-1 font-mono text-xs text-dim hover:border-klein-hi/60">
        <span className="size-5 rounded-full" style={{ background: value }} />
        {value.toUpperCase()}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

export function ProgressBar({ i, n }: { i: number; n: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-klein-hi transition-[width]" style={{ width: `${(i / Math.max(1, n)) * 100}%` }} />
    </div>
  )
}

export const REPO_URL = 'https://github.com/YangD1/qc64-web-driver'

export function GitHubLink() {
  return (
    <a href={REPO_URL} target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub" className="rounded-lg p-2 text-dim hover:bg-raised hover:text-fg">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.82 1.19 3.08 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
      </svg>
    </a>
  )
}
