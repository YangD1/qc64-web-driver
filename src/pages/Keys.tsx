import { useEffect, useState } from 'react'
import { Keyboard } from '../components/Keyboard'
import { Button, Field, Panel, Segmented, cx } from '../components/ui'
import { useI18n, type TKey } from '../i18n'
import type { KeyAction } from '../protocol/codec'
import { PROG } from '../protocol/constants'
import { DES_GROUPS, MEDIA_KEYS, MOUSE_BUTTONS, desLabel, keyAt } from '../protocol/layout'
import { useStore } from '../store'
import type { PageProps } from './types'

type Kind = KeyAction['kind']
const KINDS: Exclude<Kind, 'unknown'>[] = ['default', 'key', 'media', 'mouse', 'dks', 'snap', 'cancel', 'fn', 'disabled']

const mediaOf = (byte: number, data: number) => MEDIA_KEYS.find((m) => m.byte === byte && 1 << m.bit === data)

export function Keys({ selected, setSelected }: PageProps) {
  const { t } = useI18n()
  const { state, setKeys, preset } = useStore()
  const s = state!
  const layer = s.dev.keyLayer ? 1 : 0
  const table = s.keys[layer]
  const idx = [...selected]
  const first = idx.length ? table[idx[0]] : undefined

  const short = (a: KeyAction): string | null => {
    switch (a.kind) {
      case 'default':
        return null
      case 'key':
        return desLabel(...a.des)
      case 'media': {
        const m = mediaOf(a.byte, a.data)
        return m ? t(`media.${m.id}` as TKey) : 'Media'
      }
      case 'mouse':
        return '🖱'
      case 'dks':
        return `↑${desLabel(...a.des)}`
      case 'snap':
        return 'SOCD'
      case 'cancel':
        return 'CL'
      case 'fn':
        return 'Fn'
      case 'disabled':
        return '⊘'
      case 'unknown':
        return `?${a.mode}`
    }
  }

  return (
    <div className="space-y-6">
      <Keyboard
        selected={selected}
        onSelect={setSelected}
        legend={(k, i) => {
          const s2 = short(table[i])
          return s2 ? <span className="text-klein-hi">{s2}</span> : k.label
        }}
        overlay={(k, i) => (table[i].kind !== 'default' ? <span className="truncate text-[clamp(7px,0.75vw,10px)] text-dim">{k.label}</span> : null)}
      />
      <p className="text-sm text-dim">
        {selected.size ? t('sel.count', { n: selected.size }) : t('sel.none')} · {t('keys.layerNote', { n: layer + 1 })}
      </p>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <Editor key={idx.join(',')} idx={idx} initial={first} onApply={(a) => void setKeys(idx, a)} />
        <Panel title={t('keys.presets')}>
          <div className="flex flex-col gap-2">
            {(
              [
                ['keys.preset.dks', PROG.WASD_DKS_ON],
                ['keys.preset.snap', PROG.AD_SNAP_ON],
                ['keys.preset.cancel', PROG.AD_CANCEL_ON],
                ['keys.preset.off', PROG.WASD_DKS_SNAP_OFF],
              ] as [TKey, number][]
            ).map(([label, p]) => (
              <Button key={p} className="justify-start" onClick={() => void preset(p)}>
                {t(label)}
              </Button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Editor({ idx, initial, onApply }: { idx: number[]; initial?: KeyAction; onApply: (a: KeyAction | ((i: number) => KeyAction)) => void }) {
  const { t } = useI18n()
  const [kind, setKind] = useState<Kind>(initial && initial.kind !== 'unknown' ? initial.kind : 'key')
  const [des, setDes] = useState<[number, number] | null>(initial && 'des' in initial ? initial.des : null)
  const [media, setMedia] = useState(initial?.kind === 'media' ? mediaOf(initial.byte, initial.data)?.id : undefined)
  const [mouse, setMouse] = useState(initial?.kind === 'mouse' ? initial : { kind: 'mouse' as const, button: 1, x: 0, y: 0, wheel: 0 })
  const [interval, setIntervalMs] = useState(initial?.kind === 'dks' ? initial.interval || 20 : 20)

  useEffect(() => {
    if (kind === 'dks' || kind === 'key') return
    setDes(null)
  }, [kind])

  if (!idx.length) return <Panel title={t('keys.action')}>{<p className="text-sm text-dim">{t('sel.none')}</p>}</Panel>

  const pair = kind === 'snap' || kind === 'cancel'
  const pairOk = idx.length === 2

  const build = (): KeyAction | ((i: number) => KeyAction) | null => {
    switch (kind) {
      case 'key':
        return des ? { kind, des } : null
      case 'dks':
        return des ? { kind, des, interval } : null
      case 'media': {
        const m = MEDIA_KEYS.find((x) => x.id === media)
        return m ? { kind, byte: m.byte, data: 1 << m.bit } : null
      }
      case 'mouse':
        return mouse
      case 'snap':
      case 'cancel': {
        if (!pairOk) return null
        // partner is addressed by its keycode index DES = (row + 1, col)
        const other = (i: number) => (i === idx[0] ? idx[1] : idx[0])
        return (i: number) => ({ kind, partner: [Math.floor(other(i) / 14) + 1, other(i) % 14] })
      }
      default:
        return { kind } as KeyAction
    }
  }
  const action = build()

  return (
    <Panel title={t('keys.action')}>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cx(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              kind === k ? 'border-klein-hi bg-klein/30 text-fg' : 'border-line text-dim hover:text-fg',
            )}
          >
            {t(`keys.kind.${k}` as TKey)}
          </button>
        ))}
      </div>

      <div className="mt-6 min-h-24">
        {(kind === 'key' || kind === 'dks') && (
          <div className="space-y-4">
            {kind === 'dks' && <p className="text-sm text-dim">{t('keys.dksHint')}</p>}
            <p className="text-sm font-medium">
              {t('keys.pickTarget')}
              {des && <span className="ml-2 rounded bg-klein px-2 py-0.5 font-mono text-xs">{desLabel(...des)}</span>}
            </p>
            <DesPicker value={des} onChange={setDes} />
            {kind === 'dks' && (
              <Field label={t('keys.interval')}>
                <input type="number" min={1} max={1000} value={interval} onChange={(e) => setIntervalMs(Number(e.target.value))} className="w-28 rounded-lg border border-line bg-ink px-3 py-1.5 font-mono text-sm" />
              </Field>
            )}
          </div>
        )}
        {kind === 'media' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {MEDIA_KEYS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMedia(m.id)}
                className={cx('rounded-lg border px-3 py-2 text-left text-sm', media === m.id ? 'border-klein-hi bg-klein/30' : 'border-line text-dim hover:text-fg')}
              >
                {t(`media.${m.id}` as TKey)}
              </button>
            ))}
          </div>
        )}
        {kind === 'mouse' && (
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label={t('keys.mouseButtons')}>
              <div className="flex flex-wrap gap-1.5">
                {MOUSE_BUTTONS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setMouse({ ...mouse, button: mouse.button ^ b.bit })}
                    className={cx('rounded-lg border px-3 py-1.5 text-sm', mouse.button & b.bit ? 'border-klein-hi bg-klein/30' : 'border-line text-dim')}
                  >
                    {t(`mouse.${b.id}` as TKey)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('keys.mouseMove')}>
              <div className="flex gap-2 font-mono text-sm">
                {(['x', 'y'] as const).map((ax) => (
                  <label key={ax} className="flex items-center gap-1.5">
                    {ax.toUpperCase()}
                    <input type="number" min={-127} max={127} value={mouse[ax]} onChange={(e) => setMouse({ ...mouse, [ax]: Number(e.target.value) })} className="w-20 rounded-lg border border-line bg-ink px-2 py-1.5" />
                  </label>
                ))}
              </div>
            </Field>
            <Field label={t('keys.mouseWheel')}>
              <input type="number" min={-127} max={127} value={mouse.wheel} onChange={(e) => setMouse({ ...mouse, wheel: Number(e.target.value) })} className="w-24 rounded-lg border border-line bg-ink px-2 py-1.5 font-mono text-sm" />
            </Field>
          </div>
        )}
        {pair && (
          <p className={cx('text-sm', pairOk ? 'text-dim' : 'text-amber')}>
            {t(kind === 'snap' ? 'keys.snapHint' : 'keys.cancelHint')} {pairOk ? `(${idx.map((i) => keyAt(Math.floor(i / 14), i % 14)?.label).join(' ↔ ')})` : t('keys.pairNeedTwo')}
          </p>
        )}
        {kind === 'fn' && <p className="text-sm text-dim">{t('keys.fnHint')}</p>}
        {kind === 'disabled' && <p className="text-sm text-dim">{t('keys.disabledHint')}</p>}
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="primary" disabled={!action} onClick={() => action && onApply(action)}>
          {kind === 'default' ? t('keys.restore') : t('keys.apply')}
        </Button>
        {kind !== 'default' && <Button onClick={() => onApply({ kind: 'default' })}>{t('keys.restore')}</Button>}
      </div>
    </Panel>
  )
}

function DesPicker({ value, onChange }: { value: [number, number] | null; onChange: (d: [number, number]) => void }) {
  const { t } = useI18n()
  const [group, setGroup] = useState(DES_GROUPS[0][0])
  const list = DES_GROUPS.find((g) => g[0] === group)![1]
  return (
    <div className="space-y-3">
      <Segmented value={group} onChange={setGroup} options={DES_GROUPS.map(([g]) => ({ value: g, label: t(`keys.group.${g}` as TKey) }))} />
      <div className="flex flex-wrap gap-1.5">
        {list.map(([r, c]) => (
          <button
            key={`${r},${c}`}
            onClick={() => onChange([r, c])}
            className={cx(
              'min-w-10 rounded-md border px-2.5 py-1.5 font-mono text-sm transition-colors',
              value?.[0] === r && value?.[1] === c ? 'border-klein-hi bg-klein text-white' : 'border-line bg-cap hover:border-klein-hi/50',
            )}
          >
            {desLabel(r, c)}
          </button>
        ))}
      </div>
    </div>
  )
}
