import type { CSSProperties } from 'react'
import type { Effect, KeyLight, LightCfg } from '../protocol/codec'
import { LAYOUT_H, LAYOUT_W, type PhysKey } from '../protocol/layout'
import type { Anim, EffectMode } from '../protocol/models'

/**
 * Approximate on-screen rendering of the keyboard's LEDs. The firmware effects are
 * not documented, so animated modes are imitated with CSS keyframes (see index.css)
 * from their name, colour, direction and speed.
 */

/** single-key light modes: 1 static, 2 breath, 3 gradient */
const MT_ANIM: Record<number, Anim> = { 1: 'static', 2: 'breath', 3: 'spectrum' }

// Firmware speed is a period; seconds per cycle = speed × factor, measured per effect:
// breathing 2000 -> 1 s, spectrum and flow 10000 -> 15 s, roll 3007 -> 2.2 s. Unmeasured effects use the breathing factor.
const SEC_PER_UNIT: Partial<Record<Anim, number>> = { breath: 1 / 2000, spectrum: 1.5 / 1000, flow: 1.5 / 1000, roll: 2.2 / 3007 }
const period = (anim: Anim, speed: number) =>
  `${Math.min(30, Math.max(0.25, (speed || 5000) * (SEC_PER_UNIT[anim] ?? 1 / 2000))).toFixed(2)}s`

// Cheap deterministic per-key pseudo-random in [0, 1).
const rand = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1

// Observed on the board: the flow rainbow covers less than one full cycle across the width.
const FLOW_SPAN = 0.5
// Roll: the rows fill during the first half of the cycle, one row per 1/10 cycle.
const ROLL_ROW_SHIFT = 0.1

function style(anim: Anim, color: string | null, opacity: number, k: PhysKey, i: number, speed: number, dir: number): CSSProperties {
  // null colour = the firmware's own rainbow
  const rainbow = color === null
  // spectrum/flow animate it themselves; elsewhere give each key its own hue
  color ??= `hsl(${Math.round(rand(i) * 360)} 90% 55%)`
  const base: CSSProperties & Record<string, string | number> = {
    background: color,
    opacity,
    boxShadow: `0 0 12px 1px ${color}`,
    '--o': opacity,
  }
  const t = period(anim, speed)
  const frac = k.x / LAYOUT_W
  switch (anim) {
    case 'breath':
      return { ...base, animation: `led-breath ${t} linear infinite` }
    case 'spectrum':
      return { ...base, animation: `led-spectrum ${t} linear infinite` }
    case 'roll': {
      // Rows light up one by one until the board is full, then go dark in the same order.
      // Seen on the board: dir 1 starts from the bottom row; dir 0 assumed to start from the top.
      const step = dir ? LAYOUT_H - 1 - k.y : k.y
      const delay = `-${((1 - step * ROLL_ROW_SHIFT) * parseFloat(t)).toFixed(2)}s`
      const c = rainbow ? `hsl(${Math.round((step / LAYOUT_H) * 360)} 90% 55%)` : color
      return { ...base, background: c, boxShadow: `0 0 12px 1px ${c}`, animation: `led-wipe ${t} linear infinite`, animationDelay: delay }
    }
    case 'flow': {
      // A band travels left -> right (dir 1 reverses): each key runs the same cycle,
      // phase-shifted by its column. The rainbow spans FLOW_SPAN cycles edge to edge.
      const shift = (frac * FLOW_SPAN) % 1
      const delay = `-${((dir ? shift : 1 - shift) * parseFloat(t)).toFixed(2)}s`
      return { ...base, animation: `${rainbow ? 'led-spectrum' : 'led-breath'} ${t} linear infinite`, animationDelay: delay }
    }
    case 'twinkle':
      return { ...base, animation: `led-twinkle ${t} ease-in-out infinite`, animationDelay: `-${(rand(i) * parseFloat(t)).toFixed(2)}s` }
    default:
      return base
  }
}

export interface LedState {
  light: LightCfg
  mb: { mode: number; effects: Record<number, Effect> }
  mt: KeyLight[]
}

/** modes: the model's backlight effects, which say how each mode is drawn */
export function ledStyle(s: LedState, modes: EffectMode[], k: PhysKey, i: number): CSSProperties | undefined {
  // brightness 0..255 -> keep a floor so a dim board is still visible on screen
  const level = s.light.brightness / 255
  const opacity = level === 0 ? 0 : 0.25 + 0.5 * level

  const m = s.mt[i]
  if (m?.active) {
    const anim = MT_ANIM[m.mode] ?? 'static'
    return style(anim, rgb(m.r, m.g, m.b), Math.max(opacity, 0.5), k, i, 3000, 0)
  }

  const mode = s.mb.mode
  const e = s.mb.effects[mode]
  if (!s.light.bottomOn || mode === 254 || mode === 0 || !e || !opacity) return undefined
  const anim = modes.find((m) => m.mode === mode)?.anim ?? 'static'
  // without a custom colour the firmware cycles a rainbow; lay it out across the board
  const color = e.custom ? rgb(e.r, e.g, e.b) : null
  return style(anim, color, opacity, k, i, e.speed, e.dir)
}

const rgb = (r: number, g: number, b: number) => `rgb(${r} ${g} ${b})`
