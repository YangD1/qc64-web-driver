import { useSyncExternalStore } from 'react'

/** 'auto' follows the clock: dark from 19:00 to 07:00. */
export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'theme'
const subs = new Set<() => void>()

let pref: ThemePref = (() => {
  const saved = localStorage.getItem(KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'auto'
})()

const isNight = () => {
  const h = new Date().getHours()
  return h >= 19 || h < 7
}

function apply() {
  const dark = pref === 'dark' || (pref === 'auto' && isNight())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

apply()
setInterval(apply, 60_000)

export function setThemePref(p: ThemePref) {
  pref = p
  if (p === 'auto') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, p)
  apply()
  subs.forEach((f) => f())
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => pref,
  )
}
