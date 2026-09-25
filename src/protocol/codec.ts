// Section parsers (DRIVER_INIT readback) and packet builders. Offsets are documented in docs/PROTOCOL.md.
import { HEAD, KEY_MODE, MASTER, PROG, type KeyMode } from './constants'

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const i16 = (b: Uint8Array, o: number) => (u16(b, o) << 16) >> 16
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
const cmd = (master: number, ...data: number[]) => [HEAD.MASTER_PROC, master, ...data]

// ---------------------------------------------------------------- device info / DEV

export interface DevInfo {
  /** firmware version bytes p[9..11], e.g. 2.2.9 */
  version: string
}
export const parseDevInfo = (p: Uint8Array): DevInfo => ({ version: `${p[9]}.${p[10]}.${p[11]}` })

/** dev_cfg_t (14 bytes). Write = MASTER DEV + these bytes, always followed by LIGHT_CFG. */
export const DEV_FIELDS = [
  'devMode',
  'transMode',
  'keyLayer',
  'pfmMode',
  'cbkActived',
  'winLock',
  'wirelessSleep',
  'sleepDelay',
  'fastSleep',
  'fastSleepDelay',
  'fnAltSwap',
  'magLayer',
  'dynScan',
  'autoCal',
] as const
export type DevField = (typeof DEV_FIELDS)[number]
export type DevCfg = Record<DevField, number>

export const parseDev = (b: Uint8Array): DevCfg =>
  Object.fromEntries(DEV_FIELDS.map((f, i) => [f, b[i] ?? 0])) as DevCfg
export const devBytes = (d: DevCfg) => DEV_FIELDS.map((f) => d[f])

/** light_cfg_t (18 bytes). */
export const LIGHT_FIELDS = [
  'satR',
  'satG',
  'satB',
  'brightness',
  'highlight',
  'bottomOn',
  'topOn',
  'enterOn',
  'enterUnify',
  'ambientOn',
  'ambientBrightness',
  'ambientSync',
  'plateSync',
  'monitorOn',
  'mtBreathSpeed',
  'mtGradientSpeed',
  'meArgbSpeed',
  'meSpreadSpeed',
] as const
export type LightField = (typeof LIGHT_FIELDS)[number]
export type LightCfg = Record<LightField, number>
export const parseLight = (b: Uint8Array): LightCfg =>
  Object.fromEntries(LIGHT_FIELDS.map((f, i) => [f, b[i] ?? 0])) as LightCfg
export const lightBytes = (l: LightCfg) => LIGHT_FIELDS.map((f) => l[f])

export const buildDev = (d: DevCfg) => cmd(MASTER.DEV, ...devBytes(d))
export const buildLight = (l: LightCfg) => cmd(MASTER.LIGHT_CFG, ...lightBytes(l))

// ---------------------------------------------------------------- lighting

export interface Effect {
  mode: number
  dir: number
  speed: number
  speed2: number
  custom: boolean
  r: number
  g: number
  b: number
}

/** MB section: [0] mode; record for mode m (2..22) at 10m-12: DIR ? CUSTOM R G B SPEED1 SPEED2 */
export function parseMb(b: Uint8Array): { mode: number; effects: Record<number, Effect> } {
  const effects: Record<number, Effect> = {}
  for (let m = 2; m <= 22; m++) {
    const o = 10 * m - 12
    if (o + 10 > b.length) break
    effects[m] = { mode: m, dir: b[o], custom: !!b[o + 2], r: b[o + 3], g: b[o + 4], b: b[o + 5], speed: u16(b, o + 6), speed2: u16(b, o + 8) }
  }
  return { mode: b[0], effects }
}

export const buildMb = (e: Effect) =>
  cmd(MASTER.MB, e.mode, e.dir, ...le16(e.speed), ...le16(e.speed2), e.custom ? 1 : 0, e.r, e.g, e.b)

/** MC section: [0] mode; 8-byte records CUSTOM R G B SPEED1 SPEED2 from offset 2, in this mode order. */
const MC_ORDER = [3, 4, 5, 6, 1, 2, 7, 8, 9, 10, 11, 12, 13]
export function parseMc(b: Uint8Array): { mode: number; effects: Record<number, Effect> } {
  const effects: Record<number, Effect> = {}
  MC_ORDER.forEach((m, i) => {
    const o = 2 + 8 * i
    if (o + 8 > b.length) return
    effects[m] = { mode: m, dir: 0, custom: !!b[o], r: b[o + 1], g: b[o + 2], b: b[o + 3], speed: u16(b, o + 4), speed2: u16(b, o + 6) }
  })
  return { mode: b[0], effects }
}

export const buildMc = (e: Effect) =>
  cmd(MASTER.MC, 0, e.mode, ...le16(e.speed), ...le16(e.speed2), e.custom ? 1 : 0, e.r, e.g, e.b)

/** Per-key light (MT), 70 x 12 bytes; first 6 = ACTIVE MODE A R G B. */
export interface KeyLight {
  active: boolean
  mode: number
  r: number
  g: number
  b: number
}
/** MT section: 14 cols × 6 rows, column-major, 10 bytes each: ACTIVE MODE A R G B ... */
export const mtOffset = (row: number, col: number) => (col * 6 + row) * 10
export function parseMt(b: Uint8Array): KeyLight[] {
  return Array.from({ length: 70 }, (_, i) => {
    const o = mtOffset(Math.floor(i / 14), i % 14)
    return { active: !!b[o], mode: b[o + 1], r: b[o + 3], g: b[o + 4], b: b[o + 5] }
  })
}
/** MT SINGLE: note COL before ROW. */
export const buildMt = (row: number, col: number, l: KeyLight) =>
  cmd(MASTER.MT, 1, col, row, l.active ? 1 : 0, l.mode || 1, 0xff, l.r, l.g, l.b)

// ---------------------------------------------------------------- key programming

export type KeyAction =
  | { kind: 'default' }
  | { kind: 'key'; des: [number, number] }
  | { kind: 'media'; byte: number; data: number }
  | { kind: 'mouse'; button: number; x: number; y: number; wheel: number }
  | { kind: 'dks'; des: [number, number]; interval: number }
  | { kind: 'snap'; partner: [number, number] }
  | { kind: 'cancel'; partner: [number, number] }
  | { kind: 'fn' }
  | { kind: 'disabled' }
  | { kind: 'unknown'; mode: number }

/** key_t, 68 bytes per key after an 8-byte header (crc, all_step). */
export function parseKeyTable(b: Uint8Array): KeyAction[] {
  return Array.from({ length: 70 }, (_, i) => {
    const o = 8 + i * 68
    if (o + 68 > b.length) return { kind: 'default' }
    const r = Math.floor(i / 14)
    const c = i % 14
    const mode = b[o] as KeyMode
    switch (mode) {
      case KEY_MODE.MOD: {
        if (b[o + 8] === 1) return { kind: 'mouse', button: b[o + 11], x: i16(b, o + 12), y: i16(b, o + 14), wheel: (b[o + 16] << 24) >> 24 }
        const des: [number, number] = [b[o + 9], b[o + 10]]
        return des[0] === r + 1 && des[1] === c ? { kind: 'default' } : { kind: 'key', des }
      }
      case KEY_MODE.MEDIA:
        return { kind: 'media', byte: b[o + 2], data: b[o + 3] }
      case KEY_MODE.FN:
        return { kind: 'fn' }
      case KEY_MODE.DKS:
        return { kind: 'dks', des: [b[o + 53], b[o + 54]], interval: u16(b, o + 61) }
      case KEY_MODE.SNAP:
        return { kind: 'snap', partner: [b[o + 64], b[o + 65]] }
      case KEY_MODE.CANCEL:
        return { kind: 'cancel', partner: [b[o + 66], b[o + 67]] }
      case KEY_MODE.DISABLED:
        return { kind: 'disabled' }
      default:
        return { kind: 'unknown', mode }
    }
  })
}

/** KEY SINGLE_SET/RESET packet for physical key (row, col). Written to the ACTIVE layer. */
export function buildKey(row: number, col: number, a: KeyAction): number[] {
  const head = (mode: number) => cmd(MASTER.KEY, PROG.SINGLE_SET, 0, 0, 0, row, col, mode)
  switch (a.kind) {
    case 'default':
      return cmd(MASTER.KEY, PROG.SINGLE_RESET, 0, 0, 0, row, col)
    case 'key':
      return [...head(KEY_MODE.MOD), 0, a.des[0], a.des[1], 0, 0, 0, 0, 1]
    case 'media':
      return [...head(KEY_MODE.MEDIA), a.byte, a.data, 0]
    case 'mouse':
      return [...head(KEY_MODE.MOD), 1, a.button, ...le16(a.x), ...le16(a.y), a.wheel & 0xff, 1]
    case 'dks':
      return [...head(KEY_MODE.DKS), 0, a.des[0], a.des[1], 0, 0, 0, 0, 0, ...le16(a.interval)]
    case 'snap':
      return [...head(KEY_MODE.SNAP), 0, a.partner[0], a.partner[1]]
    case 'cancel':
      return [...head(KEY_MODE.CANCEL), 0, a.partner[0], a.partner[1]]
    case 'fn':
      return head(KEY_MODE.FN)
    case 'disabled':
      return head(KEY_MODE.DISABLED)
    case 'unknown':
      throw new Error('cannot write unknown key mode')
  }
}

export const buildPreset = (prog: number) => cmd(MASTER.KEY, prog)

// ---------------------------------------------------------------- magnetic switches

/** mag_key_cfg, 14 bytes. Distances in device units (see UNIT_MM). */
export interface MagKey {
  rt: boolean
  head: number
  down: number
  up: number
  fixDown: number
  fixUp: number
  bottom: number
}
/** Device distance unit in millimetres (assumed 0.001 mm; verify against the vendor UI). */
export const UNIT_MM = 0.001

export function parseMagTable(b: Uint8Array): MagKey[] {
  return Array.from({ length: 70 }, (_, i) => {
    const o = i * 14
    return { rt: !!b[o], head: u16(b, o + 2), down: u16(b, o + 4), up: u16(b, o + 6), fixDown: u16(b, o + 8), fixUp: u16(b, o + 10), bottom: u16(b, o + 12) }
  })
}
export const magKeyBytes = (k: MagKey) => [
  k.rt ? 1 : 0, 0, ...le16(k.head), ...le16(k.down), ...le16(k.up), ...le16(k.fixDown), ...le16(k.fixUp), ...le16(k.bottom),
]
export const buildMag = (layer: number, row: number, col: number, k: MagKey) =>
  cmd(MASTER.MAG_CFG, 1, layer, row, col, k.rt ? 1 : 0, ...magKeyBytes(k).slice(2))

// ---------------------------------------------------------------- calibration

/** MAG_CAL section: 70 x (u16 0, u16 MIN, u16 REST). */
export const parseCal = (b: Uint8Array) =>
  Array.from({ length: 70 }, (_, i) => ({ min: u16(b, i * 6 + 2), rest: u16(b, i * 6 + 4) }))

/** Report while calibrating: 08 30 11 00 00 PHY MIN REST */
export const parseCalReport = (p: Uint8Array) =>
  p[0] === HEAD.MASTER_PROC && p[1] === MASTER.MAG_CAL && p[2] === 0x11
    ? { phy: p[5], min: u16(p, 6), rest: u16(p, 8) }
    : null
export const buildCal = (c: number) => cmd(MASTER.MAG_CAL, c)
