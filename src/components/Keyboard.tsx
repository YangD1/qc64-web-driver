import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { KEYS, LAYOUT_H, LAYOUT_W, keyIndex, type PhysKey } from '../protocol/layout'
import { cx } from './ui'

export interface KeyboardProps {
  selected?: Set<number>
  onSelect?: (next: Set<number>) => void
  /** content under the key legend */
  overlay?: (k: PhysKey, i: number) => ReactNode
  /** extra style for the keycap top (e.g. per-key color) */
  capStyle?: (k: PhysKey, i: number) => CSSProperties | undefined
  /** replace the legend */
  legend?: (k: PhysKey, i: number) => ReactNode
  dimmed?: (i: number) => boolean
}

/**
 * The 64-key (60%) board, drawn to scale. Click toggles a key, dragging across keys
 * adds (or removes) them in one sweep.
 */
export function Keyboard({ selected, onSelect, overlay, capStyle, legend, dimmed }: KeyboardProps) {
  const drag = useRef<{ add: boolean; set: Set<number> } | null>(null)

  useEffect(() => {
    const up = () => (drag.current = null)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  // Click toggles a key in/out of the selection; dragging paints the same action
  // (add or remove, decided by the first key) across every key it passes.
  const down = (i: number) => {
    if (!onSelect || !selected) return
    const next = new Set(selected)
    const add = !next.has(i)
    if (add) next.add(i)
    else next.delete(i)
    drag.current = { add, set: next }
    onSelect(next)
  }

  const enter = (i: number) => {
    const d = drag.current
    if (!d || !onSelect || d.set.has(i) === d.add) return
    d.set = new Set(d.set)
    if (d.add) d.set.add(i)
    else d.set.delete(i)
    onSelect(d.set)
  }

  return (
    <div className="glass rounded-[clamp(14px,2vw,30px)] p-[1.2%]">
      <div className="relative w-full select-none" style={{ aspectRatio: `${LAYOUT_W} / ${LAYOUT_H}` }}>
        {KEYS.map((k) => {
          const i = keyIndex(k.row, k.col)
          const sel = selected?.has(i)
          return (
            <button
              key={i}
              type="button"
              aria-pressed={sel}
              aria-label={k.label}
              onPointerDown={(e) => {
                // touch pointers are implicitly captured by the pressed key; release so drag reaches other keys
                ;(e.target as Element).releasePointerCapture?.(e.pointerId)
                down(i)
              }}
              onPointerEnter={() => enter(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  down(i)
                  drag.current = null
                }
              }}
              className={cx('absolute p-[0.35%]', sel && 'z-10')}
              style={{
                left: `${(k.x / LAYOUT_W) * 100}%`,
                top: `${(k.y / LAYOUT_H) * 100}%`,
                width: `${(k.w / LAYOUT_W) * 100}%`,
                height: `${100 / LAYOUT_H}%`,
              }}
            >
              <span
                className={cx(
                  'relative flex h-full w-full flex-col overflow-hidden rounded-[clamp(5px,0.6vw,10px)] border-b-[3px] transition-[background,border-color,transform,opacity,box-shadow] duration-150',
                  sel
                    ? '-translate-y-[2px] border-klein bg-klein-hi shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--color-klein-hi),0_8px_20px_rgb(47_91_255/0.45)]'
                    : 'border-[#d3d9e6] bg-[#f3f5fa] shadow-[0_1px_2px_rgb(30_45_90/0.12),0_4px_10px_-4px_rgb(30_45_90/0.18)] hover:-translate-y-px',
                  dimmed?.(i) && !sel && 'opacity-35',
                )}
              >
                <span
                  className={cx('absolute inset-x-[clamp(2px,0.3vw,5px)] top-[6%] bottom-[12%] rounded-[clamp(3px,0.45vw,7px)]', sel ? 'bg-linear-to-b from-[#5a7dff] to-klein-hi' : 'bg-linear-to-b from-white to-[#f7f8fc]')}
                  style={capStyle?.(k, i)}
                />
                <span className="relative flex h-full flex-col justify-between px-[clamp(4px,0.55vw,9px)] pt-[clamp(3px,0.4vw,7px)] pb-[clamp(5px,0.75vw,11px)] text-left">
                  <span className={cx('truncate text-[clamp(8px,1.05vw,13px)] leading-tight font-semibold', sel ? 'text-white' : 'text-fg/75')}>
                    {legend ? legend(k, i) : k.label}
                  </span>
                  {overlay?.(k, i)}
                </span>
              </span>
              {sel && (
                <span className="pointer-events-none absolute top-0 right-0 z-20 flex size-[clamp(12px,1.3vw,18px)] -translate-y-[2px] items-center justify-center rounded-full bg-white text-[clamp(8px,0.9vw,12px)] font-bold text-klein-hi shadow-[0_2px_6px_rgb(30_45_90/0.3)]">
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const ALL_KEYS = new Set(KEYS.map((k) => keyIndex(k.row, k.col)))
