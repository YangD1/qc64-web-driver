import { Usb } from 'lucide-react'
import { useState } from 'react'
import { Keyboard } from '../components/Keyboard'
import { Button, ProgressBar, Segmented } from '../components/ui'
import { useI18n } from '../i18n'
import { usbId, webHidSupported } from '../protocol/transport'
import { useStore } from '../store'

export function Connect() {
  const { t, lang, setLang } = useI18n()
  const { connect, connectDemo, loading } = useStore()
  const [error, setError] = useState<string | null>(null)
  const supported = webHidSupported()

  const onConnect = async () => {
    setError(null)
    const r = await connect()
    if (r === 'none') setError(t('connect.notFound'))
    else if (typeof r === 'object') setError(t('connect.unknownModel', { name: r.name || '?', id: usbId(r.vid, r.pid) }))
  }

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-klein">
            <span className="size-3.5 rounded-sm bg-klein-hi" />
          </span>
          {t('appName')}
        </span>
        <Segmented
          value={lang}
          onChange={setLang}
          options={[
            { value: 'zh', label: '中' },
            { value: 'en', label: 'EN' },
          ]}
        />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-16">
        <h1 className="max-w-3xl text-[clamp(32px,5vw,58px)] leading-[1.05] font-extrabold tracking-[-0.03em]">{t('connect.title')}</h1>
        <p className="mt-5 max-w-2xl text-lg text-dim">{t('connect.lead')}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {loading ? (
            <div className="w-80 space-y-2">
              <p className="text-sm text-dim">{t('connect.loading')}</p>
              <ProgressBar {...loading} />
            </div>
          ) : (
            <>
              <Button variant="primary" className="px-5 py-3 text-base" disabled={!supported} onClick={() => void onConnect()}>
                <Usb size={18} />
                {t('connect.button')}
              </Button>
              <Button className="px-5 py-3 text-base" onClick={() => void connectDemo()}>
                {t('connect.demo')}
              </Button>
            </>
          )}
        </div>
        {!supported && <p className="mt-4 text-sm text-danger">{t('connect.unsupported')}</p>}
        {error && <p className="mt-4 max-w-2xl text-sm text-danger">{error}</p>}
        <p className="mt-4 text-sm text-dim">
          {t('connect.hint')} {t('connect.closeVendor')}
        </p>

        <div className="pointer-events-none mt-14 opacity-90" aria-hidden>
          <Keyboard capStyle={(k) => ({ animation: `wave 3.2s ease-in-out ${k.x * 0.11 + k.y * 0.05}s infinite` })} />
        </div>
      </div>
      <style>{`@keyframes wave { 0%,100% { background: #212b4b } 45% { background: #002fa7 } 55% { background: #4a74ff } }`}</style>
    </div>
  )
}
