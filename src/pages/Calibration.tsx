import { useEffect, useRef, useState } from 'react'
import { Keyboard } from '../components/Keyboard'
import { Button, Panel, ProgressBar } from '../components/ui'
import { useI18n } from '../i18n'
import { buildCal, parseCalReport } from '../protocol/codec'
import { MAG_CAL } from '../protocol/constants'
import { KEYS, keyIndex } from '../protocol/layout'
import { useStore } from '../store'

/** REST - MIN counts that count as fully pressed (real full travel measured 843..978). */
const FULL = 750
const SCALE = 950

type Phase = 'idle' | 'running' | 'saved' | 'cancelled'

export function Calibration() {
  const { t } = useI18n()
  const { kb, state } = useStore()
  const [phase, setPhase] = useState<Phase>('idle')
  const [live, setLive] = useState<Map<number, { min: number; rest: number }>>(new Map())
  const saving = useRef(false)

  const doneSet = new Set([...live].filter(([, v]) => v.rest - v.min >= FULL).map(([phy]) => phy))
  const total = KEYS.length

  useEffect(() => {
    if (phase !== 'running' || !kb) return
    return kb.subscribe((p) => {
      const r = parseCalReport(p)
      if (r) setLive((m) => new Map(m).set(r.phy, { min: r.min, rest: r.rest }))
    })
  }, [phase, kb])

  const finish = async (save: boolean) => {
    if (saving.current) return
    saving.current = true
    await kb?.write(buildCal(save ? MAG_CAL.END : MAG_CAL.CANCEL))
    setPhase(save ? 'saved' : 'cancelled')
    saving.current = false
  }

  useEffect(() => {
    if (phase === 'running' && doneSet.size === total) void finish(true)
  })

  // Never leave the keyboard in calibration mode when navigating away.
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  useEffect(() => () => void (phaseRef.current === 'running' && kb?.write(buildCal(MAG_CAL.CANCEL))), [kb])

  const start = async () => {
    setLive(new Map())
    setPhase('running')
    await kb?.write(buildCal(MAG_CAL.START))
  }

  const remaining = KEYS.filter((k) => !doneSet.has(k.phy)).map((k) => k.label)

  return (
    <div className="space-y-6">
      <Keyboard
        capStyle={(k) => {
          if (phase === 'idle') {
            const c = state!.cal[keyIndex(k.row, k.col)]
            const f = Math.max(0, Math.min(1, (c.rest - c.min) / SCALE))
            return { background: `linear-gradient(to bottom, #2a3558 ${f * 100}%, transparent ${f * 100}%)` }
          }
          const v = live.get(k.phy)
          if (!v) return undefined
          const f = Math.max(0, Math.min(1, (v.rest - v.min) / SCALE))
          const done = doneSet.has(k.phy)
          return { background: `linear-gradient(to bottom, ${done ? 'var(--color-ok)' : 'var(--color-amber)'} ${f * 100}%, transparent ${f * 100}%)`, opacity: done ? 0.75 : 0.9 }
        }}
        overlay={(k) => {
          if (phase !== 'idle') return null
          const c = state!.cal[keyIndex(k.row, k.col)]
          return <span className="font-mono text-[clamp(7px,0.75vw,10px)] text-dim">{c.rest - c.min}</span>
        }}
      />

      <Panel title={t('cal.title')}>
        {phase === 'idle' && (
          <>
            <p className="max-w-2xl text-sm text-dim">{t('cal.lead')}</p>
            <p className="mt-2 max-w-2xl text-sm text-dim">{t('cal.tipWin')}</p>
            <p className="mt-2 text-xs text-dim">{t('cal.current')}</p>
            <Button variant="primary" className="mt-5" onClick={() => void start()}>
              {t('cal.start')}
            </Button>
          </>
        )}
        {phase === 'running' && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight">
                {doneSet.size}
                <span className="text-dim">/{total}</span>
              </span>
              <span className="text-sm text-dim">{t('cal.progress', { n: doneSet.size, total })}</span>
            </div>
            <ProgressBar i={doneSet.size} n={total} />
            {remaining.length > 0 && remaining.length <= 20 && (
              <p className="text-sm">
                <span className="text-dim">{t('cal.remaining')}</span>
                <span className="font-mono">{remaining.join('  ')}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void finish(false)}>{t('cal.cancel')}</Button>
              <Button variant="subtle" disabled={doneSet.size < total * 0.5} onClick={() => void finish(true)}>
                {t('cal.saveAnyway')}
              </Button>
            </div>
          </div>
        )}
        {(phase === 'saved' || phase === 'cancelled') && (
          <div className="space-y-4">
            <p className={phase === 'saved' ? 'text-ok' : 'text-dim'}>{phase === 'saved' ? t('cal.done') : t('cal.cancelled')}</p>
            <Button onClick={() => setPhase('idle')}>OK</Button>
          </div>
        )}
      </Panel>
    </div>
  )
}
