import { useEffect, useRef, useState } from 'react'
import { Button, Panel, cx } from '../components/ui'
import { useI18n } from '../i18n'
import { useStore } from '../store'

/** MASTER commands that could brick or wipe the keyboard. */
const BLOCKED = new Set([0xcc, 0xdd])

export function Console() {
  const { t } = useI18n()
  const { traffic, clearTraffic, sendRaw, notify } = useStore()
  const [input, setInput] = useState('10')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [traffic])

  const send = () => {
    const bytes = input.trim().split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x, 16))
    if (!bytes.length || bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) return
    if (BLOCKED.has(bytes[1])) return notify(t('con.blocked'), 'error')
    void sendRaw(bytes)
  }

  return (
    <Panel
      title={t('con.title')}
      aside={
        <Button variant="subtle" onClick={clearTraffic}>
          {t('con.clear')}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-dim">{t('con.lead')}</p>
      <div ref={box} className="h-[55vh] overflow-auto rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed">
        {traffic.map((l) => (
          <div key={l.id} className={cx('whitespace-pre', l.dir === 'out' ? 'text-klein-hi' : 'text-ok')}>
            {l.dir === 'out' ? '→ ' : '← '}
            {l.hex}
          </div>
        ))}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} className="flex-1 rounded-lg border border-line bg-ink px-3 py-2 font-mono text-sm" />
        <Button variant="primary" type="submit">
          {t('con.send')}
        </Button>
      </form>
    </Panel>
  )
}
