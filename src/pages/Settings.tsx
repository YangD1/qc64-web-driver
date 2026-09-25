import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, Field, Panel, Segmented, Slider, Toggle } from '../components/ui'
import { useI18n } from '../i18n'
import { PROG } from '../protocol/constants'
import { useStore, type Profile } from '../store'

export function Settings() {
  const { t, lang, setLang } = useI18n()
  const { state, setDev, setLight, exportProfile, importProfile, preset, busy, notify } = useStore()
  const d = state!.dev
  const l = state!.light
  const file = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState(false)

  const doExport = () => {
    const p = exportProfile()
    if (!p) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `qc64-profile-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (f: File) => {
    try {
      await importProfile(JSON.parse(await f.text()) as Profile)
    } catch (e) {
      notify(String((e as Error).message), 'error')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
      <Panel title={t('set.performance')}>
        <p className="mb-4 text-xs text-dim">{t('set.rebootHint')}</p>
        <div className="divide-y divide-line [&>*]:py-3 [&>*:first-child]:pt-0">
          <Field label={t('set.pfmMode')}>
            <Segmented
              value={d.pfmMode}
              onChange={(v) => setDev({ pfmMode: v })}
              options={[
                { value: 0, label: t('set.pfm0') },
                { value: 1, label: t('set.pfm1') },
                { value: 2, label: t('set.pfm2') },
              ]}
            />
          </Field>
          <Toggle label={t('set.dynScan')} hint={t('set.dynScanHint')} checked={!!d.dynScan} onChange={(v) => setDev({ dynScan: +v })} />
          <Toggle label={t('set.autoCal')} hint={t('set.autoCalHint')} checked={!!d.autoCal} onChange={(v) => setDev({ autoCal: +v })} />
        </div>
      </Panel>

      <Panel title={t('set.general')}>
        <div className="divide-y divide-line [&>*]:py-3 [&>*:first-child]:pt-0">
          <Toggle label={t('set.winLock')} hint={t('set.winLockHint')} checked={!!d.winLock} onChange={(v) => setDev({ winLock: +v })} />
          <Toggle label={t('set.fnAltSwap')} checked={!!d.fnAltSwap} onChange={(v) => setDev({ fnAltSwap: +v })} />
          <div>
            <Toggle label={t('set.autoOff')} hint={t('set.autoOffHint')} checked={!!d.fastSleep} onChange={(v) => setDev({ fastSleep: +v })} />
            {!!d.fastSleep && (
              <Slider label={t('set.autoOffDelay')} min={1} max={30} value={d.fastSleepDelay} format={(n) => t('set.autoOffUnit', { n })} onChange={(v) => setDev({ fastSleepDelay: v })} />
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('set.language')}</span>
            <Segmented
              value={lang}
              onChange={setLang}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
        </div>
      </Panel>
      </div>

      <div className="space-y-6">
        <Panel title={t('set.lighting')}>
          <div className="divide-y divide-line [&>*]:py-3 [&>*:first-child]:pt-0">
            <Toggle label={t('set.highlight')} hint={t('set.highlightHint')} checked={!!l.highlight} onChange={(v) => setLight({ highlight: +v })} />
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('set.saturation')}</p>
              <Slider label="R" min={0} max={255} value={l.satR} onChange={(v) => setLight({ satR: v })} />
              <Slider label="G" min={0} max={255} value={l.satG} onChange={(v) => setLight({ satG: v })} />
              <Slider label="B" min={0} max={255} value={l.satB} onChange={(v) => setLight({ satB: v })} />
            </div>
          </div>
        </Panel>

        <Panel title={t('set.backup')}>
          <div className="flex flex-wrap gap-2">
            <Button onClick={doExport}>
              <Download size={16} />
              {t('set.export')}
            </Button>
            <Button disabled={!!busy} onClick={() => file.current?.click()}>
              <Upload size={16} />
              {busy ? t('set.importing', busy) : t('set.import')}
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void doImport(f)
              }}
            />
          </div>
        </Panel>

        <Panel title={t('set.danger')} className="border-danger/30">
          <p className="mb-4 text-sm text-dim">{t('set.resetLayerHint')}</p>
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm) return setConfirm(true)
              setConfirm(false)
              void preset(PROG.ALL_RESET)
            }}
            onBlur={() => setConfirm(false)}
          >
            {confirm ? t('set.confirm') : t('set.resetLayer')}
          </Button>
        </Panel>
      </div>
    </div>
  )
}
