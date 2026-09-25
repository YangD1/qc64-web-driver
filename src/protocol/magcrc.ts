// CRC the vendor driver sends after MAG_CFG writes (0xc9/0xca). The firmware only stores it
// (it never validates), so it is kept purely for compatibility with the vendor app.
//
// STM32 hardware CRC32: poly 0x04C11DB7, not reflected, fed 32-bit little-endian words.
// The driver's table is 5x14 records of 23 bytes, of which the 14-byte key config is known and
// the rest is constant, so CRC(state) = C0 ^ L(state). C0 was derived from a captured (state, CRC).

const POLY = 0x04c11db7
const C0 = 0x9b967f0f
const REC = 23
const MEM_LEN = 1612
const BASE = MEM_LEN - 1605

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i << 24
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ POLY : c << 1
    t[i] = c >>> 0
  }
  return t
})()

function stm32(buf: Uint8Array): number {
  let c = 0
  for (let i = 0; i < buf.length; i += 4)
    for (let j = 3; j >= 0; j--) c = (TABLE[((c >>> 24) ^ buf[i + j]) & 0xff] ^ (c << 8)) >>> 0
  return c
}

/** keys: 70 raw 14-byte mag_key_cfg structs, row-major (exactly the MAG_M1 readback section). */
export function magCrc(table: Uint8Array): number {
  const mem = new Uint8Array(MEM_LEN)
  for (let i = 0; i < 70; i++) mem.set(table.subarray(i * 14, i * 14 + 14), BASE + i * REC)
  return (C0 ^ stm32(mem)) >>> 0
}
