// Keyboard models this driver knows. A model is picked from the USB VID/PID before anything is
// sent; unknown devices are never written to, since other boards in the vendor's family use
// different command sets (see docs/PROTOCOL.md).

/** How the on-screen preview imitates an effect (see components/ledPreview.ts). */
export type Anim = 'static' | 'breath' | 'spectrum' | 'flow' | 'roll' | 'twinkle'

export interface EffectMode {
  mode: number
  zh: string
  en: string
  anim: Anim
  dir?: boolean
  color?: boolean
  speed?: boolean
}

export interface Model {
  id: string
  /** shown when the device has no product name */
  name: string
  vid: number
  pid: number
  /** backlight effects, in the vendor app's order */
  mb: EffectMode[]
  /** ambient light effects; empty = no ambient light */
  mc: EffectMode[]
}

export const QC64: Model = {
  id: 'qc64',
  name: 'M6 Lite+',
  vid: 0x2233,
  pid: 0x006b,
  // Only what MMPanel offers for this board; the firmware ignores the other MB_MODE_CMD values
  // (8 ripple .. 23, and 254 "dark" — the backlight is switched off with LIGHT_CFG bottomOn instead).
  // 1 EQ (music) is left out: it needs the host to stream audio levels.
  mb: [
    { mode: 2, zh: '常亮', en: 'Static', anim: 'static', color: true },
    { mode: 5, zh: '流光', en: 'Flow', anim: 'flow', dir: true, color: true, speed: true },
    { mode: 4, zh: '渐变', en: 'Spectrum', anim: 'spectrum', speed: true },
    { mode: 6, zh: '星空', en: 'Starlight', anim: 'twinkle', color: true, speed: true },
    { mode: 7, zh: '滚动', en: 'Roll', anim: 'roll', dir: true, color: true, speed: true },
    { mode: 3, zh: '呼吸', en: 'Breathing', anim: 'breath', color: true, speed: true },
  ],
  // MMPanel's ambient page for this board lists only these five.
  mc: [
    { mode: 5, zh: '流光', en: 'Flow', anim: 'flow', speed: true },
    { mode: 3, zh: '呼吸', en: 'Breathing', anim: 'breath', color: true, speed: true },
    { mode: 6, zh: '星空', en: 'Starlight', anim: 'twinkle', color: true, speed: true },
    { mode: 4, zh: '渐变', en: 'Spectrum', anim: 'spectrum', speed: true },
    { mode: 7, zh: '常亮', en: 'Static', anim: 'static', color: true },
  ],
}

export const MODELS: Model[] = [QC64]

/** Vendor ID used by the boards MMPanel drives; the device chooser lists everything under it. */
export const VENDOR_ID = 0x2233

export const findModel = (vid: number, pid: number) => MODELS.find((m) => m.vid === vid && m.pid === pid)
