import { useState } from 'react'
import { ALL_KEYS, Keyboard } from '../components/Keyboard'
import { Button, Panel, Segmented, Slider, cx } from '../components/ui'
import { useI18n } from '../i18n'
import { UNIT_MM, type MagKey } from '../protocol/codec'
import { useStore } from '../store'
import type { PageProps } from './types'

const TRAVEL_MM = 4
const mm = (v: number) => (v * UNIT_MM).toFixed(2)
const toUnits = (mmv: number) => Math.round(mmv / UNIT_MM)

export function Actuation({ selected, setSelected }: PageProps) {
  const { t } = useI18n()
  const { state, setMag, setDev, busy } = useStore()
  const s = state!
  const layer = s.dev.magLayer ? 1 : 0
  const table = s.mag[layer]
  const idx = [...selected]
  const base = idx.length ? table[idx[0]] : table[29]
  const [draft, setDraft] = useState<MagKey>(base)
  const [lastBase, setLastBase] = useState(base)
  if (base !== lastBase) {
    setLastBase(base)
    setDraft(base)
  }
  const upd = (p: Partial<MagKey>) => setDraft({ ...draft, ...p })

  return (
    <div className="space-y-6">
      <Keyboard
        selected={selected}
        onSelect={setSelected}
        overlay={(_, i) => {
          const k = table[i]
          const v = k.rt ? k.down : k.fixDown
          return (
            <span className="flex items-center gap-1 font-mono text-[clamp(7px,0.8vw,11px)]">
              <span className={cx('size-1.5 rounded-full', k.rt ? 'bg-amber' : 'bg-dim/60')} />
              <span className={k.rt ? 'text-amber' : 'text-dim'}>{mm(v)}</span>
            </span>
          )
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">{selected.size ? t('sel.count', { n: selected.size }) : t('sel.none')}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dim">{t('act.layer')}</span>
          <Segmented
            value={layer}
            onChange={(v) => setDev({ magLayer: v })}
            options={[
              { value: 0, label: '1' },
              { value: 1, label: '2' },
            ]}
          />
          <Button variant="subtle" onClick={() => setSelected(new Set(ALL_KEYS))}>
            {t('sel.all')}
          </Button>
          <Button variant="subtle" onClick={() => setSelected(new Set())}>
            {t('sel.clear')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_180px]">
        <Panel title={t('act.mode')}>
          <Segmented
            value={draft.rt ? 1 : 0}
            onChange={(v) => upd({ rt: !!v })}
            options={[
              { value: 0, label: t('act.fixed') },
              { value: 1, label: t('act.rt') },
            ]}
          />
          <p className="mt-3 text-sm text-dim">{draft.rt ? t('act.rtHint') : t('act.fixedHint')}</p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {draft.rt ? (
              <>
                <MmSlider label={t('act.down')} value={draft.down} min={0.01} max={2} onChange={(down) => upd({ down })} />
                <MmSlider label={t('act.up')} value={draft.up} min={0.01} max={2} onChange={(up) => upd({ up })} />
              </>
            ) : (
              <>
                <MmSlider label={t('act.fixDown')} value={draft.fixDown} min={0.1} max={TRAVEL_MM} onChange={(fixDown) => upd({ fixDown })} />
                <MmSlider label={t('act.fixUp')} value={draft.fixUp} min={0.1} max={TRAVEL_MM} onChange={(fixUp) => upd({ fixUp })} />
              </>
            )}
          </div>

          <details className="mt-6 group">
            <summary className="cursor-pointer text-sm font-medium text-dim hover:text-fg">{t('act.advanced')}</summary>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <MmSlider label={t('act.head')} value={draft.head} min={0} max={1} onChange={(head) => upd({ head })} />
              <MmSlider label={t('act.bottom')} value={draft.bottom} min={0} max={1} onChange={(bottom) => upd({ bottom })} />
            </div>
            <p className="mt-3 text-xs text-dim">{t('act.unitNote')}</p>
          </details>

          <div className="mt-6">
            <Button variant="primary" disabled={!idx.length || !!busy} onClick={() => void setMag(idx, draft)}>
              {busy ? t('act.progress', busy) : t('act.apply', { n: idx.length })}
            </Button>
          </div>
        </Panel>

        <Panel className="flex justify-center">
          <TravelGauge k={draft} />
        </Panel>
      </div>
    </div>
  )
}

function MmSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (units: number) => void }) {
  return (
    <Slider
      label={label}
      value={Number((value * UNIT_MM).toFixed(2))}
      min={min}
      max={max}
      step={0.01}
      format={(v) => `${v.toFixed(2)} mm`}
      onChange={(v) => onChange(toUnits(v))}
    />
  )
}

/** Side view of the key travel with the trigger/release points. */
function TravelGauge({ k }: { k: MagKey }) {
  const H = 280
  const y = (units: number) => 20 + Math.min(1, (units * UNIT_MM) / TRAVEL_MM) * (H - 40)
  const ticks = Array.from({ length: TRAVEL_MM * 2 + 1 }, (_, i) => i / 2)
  const down = k.rt ? k.head + k.down : k.fixDown
  const up = k.rt ? null : k.fixUp
  return (
    <svg viewBox={`0 0 140 ${H}`} className="h-72 w-36" role="img" aria-label="travel gauge">
      <rect x="54" y="20" width="10" height={H - 40} rx="5" fill="var(--color-line)" />
      <rect x="54" y="20" width="10" height={y(down) - 20} rx="5" fill="var(--color-klein-hi)" />
      {ticks.map((mmv) => (
        <g key={mmv}>
          <line x1="40" x2={mmv % 1 === 0 ? 50 : 46} y1={y(mmv / UNIT_MM)} y2={y(mmv / UNIT_MM)} stroke="var(--color-dim)" strokeWidth="1" />
          {mmv % 1 === 0 && (
            <text x="34" y={y(mmv / UNIT_MM) + 4} textAnchor="end" fontSize="10" fill="var(--color-dim)" fontFamily="var(--font-mono)">
              {mmv}
            </text>
          )}
        </g>
      ))}
      <Marker y={y(down)} color="var(--color-amber)" label={`${mm(down)}`} />
      {up !== null && <Marker y={y(up)} color="var(--color-ok)" label={`${mm(up)}`} />}
      {k.rt && (
        <text x="136" y={H - 4} textAnchor="end" fontSize="10" fill="var(--color-amber)" fontFamily="var(--font-mono)">
          RT ±{mm(k.down)}/{mm(k.up)}
        </text>
      )}
    </svg>
  )
}

function Marker({ y, color, label }: { y: number; color: string; label: string }) {
  return (
    <g>
      <line x1="50" x2="78" y1={y} y2={y} stroke={color} strokeWidth="2" />
      <text x="82" y={y + 4} fontSize="11" fill={color} fontFamily="var(--font-mono)">
        {label}
      </text>
    </g>
  )
}
