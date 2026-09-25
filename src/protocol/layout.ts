// Physical layout (5x14 matrix, 64 keys) and the keycode tables used by key remapping.

export interface PhysKey {
  /** matrix position; also the index used by per-key tables: row * 14 + col */
  row: number
  col: number
  /** position in the calibration report / PHY_KEY_LIST order */
  phy: number
  label: string
  /** layout geometry in key units */
  x: number
  y: number
  w: number
}

// [label, width] per matrix row; null = unused matrix cell (no switch).
const ROWS_DEF: ([string, number] | null)[][] = [
  [['Esc', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['Back', 2]],
  [['Tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.5]],
  [['Caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], null, ['Enter', 2.25]],
  [['Shift', 2], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['Shift', 1], ['↑', 1], ['Del', 1]],
  [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], null, null, null, ['Space', 6.25], null, null, ['Alt', 1], ['Fn', 1], ['←', 1], ['↓', 1], ['→', 1]],
]

export const LAYOUT_W = 15
export const LAYOUT_H = 5

export const KEYS: PhysKey[] = (() => {
  const out: PhysKey[] = []
  ROWS_DEF.forEach((row, r) => {
    let x = 0
    row.forEach((k, c) => {
      if (!k) return
      out.push({ row: r, col: c, phy: out.length, label: k[0], x, y: r, w: k[1] })
      x += k[1]
    })
  })
  return out
})()

export const keyIndex = (row: number, col: number) => row * 14 + col
export const keyAt = (row: number, col: number) => KEYS.find((k) => k.row === row && k.col === col)

/** KEY_CHAR_LIST[6][21]: target keycodes for remapping, addressed as DES(row, col). '' = unused. */
export const DES_TABLE: string[][] = [
  ['`', '', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrtSc', 'ScrLk', 'Pause', '', '', '', ''],
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Back', 'Ins', 'Home', 'PgUp', 'NumLk', 'Num /', 'Num *', 'Num -'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\', 'Del', 'End', 'PgDn', 'Num 7', 'Num 8', 'Num 9', 'Num +'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", '', 'Enter', '', '', '', 'Num 4', 'Num 5', 'Num 6', ''],
  ['LShift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'RShift', '↑', 'Del', '', '', '', 'Num 1', 'Num 2', 'Num 3', 'Num Enter'],
  ['LCtrl', 'LWin', 'LAlt', '', '', '', 'Space', '', '', 'RAlt', 'Fn', '←', '↓', '→', '', '', '', 'Num 0', '', 'Num .', ''],
]
// DES(3,14..16) are mouse L/M/R buttons and (4,15)/(5,14..16) duplicate the arrows; the dedicated
// mouse mode is used instead, so they are left out of the picker.

/** Default keycode of physical key (r, c) is DES(r + 1, c). */
export const defaultDes = (row: number, col: number): [number, number] => [row + 1, col]

export const desLabel = (r: number, c: number) => DES_TABLE[r]?.[c] || `(${r},${c})`

/** Key picker groups: [groupKey, list of DES coords] */
export const DES_GROUPS: [string, [number, number][]][] = [
  ['letters', 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map((ch) => findDes(ch))],
  ['numbers', '1234567890'.split('').map((ch) => findDes(ch))],
  ['function', ['Esc', ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`), 'PrtSc', 'ScrLk', 'Pause', '`'].map(findDes)],
  ['symbols', ['-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'].map(findDes)],
  ['modifiers', ['LCtrl', 'LShift', 'LAlt', 'LWin', 'RShift', 'RAlt', 'Fn', 'Caps'].map(findDes)],
  ['editing', ['Tab', 'Enter', 'Back', 'Space', 'Ins', 'Del', 'Home', 'End', 'PgUp', 'PgDn', '↑', '↓', '←', '→'].map(findDes)],
  ['numpad', ['NumLk', 'Num /', 'Num *', 'Num -', 'Num +', 'Num Enter', 'Num .', ...Array.from({ length: 10 }, (_, i) => `Num ${i}`)].map(findDes)],
]

function findDes(label: string): [number, number] {
  for (let r = 0; r < DES_TABLE.length; r++) {
    const c = DES_TABLE[r].indexOf(label)
    if (c >= 0) return [r, c]
  }
  throw new Error(`unknown keycode ${label}`)
}

/** MEDIA_CHAR_LIST: media key = (byte = row + 1, data = 1 << bit). */
export const MEDIA_KEYS: { id: string; byte: number; bit: number }[] = [
  { id: 'mute', byte: 1, bit: 0 },
  { id: 'volUp', byte: 1, bit: 1 },
  { id: 'volDown', byte: 1, bit: 2 },
  { id: 'computer', byte: 1, bit: 3 },
  { id: 'calc', byte: 1, bit: 4 },
  { id: 'playPause', byte: 1, bit: 5 },
  { id: 'prevTrack', byte: 1, bit: 6 },
  { id: 'nextTrack', byte: 1, bit: 7 },
  { id: 'homepage', byte: 2, bit: 1 },
  { id: 'browserBack', byte: 2, bit: 2 },
  { id: 'browserForward', byte: 2, bit: 3 },
]

export const MOUSE_BUTTONS = [
  { id: 'left', bit: 1 },
  { id: 'right', bit: 2 },
  { id: 'middle', bit: 4 },
] as const
