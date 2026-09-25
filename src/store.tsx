import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  buildDev,
  buildKey,
  buildLight,
  buildMag,
  buildMb,
  buildMc,
  buildMt,
  buildPreset,
  magKeyBytes,
  parseCal,
  parseDev,
  parseDevInfo,
  parseKeyTable,
  parseLight,
  parseMagTable,
  parseMb,
  parseMc,
  parseMt,
  type DevCfg,
  type DevInfo,
  type Effect,
  type KeyAction,
  type KeyLight,
  type LightCfg,
  type MagKey,
} from './protocol/codec'
import { SECTION } from './protocol/constants'
import { Keyboard } from './protocol/keyboard'
import { magCrc } from './protocol/magcrc'
import { MockTransport } from './protocol/mock'
import type { Model } from './protocol/models'
import { reconnectHid, requestHid, type Transport, type UnknownDevice } from './protocol/transport'

export interface KbState {
  info: DevInfo | null
  dev: DevCfg
  light: LightCfg
  mb: { mode: number; effects: Record<number, Effect> }
  mc: { mode: number; effects: Record<number, Effect> }
  mt: KeyLight[]
  /** per key layer (0 = M1, 1 = M2), 70 entries each, index row*14+col */
  keys: KeyAction[][]
  mag: MagKey[][]
  cal: { min: number; rest: number }[]
}

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

export interface TrafficLine {
  id: number
  dir: 'out' | 'in'
  hex: string
}

type Progress = { i: number; n: number } | null

interface Store {
  kb: Keyboard | null
  /** model of the connected keyboard */
  model: Model | null
  state: KbState | null
  demo: boolean
  loading: Progress
  busy: Progress
  toasts: Toast[]
  traffic: TrafficLine[]
  clearTraffic: () => void
  connect: () => Promise<'ok' | 'none' | 'cancel' | UnknownDevice>
  connectDemo: () => Promise<void>
  disconnect: () => Promise<void>
  reload: () => Promise<void>
  notify: (text: string, kind?: Toast['kind']) => void
  setDev: (patch: Partial<DevCfg>) => void
  setLight: (patch: Partial<LightCfg>) => void
  setMb: (e: Effect) => void
  setMc: (e: Effect) => void
  setKeyLights: (idx: number[], l: KeyLight) => Promise<void>
  setKeys: (idx: number[], a: KeyAction | ((i: number) => KeyAction)) => Promise<void>
  preset: (prog: number) => Promise<void>
  setMag: (idx: number[], patch: Partial<MagKey>) => Promise<void>
  sendRaw: (bytes: number[]) => Promise<void>
  exportProfile: () => Profile | null
  importProfile: (p: Profile) => Promise<void>
}

/** Portable backup of everything the driver can write (calibration excluded). */
export interface Profile {
  format: 'qc64-profile'
  version: 1
  dev: DevCfg
  light: LightCfg
  mb: KbState['mb']
  mc: KbState['mc']
  mt: KeyLight[]
  keys: KeyAction[][]
  mag: MagKey[][]
}

const Ctx = createContext<Store>(null!)
export const useStore = () => useContext(Ctx)

/** Latest-value-wins writer: while one write is in flight, only the newest pending value is kept. */
function useCoalesced<T>(fn: (v: T) => Promise<void>) {
  const st = useRef<{ pending?: { v: T }; running: boolean }>({ running: false })
  const fnRef = useRef(fn)
  fnRef.current = fn
  return useCallback((v: T) => {
    st.current.pending = { v }
    if (st.current.running) return
    st.current.running = true
    void (async () => {
      while (st.current.pending) {
        const { v: x } = st.current.pending
        st.current.pending = undefined
        try {
          await fnRef.current(x)
        } catch {
          // surfaced by the caller's toast on the next explicit write
        }
      }
      st.current.running = false
    })()
  }, [])
}

let seq = 0

export function StoreProvider({ children }: { children: ReactNode }) {
  const [kb, setKb] = useState<Keyboard | null>(null)
  const [state, setState] = useState<KbState | null>(null)
  const [demo, setDemo] = useState(false)
  const [loading, setLoading] = useState<Progress>(null)
  const [busy, setBusy] = useState<Progress>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [traffic, setTraffic] = useState<TrafficLine[]>([])
  const stateRef = useRef(state)
  stateRef.current = state

  const notify = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++seq
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const load = useCallback(async (k: Keyboard) => {
    const steps: [number, string][] = [
      [SECTION.DEV, 'dev'],
      [SECTION.LIGHT_CFG, 'light'],
      [SECTION.MB, 'mb'],
      [SECTION.MC, 'mc'],
      [SECTION.MT, 'mt'],
      [SECTION.KEY_M1, 'k1'],
      [SECTION.KEY_M2, 'k2'],
      [SECTION.MAG_M1, 'm1'],
      [SECTION.MAG_M2, 'm2'],
      [SECTION.MAG_CAL, 'cal'],
    ]
    const n = steps.length + 1
    setLoading({ i: 0, n })
    const infoPkt = await k.info()
    const raw: Record<string, Uint8Array> = {}
    for (const [i, [sec, name]] of steps.entries()) {
      setLoading({ i: i + 1, n })
      raw[name] = await k.readSection(sec)
    }
    setState({
      info: infoPkt ? parseDevInfo(infoPkt) : null,
      dev: parseDev(raw.dev),
      light: parseLight(raw.light),
      mb: parseMb(raw.mb),
      mc: parseMc(raw.mc),
      mt: parseMt(raw.mt),
      keys: [parseKeyTable(raw.k1), parseKeyTable(raw.k2)],
      mag: [parseMagTable(raw.m1), parseMagTable(raw.m2)],
      cal: parseCal(raw.cal),
    })
    setLoading(null)
  }, [])

  const attach = useCallback(
    async (t: Transport, isDemo: boolean) => {
      const k = new Keyboard(t)
      k.onTraffic = (dir, p) => {
        const hex = Array.from(p, (b) => b.toString(16).padStart(2, '0')).join(' ')
        setTraffic((l) => [...l.slice(-499), { id: ++seq, dir, hex }])
      }
      setKb(k)
      setDemo(isDemo)
      try {
        await load(k)
      } catch (e) {
        setLoading(null)
        notify(String((e as Error).message ?? e), 'error')
      }
    },
    [load, notify],
  )

  const connect = useCallback(async () => {
    try {
      const r = await requestHid()
      if (!r) return 'none'
      if ('unknown' in r) return r.unknown
      await attach(r.transport, false)
      return 'ok'
    } catch {
      return 'cancel'
    }
  }, [attach])

  const connectDemo = useCallback(() => attach(new MockTransport(), true), [attach])

  const disconnect = useCallback(async () => {
    await kb?.close()
    setKb(null)
    setState(null)
    setDemo(false)
  }, [kb])

  // ?demo opens the simulated keyboard; otherwise silently reconnect a keyboard granted earlier.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('demo')) void attach(new MockTransport(), true)
    else void reconnectHid().then((t) => t && attach(t, false))
    const onDisconnect = () => {
      setKb(null)
      setState(null)
    }
    // Performance mode / FPS enhance / auto-cal writes reboot the keyboard; pick it up again when it re-enumerates.
    // 'connect' fires once per HID interface, so only the first one reattaches.
    let reattaching = false
    const onConnect = async () => {
      if (reattaching || stateRef.current) return
      reattaching = true
      try {
        const t = await reconnectHid()
        if (t) await attach(t, false)
      } finally {
        reattaching = false
      }
    }
    navigator.hid?.addEventListener('disconnect', onDisconnect)
    navigator.hid?.addEventListener('connect', onConnect)
    return () => {
      navigator.hid?.removeEventListener('disconnect', onDisconnect)
      navigator.hid?.removeEventListener('connect', onConnect)
    }
  }, [attach])

  const reload = useCallback(async () => {
    if (kb) await load(kb)
  }, [kb, load])

  const patch = (fn: (s: KbState) => KbState) => setState((s) => (s ? fn(s) : s))

  // DEV and LIGHT_CFG are always written as a pair, like the vendor driver does.
  const writeDevLight = useCoalesced(async ({ dev, light }: { dev: DevCfg; light: LightCfg }) => {
    await kb?.write(buildDev(dev))
    await kb?.write(buildLight(light))
  })

  const setDev = useCallback(
    (p: Partial<DevCfg>) => {
      const s = stateRef.current
      if (!s) return
      const dev = { ...s.dev, ...p }
      patch((x) => ({ ...x, dev }))
      writeDevLight({ dev, light: s.light })
    },
    [writeDevLight],
  )

  const setLight = useCallback(
    (p: Partial<LightCfg>) => {
      const s = stateRef.current
      if (!s) return
      const light = { ...s.light, ...p }
      patch((x) => ({ ...x, light }))
      writeDevLight({ dev: s.dev, light })
    },
    [writeDevLight],
  )

  const writeMb = useCoalesced(async (e: Effect) => kb?.write(buildMb(e)))
  const writeMc = useCoalesced(async (e: Effect) => kb?.write(buildMc(e)))

  const setMb = useCallback(
    (e: Effect) => {
      patch((x) => ({ ...x, mb: { mode: e.mode, effects: { ...x.mb.effects, [e.mode]: e } } }))
      writeMb(e)
    },
    [writeMb],
  )
  const setMc = useCallback(
    (e: Effect) => {
      patch((x) => ({ ...x, mc: { mode: e.mode, effects: { ...x.mc.effects, [e.mode]: e } } }))
      writeMc(e)
    },
    [writeMc],
  )

  const guarded = useCallback(
    async (fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        notify(String((e as Error).message ?? e), 'error')
      } finally {
        setBusy(null)
      }
    },
    [notify],
  )

  const setKeyLights = useCallback(
    (idx: number[], l: KeyLight) =>
      guarded(async () => {
        for (const i of idx) await kb?.write(buildMt(Math.floor(i / 14), i % 14, l))
        patch((x) => ({ ...x, mt: x.mt.map((m, i) => (idx.includes(i) ? l : m)) }))
      }),
    [kb, guarded],
  )

  const setKeys = useCallback(
    (idx: number[], a: KeyAction | ((i: number) => KeyAction)) =>
      guarded(async () => {
        const layer = stateRef.current?.dev.keyLayer ? 1 : 0
        for (const [n, i] of idx.entries()) {
          setBusy({ i: n + 1, n: idx.length })
          const act = typeof a === 'function' ? a(i) : a
          await kb?.writeKey(buildKey(Math.floor(i / 14), i % 14, act))
          patch((x) => {
            const keys = x.keys.map((t) => [...t])
            keys[layer][i] = act
            return { ...x, keys }
          })
        }
        notify('ok')
      }),
    [kb, guarded, notify],
  )

  const preset = useCallback(
    (prog: number) =>
      guarded(async () => {
        if (!kb) return
        await kb.writeKey(buildPreset(prog))
        const layer = stateRef.current?.dev.keyLayer ? 1 : 0
        const t = parseKeyTable(await kb.readSection(layer ? SECTION.KEY_M2 : SECTION.KEY_M1))
        patch((x) => {
          const keys = [...x.keys]
          keys[layer] = t
          return { ...x, keys }
        })
        notify('ok')
      }),
    [kb, guarded, notify],
  )

  const setMag = useCallback(
    (idx: number[], p: Partial<MagKey>) =>
      guarded(async () => {
        const s = stateRef.current
        if (!s || !kb) return
        const layer = s.dev.magLayer ? 1 : 0
        const table = [...s.mag[layer]]
        for (const [n, i] of idx.entries()) {
          setBusy({ i: n + 1, n: idx.length })
          table[i] = { ...table[i], ...p }
          const crc = magCrc(Uint8Array.from(table.flatMap(magKeyBytes)))
          await kb.writeMag(buildMag(layer, Math.floor(i / 14), i % 14, table[i]), crc)
          const snapshot = [...table]
          patch((x) => {
            const mag = [...x.mag]
            mag[layer] = snapshot
            return { ...x, mag }
          })
        }
        notify('ok')
      }),
    [kb, guarded, notify],
  )

  const sendRaw = useCallback(async (bytes: number[]) => {
    await kb?.write(bytes)
  }, [kb])

  const exportProfile = useCallback((): Profile | null => {
    const s = stateRef.current
    if (!s) return null
    return { format: 'qc64-profile', version: 1, dev: s.dev, light: s.light, mb: s.mb, mc: s.mc, mt: s.mt, keys: s.keys, mag: s.mag }
  }, [])

  const importProfile = useCallback(
    (p: Profile) =>
      guarded(async () => {
        const s = stateRef.current
        if (!s || !kb || p.format !== 'qc64-profile') throw new Error('not a qc64 profile')
        const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
        const jobs: (() => Promise<unknown>)[] = []
        const dev = { ...p.dev, keyLayer: s.dev.keyLayer, magLayer: s.dev.magLayer }
        jobs.push(() => kb.write(buildDev(dev)), () => kb.write(buildLight(p.light)))
        for (const [cur, set, build] of [
          [p.mb, s.mb, buildMb],
          [p.mc, s.mc, buildMc],
        ] as const) {
          for (const e of Object.values(cur.effects)) if (e.mode !== cur.mode && !same(e, set.effects[e.mode])) jobs.push(() => kb.write(build(e)))
          const e = cur.effects[cur.mode] ?? { ...Object.values(cur.effects)[0], mode: cur.mode }
          jobs.push(() => kb.write(build(e)))
        }
        p.mt.forEach((l, i) => !same(l, s.mt[i]) && jobs.push(() => kb.write(buildMt(Math.floor(i / 14), i % 14, l))))
        // Key writes land on the active layer, so switch layers around them.
        for (const L of [0, 1]) {
          const diff = p.keys[L].map((a, i) => [a, i] as const).filter(([a, i]) => a.kind !== 'unknown' && !same(a, s.keys[L][i]))
          if (!diff.length) continue
          jobs.push(() => kb.write(buildDev({ ...dev, keyLayer: L })), () => kb.write(buildLight(p.light)))
          for (const [a, i] of diff) jobs.push(() => kb.writeKey(buildKey(Math.floor(i / 14), i % 14, a)))
        }
        jobs.push(() => kb.write(buildDev(dev)), () => kb.write(buildLight(p.light)))
        for (const L of [0, 1]) {
          const table = [...s.mag[L]]
          p.mag[L].forEach((k, i) => {
            if (same(k, table[i])) return
            table[i] = k
            const crc = magCrc(Uint8Array.from(table.flatMap(magKeyBytes)))
            jobs.push(() => kb.writeMag(buildMag(L, Math.floor(i / 14), i % 14, k), crc))
          })
        }
        for (const [n, job] of jobs.entries()) {
          setBusy({ i: n + 1, n: jobs.length })
          await job()
        }
        await load(kb)
        notify('ok')
      }),
    [kb, guarded, load, notify],
  )

  const value: Store = {
    kb,
    model: kb?.model ?? null,
    state,
    demo,
    loading,
    busy,
    toasts,
    traffic,
    clearTraffic: () => setTraffic([]),
    connect,
    connectDemo,
    disconnect,
    reload,
    notify,
    setDev,
    setLight,
    setMb,
    setMc,
    setKeyLights,
    setKeys,
    preset,
    setMag,
    sendRaw,
    exportProfile,
    importProfile,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
