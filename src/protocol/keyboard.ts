import { HEAD, MASTER } from './constants'
import type { Packet, Transport } from './transport'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Request/response layer over a Transport. All operations are serialized so that
 * multi-packet exchanges (readback, CRC handshakes) never interleave.
 */
export class Keyboard {
  readonly transport: Transport
  private queue: Promise<unknown> = Promise.resolve()
  private waiters = new Set<(p: Packet) => boolean>()
  private listeners = new Set<(p: Packet) => void>()
  private off: () => void
  /** Optional traffic log for the debug console. */
  onTraffic?: (dir: 'out' | 'in', p: ArrayLike<number>) => void

  constructor(t: Transport) {
    this.transport = t
    this.off = t.onPacket((p) => {
      this.onTraffic?.('in', p)
      for (const w of [...this.waiters]) if (w(p)) this.waiters.delete(w)
      for (const l of this.listeners) l(p)
    })
  }

  get name() {
    return this.transport.name
  }

  get model() {
    return this.transport.model
  }

  /** Unsolicited packets (e.g. calibration reports). */
  subscribe(cb: (p: Packet) => void) {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** Run fn exclusively. */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  async send(p: ArrayLike<number>) {
    this.onTraffic?.('out', p)
    await this.transport.send(p)
  }

  /** Resolves with the first packet accepted by pred, or null on timeout. */
  waitFor(pred: (p: Packet) => boolean, timeout = 500): Promise<Packet | null> {
    return new Promise((resolve) => {
      const w = (p: Packet) => {
        if (!pred(p)) return false
        clearTimeout(t)
        resolve(p)
        return true
      }
      const t = setTimeout(() => {
        this.waiters.delete(w)
        resolve(null)
      }, timeout)
      this.waiters.add(w)
    })
  }

  /** Fire-and-forget write (lighting, DEV): no response from the firmware. */
  write(p: ArrayLike<number>) {
    return this.exclusive(() => this.send(p))
  }

  // ------------------------------------------------------------------ reads

  info() {
    return this.exclusive(async () => {
      const r = this.waitFor((p) => p[0] === HEAD.DEV_INFO, 800)
      await this.send([HEAD.DEV_INFO])
      return r
    })
  }

  /**
   * DRIVER_INIT readback of one section:
   *   <- 08 00 SECTION CNT(u16) CUR(u16, 1-based) LAST_LEN DATA[12]
   * Packets are placed by index; a lost packet triggers a retry of the whole section.
   */
  readSection(section: number, retries = 3): Promise<Uint8Array> {
    return this.exclusive(async () => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const parts = new Map<number, Uint8Array>()
        let cnt = 0
        let done: () => void = () => {}
        const finished = new Promise<void>((r) => (done = r))
        let idle: ReturnType<typeof setTimeout> | undefined
        const kick = () => {
          clearTimeout(idle)
          idle = setTimeout(done, 400)
        }
        const off = this.subscribe((p) => {
          if (p[0] !== HEAD.MASTER_PROC || p[1] !== MASTER.DRIVER_INIT || p[2] !== section) return
          cnt = p[3] | (p[4] << 8)
          const cur = p[5] | (p[6] << 8)
          parts.set(cur, p.slice(8, 8 + (cur === cnt ? p[7] : 12)))
          if (parts.size === cnt) done()
          else kick()
        })
        kick()
        await this.send([HEAD.MASTER_PROC, MASTER.DRIVER_INIT, section])
        await finished
        clearTimeout(idle)
        off()
        if (cnt && parts.size === cnt) {
          const out: number[] = []
          for (let i = 1; i <= cnt; i++) out.push(...parts.get(i)!)
          return Uint8Array.from(out)
        }
        await sleep(100)
      }
      throw new Error(`readback of section 0x${section.toString(16)} failed`)
    })
  }

  // ------------------------------------------------------------------ writes with CRC handshake

  /**
   * KEY writes: the device answers `00 c1` / `00 c2` (CRC request for the active layer) and the
   * driver replies `08 <req> 00 <crc32 LE>`. The firmware stores but never checks the CRC.
   */
  writeKey(p: ArrayLike<number>, crc = 0) {
    return this.exclusive(async () => {
      const req = this.waitFor((r) => r[1] === MASTER.KEY_M1_CRC || r[1] === MASTER.KEY_M2_CRC, 600)
      await this.send(p)
      const cmd = (await req)?.[1] ?? MASTER.KEY_M1_CRC
      const ack = this.waitFor((r) => r[1] === MASTER.SAVE_END, 2500)
      await this.send([HEAD.MASTER_PROC, cmd, 0, ...le32(crc)])
      await ack
    })
  }

  /** MAG_CFG: request `00 c9`, then an all-zero packet, then the CRC (as the vendor driver does). */
  writeMag(p: ArrayLike<number>, crc: number) {
    return this.exclusive(async () => {
      const req = this.waitFor((r) => r[1] === MASTER.MAG_CFG_M1_CRC || r[1] === MASTER.MAG_CFG_M2_CRC, 600)
      await this.send(p)
      const cmd = (await req)?.[1] ?? MASTER.MAG_CFG_M1_CRC
      await this.send([])
      const ack = this.waitFor((r) => r[1] === MASTER.SAVE_END, 1500)
      await this.send([HEAD.MASTER_PROC, cmd, 0, ...le32(crc)])
      await ack
    })
  }

  async close() {
    this.off()
    await this.transport.close()
  }
}

const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]

