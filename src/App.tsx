import { Activity, Gauge, Keyboard as KeyboardIcon, Lightbulb, LogOut, RefreshCw, Settings as SettingsIcon, Terminal } from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { GitHubLink, ProgressBar, Segmented, cx } from './components/ui'
import { I18nProvider, useI18n, type TKey } from './i18n'
import { Actuation } from './pages/Actuation'
import { Calibration } from './pages/Calibration'
import { Connect } from './pages/Connect'
import { Console } from './pages/Console'
import { Keys } from './pages/Keys'
import { Lighting } from './pages/Lighting'
import { Settings } from './pages/Settings'
import type { PageProps } from './pages/types'
import { StoreProvider, useStore } from './store'

const PAGES = [
  { id: 'lighting', icon: Lightbulb, el: Lighting },
  { id: 'keys', icon: KeyboardIcon, el: Keys },
  { id: 'actuation', icon: Gauge, el: Actuation },
  { id: 'calibration', icon: Activity, el: Calibration },
  { id: 'settings', icon: SettingsIcon, el: Settings },
  { id: 'console', icon: Terminal, el: Console },
] as const
type PageId = (typeof PAGES)[number]['id']

export default function App() {
  return (
    <I18nProvider>
      <StoreProvider>
        <Root />
        <Toasts />
      </StoreProvider>
    </I18nProvider>
  )
}

function Root() {
  const { state, loading } = useStore()
  if (!state || loading) return <Connect />
  return <Shell />
}

function readPage(): PageId {
  const h = location.hash.slice(1)
  return (PAGES.some((p) => p.id === h) ? h : 'lighting') as PageId
}

function usePage(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>(readPage)
  useEffect(() => {
    const on = () => setPage(readPage())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [page, (p) => (location.hash = p)]
}

function Shell() {
  const { t, lang, setLang } = useI18n()
  const { state, kb, demo, disconnect, reload, setDev, busy } = useStore()
  const [page, setPage] = usePage()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const Page: ComponentType<PageProps> = PAGES.find((p) => p.id === page)!.el

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 lg:flex-row lg:gap-4 lg:p-4">
      <nav className="glass flex shrink-0 flex-row gap-1 overflow-x-auto rounded-3xl px-3 py-3 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-56 lg:flex-col lg:px-4 lg:py-6">
        <div className="mr-4 flex items-center gap-2.5 px-2 lg:mr-0 lg:mb-8">
          <span className="grid size-8 place-items-center rounded-xl bg-linear-to-br from-klein-hi to-klein shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_4px_12px_-2px_rgb(47_91_255/0.5)]">
            <span className="size-3.5 rounded-[5px] bg-white/85" />
          </span>
          <span className="text-[15px] font-bold tracking-tight whitespace-nowrap">{t('appName')}</span>
        </div>
        {PAGES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            aria-current={page === id ? 'page' : undefined}
            className={cx(
              'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-all',
              page === id ? 'bg-white/85 text-fg shadow-[inset_0_1px_0_#fff,0_2px_10px_-2px_rgb(30_45_90/0.18)]' : 'text-dim hover:bg-white/40 hover:text-fg',
            )}
          >
            <Icon size={17} className={page === id ? 'text-klein-hi' : ''} />
            {t(`nav.${id}` as TKey)}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:gap-4">
        <header className="glass sticky top-3 z-30 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl px-5 py-2.5 lg:top-4">
          <div className="flex items-center gap-2.5">
            <span className={cx('size-2 rounded-full', demo ? 'bg-amber' : 'bg-ok')} />
            <span className="text-sm font-semibold">{kb?.name}</span>
            {demo && <span className="rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber">{t('shell.demo')}</span>}
            {state?.info && (
              <span className="font-mono text-xs text-dim">
                {t('shell.firmware')} {state.info.version}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-dim">{t('shell.layer')}</span>
            <Segmented
              value={state!.dev.keyLayer ? 1 : 0}
              onChange={(v) => setDev({ keyLayer: v })}
              options={[
                { value: 0, label: '1' },
                { value: 1, label: '2' },
              ]}
            />
          </div>
          {busy && (
            <div className="w-40">
              <ProgressBar {...busy} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Segmented
              value={lang}
              onChange={setLang}
              options={[
                { value: 'zh', label: '中' },
                { value: 'en', label: 'EN' },
              ]}
            />
            <button onClick={() => void reload()} title={t('shell.reload')} className="rounded-full p-2 text-dim hover:bg-white/70 hover:text-fg">
              <RefreshCw size={16} />
            </button>
            <button onClick={() => void disconnect()} title={t('shell.disconnect')} className="rounded-full p-2 text-dim hover:bg-white/70 hover:text-fg">
              <LogOut size={16} />
            </button>
            <GitHubLink />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-1 py-2 lg:px-4">
          <Page selected={selected} setSelected={setSelected} />
        </main>
      </div>
    </div>
  )
}

function Toasts() {
  const { toasts } = useStore()
  const { t } = useI18n()
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2" aria-live="polite">
      {toasts.map((x) => (
        <div
          key={x.id}
          className={cx(
            'glass rounded-2xl px-4 py-2.5 text-sm font-medium',
            x.kind === 'ok' ? 'text-ok' : 'text-danger',
          )}
        >
          {x.kind === 'ok' ? (x.text === 'ok' ? t('toast.saved') : x.text) : t('toast.error', { msg: x.text })}
        </div>
      ))}
    </div>
  )
}
