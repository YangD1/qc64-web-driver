import { useState } from 'react'
import { ALL_KEYS, Keyboard } from '../components/Keyboard'
import { Button, ColorPicker, Field, Panel, Segmented, Slider, Toggle, fromHex, toHex } from '../components/ui'
import { ledStyle } from '../components/ledPreview'
import { useI18n, type Lang } from '../i18n'
import type { Effect } from '../protocol/codec'
import type { EffectMode } from '../protocol/models'
import { useStore } from '../store'
import type { PageProps } from './types'

// Firmware speed is a period: larger = slower. The slider runs slow -> fast.
const SPEED_MAX = 20000
const SPEED_MIN = 500
const toSlider = (speed: number) => SPEED_MAX + SPEED_MIN - Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed || 5000))
const fromSlider = (v: number) => SPEED_MAX + SPEED_MIN - v
const pct = (v: number) => `${Math.round(((v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100)}%`

const blank = (mode: number): Effect => ({ mode, dir: 0, speed: 5000, speed2: 0, custom: true, r: 0, g: 47, b: 167 })

export function Lighting({ selected, setSelected }: PageProps) {
  const { t, lang } = useI18n()
  const { state, model } = useStore()
  const [tab, setTab] = useState<'backlight' | 'ambient' | 'perkey'>('backlight')
  const s = state!

  return (
    <div className="space-y-6">
      <Keyboard
        selected={tab === 'perkey' ? selected : undefined}
        onSelect={tab === 'perkey' ? setSelected : undefined}
        capStyle={(k, i) => ledStyle(s, model!.mb, k, i)}
      />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'backlight', label: t('light.backlight') },
          ...(model!.mc.length ? [{ value: 'ambient' as const, label: t('light.ambient') }] : []),
          { value: 'perkey', label: t('light.perkey') },
        ]}
      />

      {tab === 'backlight' && <EffectEditor kind="mb" modes={model!.mb} lang={lang} />}
      {tab === 'ambient' && <EffectEditor kind="mc" modes={model!.mc} lang={lang} />}
      {tab === 'perkey' && <PerKey selected={selected} setSelected={setSelected} />}
    </div>
  )
}

function EffectEditor({ kind, modes, lang }: { kind: 'mb' | 'mc'; modes: EffectMode[]; lang: Lang }) {
  const { t } = useI18n()
  const { state, setMb, setMc, setLight } = useStore()
  const s = state!
  const cur = kind === 'mb' ? s.mb : s.mc
  const set = kind === 'mb' ? setMb : setMc
  const e = cur.effects[cur.mode] ?? blank(cur.mode)
  const caps: Partial<EffectMode> = modes.find((m) => m.mode === cur.mode) ?? {}
  const upd = (p: Partial<Effect>) => set({ ...e, ...p, mode: cur.mode })

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title={t('light.effect')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {modes.map(({ mode: m, zh, en }) => (
            <button
              key={m}
              onClick={() => set({ ...(cur.effects[m] ?? blank(m)), mode: m })}
              className={
                'rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ' +
                (m === cur.mode ? 'border-klein-hi bg-klein/30 text-fg' : 'border-line text-dim hover:border-klein-hi/50 hover:text-fg')
              }
            >
              {lang === 'zh' ? zh : en}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={kind === 'mb' ? t('light.backlight') : t('light.ambient')}>
        <div className="space-y-5">
          {kind === 'mc' && <Toggle label={t('light.on')} checked={!!s.light.ambientOn} onChange={(v) => setLight({ ambientOn: v ? 1 : 0 })} />}
          {kind === 'mb' && <Toggle label={t('light.on')} checked={!!s.light.bottomOn} onChange={(v) => setLight({ bottomOn: v ? 1 : 0 })} />}
          <Slider
            label={t('light.brightness')}
            min={0}
            max={255}
            value={kind === 'mb' ? s.light.brightness : s.light.ambientBrightness}
            format={(v) => `${Math.round((v / 255) * 100)}%`}
            onChange={(v) => setLight(kind === 'mb' ? { brightness: v } : { ambientBrightness: v })}
          />
          {caps.speed && <Slider label={t('light.speed')} min={SPEED_MIN} max={SPEED_MAX} step={100} value={toSlider(e.speed)} format={pct} onChange={(v) => upd({ speed: fromSlider(v) })} />}
          {caps.dir && (
            <Field label={t('light.direction')}>
              <Segmented
                value={e.dir}
                onChange={(dir) => upd({ dir })}
                options={[
                  { value: 0, label: t('light.dirA') },
                  { value: 1, label: t('light.dirB') },
                ]}
              />
            </Field>
          )}
          {caps.color && (
            <Field label={t('light.color')}>
              <div className="space-y-3">
                {kind === 'mb' && (
                  <Segmented
                    value={e.custom ? 1 : 0}
                    onChange={(v) => upd({ custom: !!v })}
                    options={[
                      { value: 1, label: t('light.custom') },
                      { value: 0, label: t('light.rainbow') },
                    ]}
                  />
                )}
                {(e.custom || kind === 'mc') && (
                  <ColorPicker
                    value={toHex(e.r, e.g, e.b)}
                    onChange={(h) => {
                      const [r, g, b] = fromHex(h)
                      upd({ r, g, b, custom: true })
                    }}
                  />
                )}
              </div>
            </Field>
          )}
        </div>
      </Panel>
    </div>
  )
}

function PerKey({ selected, setSelected }: PageProps) {
  const { t } = useI18n()
  const { setKeyLights } = useStore()
  const [color, setColor] = useState('#ffb547')
  const [mode, setMode] = useState(1)
  const idx = [...selected]
  const [r, g, b] = fromHex(color)

  return (
    <Panel
      title={t('light.perkey')}
      aside={
        <div className="flex gap-1">
          <Button variant="subtle" onClick={() => setSelected(new Set(ALL_KEYS))}>
            {t('sel.all')}
          </Button>
          <Button variant="subtle" onClick={() => setSelected(new Set())}>
            {t('sel.clear')}
          </Button>
        </div>
      }
    >
      <p className="mb-5 text-sm text-dim">{selected.size ? t('sel.count', { n: selected.size }) : t('light.perkeyHint')}</p>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={t('light.effect')}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 1, label: t('light.mode.normal') },
              { value: 2, label: t('light.mode.breath') },
              { value: 3, label: t('light.mode.gradient') },
            ]}
          />
        </Field>
        <Field label={t('light.color')}>
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" disabled={!idx.length} onClick={() => void setKeyLights(idx, { active: true, mode, r, g, b })}>
          {t('light.apply')}
        </Button>
        <Button disabled={!idx.length} onClick={() => void setKeyLights(idx, { active: false, mode: 1, r: 0, g: 0, b: 0 })}>
          {t('light.clearKeys')}
        </Button>
      </div>
    </Panel>
  )
}
