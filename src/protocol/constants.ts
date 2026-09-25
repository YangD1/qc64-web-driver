// Protocol constants for the QC64-family magnetic keyboards (e.g. "M6 Lite+", 2233:006B;
// USB IDs live in models.ts). See docs/PROTOCOL.md for how each value was derived.

/** Vendor interface MI_02: usage page 0x0C / usage 0x00, 21-byte reports with id 0x04. */
export const USAGE_PAGE = 0x0c
export const USAGE = 0x00
export const REPORT_ID = 0x04
export const PAYLOAD_LEN = 20

/** Payload bytes 0..19 are XOR'ed with a fixed key per direction (no session negotiation). */
export const OUT_KEY = hex('8e 96 ce 6a f2 72 99 48 58 61 27 58 e8 9a 7f 01 95 ee ed 2f')
export const IN_KEY = hex('6a 6d 64 66 3f 2e f0 43 0a 41 ea 8f 2b fc e0 e7 d5 52 7b a5')

/** p[0] */
export const HEAD = { DEV_INFO: 0x10, MASTER_PROC: 0x08 } as const

/** p[1] when p[0] = MASTER_PROC */
export const MASTER = {
  DRIVER_INIT: 0x00,
  DEV: 0x02,
  KEY: 0x03,
  MB: 0x05,
  MT: 0x08,
  MC: 0x0b,
  LIGHT_CFG: 0x11,
  MAG_CAL: 0x30,
  MAG_CFG: 0x31,
  KEY_M1_CRC: 0xc1,
  KEY_M2_CRC: 0xc2,
  MAG_CFG_M1_CRC: 0xc9,
  MAG_CFG_M2_CRC: 0xca,
  SAVE_END: 0xfe,
  // Never send: 0xcc FACTORY_RESET, 0xdd IAP_MODE (firmware update mode).
} as const

/** DRIVER_INIT section ids (INIT_CMD). Each read returns exactly that section. */
export const SECTION = {
  START: 0x00,
  DEV: 0x01,
  KEY_M1: 0x02,
  KEY_M2: 0x04,
  MB: 0x06,
  MT: 0x07,
  MC: 0x09,
  CBK_M1: 0x0d,
  LIGHT_CFG: 0x11,
  MAG_CAL: 0x18,
  MAG_M1: 0x19,
  MAG_M2: 0x1a,
  KEY_M1_CRC: 0xc1,
  KEY_M2_CRC: 0xc2,
  MAG_M1_CRC: 0xc7,
  MAG_M2_CRC: 0xc8,
  END: 0xfe,
} as const

/** KEY (0x03) p[2]: PROG_CMD */
export const PROG = {
  SINGLE_SET: 0x01,
  SINGLE_RESET: 0x02,
  ALL_RESET: 0x04,
  WASD_DKS_ON: 0x09,
  WASD_DKS_SNAP_OFF: 0x0a,
  AD_SNAP_ON: 0x0b,
  AD_CANCEL_ON: 0x0c,
} as const

/** KEY p[8] / key_t.mode */
export const KEY_MODE = {
  MOD: 0,
  PROG: 1,
  MEDIA: 2,
  FN: 3,
  DKS: 4,
  SNAP: 5,
  CANCEL: 6,
  DISABLED: 0x10,
} as const
export type KeyMode = (typeof KEY_MODE)[keyof typeof KEY_MODE]

export const MAG_CAL = { START: 1, END: 2, CANCEL: 3, RESET: 4, REPORT: 0x11 } as const

export const ROWS = 5
export const COLS = 14

function hex(s: string): Uint8Array {
  return Uint8Array.from(s.trim().split(/\s+/), (x) => parseInt(x, 16))
}
