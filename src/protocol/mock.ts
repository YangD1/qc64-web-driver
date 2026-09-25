// In-browser simulated keyboard: same packet protocol, state kept in memory.
// Lets the UI run without hardware (development, GitHub Pages demo).
import { HEAD, KEY_MODE, MAG_CAL, MASTER, PROG, SECTION } from './constants'
import { mtOffset } from './codec'
import { KEYS } from './layout'
import { QC64 } from './models'
import type { Packet, Transport } from './transport'

export class MockTransport implements Transport {
  readonly name = 'Demo keyboard'
  readonly model = QC64
  private cbs = new Set<(p: Packet) => void>()
  private sec = new Map<number, Uint8Array>()
  private calTimer?: ReturnType<typeof setInterval>

  constructor() {
    this.sec.set(SECTION.DEV, Uint8Array.from([0, 0, 0, 1, 1, 0, 1, 10, 1, 5, 0, 0, 0, 0]))
    this.sec.set(SECTION.LIGHT_CFG, Uint8Array.from([255, 255, 255, 200, 0, 1, 1, 1, 0, 1, 255, 0, 0, 1, 10, 7, 8, 80]))
    const mb = new Uint8Array(218)
    mb[0] = 2
    for (let m = 2; m <= 22; m++) mb.set([0, 0, 1, 0, 47, 167, 0x88, 0x13, 0, 0], 10 * m - 12)
    this.sec.set(SECTION.MB, mb)
    const mc = new Uint8Array(106)
    mc[0] = 4
    for (let i = 0; i < 13; i++) mc.set([0, 255, 0, 255, 0x10, 0x27, 0, 0], 2 + 8 * i)
    this.sec.set(SECTION.MC, mc)
    this.sec.set(SECTION.MT, new Uint8Array(840))
    for (const s of [SECTION.KEY_M1, SECTION.KEY_M2]) {
      const k = new Uint8Array(8 + 70 * 68)
      for (let i = 0; i < 70; i++) k.set([Math.floor(i / 14) + 1, i % 14], 8 + i * 68 + 9)
      this.sec.set(s, k)
    }
    for (const s of [SECTION.MAG_M1, SECTION.MAG_M2]) {
      const m = new Uint8Array(70 * 14)
      for (let i = 0; i < 70; i++) m.set([1, 0, 30, 0, 200, 0, 100, 0, 0xf4, 1, 0xf4, 1, 1, 0], i * 14)
      this.sec.set(s, m)
    }
    const cal = new Uint8Array(420)
    for (let i = 0; i < 70; i++) cal.set([0, 0, 0x50, 0x06, 0x00, 0x0a], i * 6)
    this.sec.set(SECTION.MAG_CAL, cal)
  }

  onPacket(cb: (p: Packet) => void) {
    this.cbs.add(cb)
    return () => this.cbs.delete(cb)
  }

  async close() {
    clearInterval(this.calTimer)
  }

  private emit(...bytes: number[]) {
    const p = new Uint8Array(20)
    p.set(bytes.slice(0, 20))
    setTimeout(() => this.cbs.forEach((cb) => cb(p)), 5)
  }

  private get layer() {
    return this.sec.get(SECTION.DEV)![2]
  }

  async send(plain: ArrayLike<number>) {
    const p = Array.from(plain)
    if (p[0] === HEAD.DEV_INFO) return this.emit(0x10, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 9)
    if (p[0] !== HEAD.MASTER_PROC) return
    const d = p.slice(2)
    switch (p[1]) {
      case MASTER.DRIVER_INIT:
        return this.stream(p[2])
      case MASTER.DEV:
        this.sec.set(SECTION.DEV, Uint8Array.from(d.slice(0, 14)))
        return
      case MASTER.LIGHT_CFG:
        this.sec.set(SECTION.LIGHT_CFG, Uint8Array.from(d.slice(0, 18)))
        return
      case MASTER.MB: {
        const mb = this.sec.get(SECTION.MB)!
        const m = p[2]
        mb[0] = m
        if (m >= 2 && m <= 22) mb.set([p[3], 0, p[8], p[9], p[10], p[11], p[4], p[5], p[6], p[7]], 10 * m - 12)
        return
      }
      case MASTER.MC: {
        const mc = this.sec.get(SECTION.MC)!
        const m = p[3]
        mc[0] = m
        const i = [3, 4, 5, 6, 1, 2, 7, 8, 9, 10, 11, 12, 13].indexOf(m)
        if (i >= 0) mc.set([p[8], p[9], p[10], p[11], p[4], p[5], p[6], p[7]], 2 + 8 * i)
        return
      }
      case MASTER.MT:
        if (p[2] === 1) this.sec.get(SECTION.MT)!.set([p[5], p[6], p[7], p[8], p[9], p[10]], mtOffset(p[4], p[3]))
        return
      case MASTER.KEY:
        this.key(p)
        return this.emit(0, this.layer ? MASTER.KEY_M2_CRC : MASTER.KEY_M1_CRC)
      case MASTER.KEY_M1_CRC:
      case MASTER.KEY_M2_CRC:
      case MASTER.MAG_CFG_M1_CRC:
      case MASTER.MAG_CFG_M2_CRC:
        return this.emit(0, MASTER.SAVE_END)
      case MASTER.MAG_CFG: {
        const t = this.sec.get(p[3] ? SECTION.MAG_M2 : SECTION.MAG_M1)!
        t.set([p[6], 0, ...p.slice(7, 19)], (p[4] * 14 + p[5]) * 14)
        return this.emit(0, p[3] ? MASTER.MAG_CFG_M2_CRC : MASTER.MAG_CFG_M1_CRC)
      }
      case MASTER.MAG_CAL:
        return this.cal(p[2])
    }
  }

  private key(p: number[]) {
    const t = this.sec.get(this.layer ? SECTION.KEY_M2 : SECTION.KEY_M1)!
    const reset = (i: number) => {
      t.fill(0, 8 + i * 68, 8 + i * 68 + 68)
      t.set([Math.floor(i / 14) + 1, i % 14], 8 + i * 68 + 9)
    }
    const presets: Record<number, [number, number][]> = {
      [PROG.WASD_DKS_ON]: [[1, 2], [2, 1], [2, 2], [2, 3]],
      [PROG.AD_SNAP_ON]: [[2, 1], [2, 3]],
      [PROG.AD_CANCEL_ON]: [[2, 1], [2, 3]],
    }
    if (p[2] === PROG.ALL_RESET || p[2] === PROG.WASD_DKS_SNAP_OFF) {
      for (let i = 0; i < 70; i++) if (p[2] === PROG.ALL_RESET || [16, 29, 30, 31].includes(i)) reset(i)
      return
    }
    if (presets[p[2]]) {
      const mode = p[2] === PROG.WASD_DKS_ON ? KEY_MODE.DKS : p[2] === PROG.AD_SNAP_ON ? KEY_MODE.SNAP : KEY_MODE.CANCEL
      for (const [r, c] of presets[p[2]]) t[8 + (r * 14 + c) * 68] = mode
      return
    }
    const i = p[6] * 14 + p[7]
    const o = 8 + i * 68
    reset(i)
    if (p[2] !== PROG.SINGLE_SET) return
    const mode = p[8]
    t[o] = mode
    if (mode === KEY_MODE.MOD && p[9] === 1) t.set([1, 0, 0, p[10], p[11], p[12], p[13], p[14], p[15], p[16]], o + 8)
    else if (mode === KEY_MODE.MOD) t.set([0, p[10], p[11], 0, 0, 0, 0, 0, 0, p[16]], o + 8)
    if (mode === KEY_MODE.MEDIA) t.set([p[9], p[10]], o + 2)
    if (mode === KEY_MODE.DKS) t.set([0, p[10], p[11], 0, 0, 0, 0, 0, 0, p[17], p[18]], o + 52)
    if (mode === KEY_MODE.SNAP) t.set([p[10], p[11]], o + 64)
    if (mode === KEY_MODE.CANCEL) t.set([p[10], p[11]], o + 66)
  }

  private cal(c: number) {
    clearInterval(this.calTimer)
    if (c !== MAG_CAL.START) return
    // Simulate a user pressing every key once, a few per tick.
    const min = new Map<number, number>()
    let tick = 0
    this.calTimer = setInterval(() => {
      tick++
      for (const k of KEYS) {
        if (Math.random() > 0.08) continue
        const rest = 2500 + (k.phy % 7) * 10
        const m = Math.max(rest - 950, (min.get(k.phy) ?? rest) - 150 - Math.floor(Math.random() * 200))
        min.set(k.phy, m)
        this.emit(HEAD.MASTER_PROC, MASTER.MAG_CAL, MAG_CAL.REPORT, 0, 0, k.phy, m & 0xff, m >> 8, rest & 0xff, rest >> 8)
      }
      if (tick > 600) clearInterval(this.calTimer)
    }, 120)
  }

  private stream(section: number) {
    const data = this.sec.get(section) ?? new Uint8Array(4)
    const cnt = Math.max(1, Math.ceil(data.length / 12))
    for (let i = 0; i < cnt; i++) {
      const chunk = Array.from(data.subarray(i * 12, i * 12 + 12))
      this.emit(HEAD.MASTER_PROC, MASTER.DRIVER_INIT, section, cnt & 0xff, cnt >> 8, (i + 1) & 0xff, (i + 1) >> 8, chunk.length, ...chunk)
    }
  }
}

