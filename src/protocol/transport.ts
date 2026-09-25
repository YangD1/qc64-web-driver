import { IN_KEY, OUT_KEY, PAYLOAD_LEN, REPORT_ID, USAGE, USAGE_PAGE } from './constants'
import { MODELS, VENDOR_ID, findModel, type Model } from './models'

/** Plain (decrypted) 20-byte payload, p[0] = HEAD. */
export type Packet = Uint8Array

/** Minimal link to a keyboard: the real WebHID device or the in-browser mock. */
export interface Transport {
  readonly name: string
  readonly model: Model
  send(plain: ArrayLike<number>): Promise<void>
  onPacket(cb: (p: Packet) => void): () => void
  close(): Promise<void>
}

export function encrypt(plain: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(PAYLOAD_LEN)
  p.set(Array.from(plain).slice(0, PAYLOAD_LEN))
  return p.map((b, i) => b ^ OUT_KEY[i])
}

export function decrypt(raw: Uint8Array): Packet {
  return raw.slice(0, PAYLOAD_LEN).map((b, i) => b ^ IN_KEY[i])
}

export const webHidSupported = () => typeof navigator !== 'undefined' && 'hid' in navigator

class HidTransport implements Transport {
  private readonly dev: HIDDevice
  readonly model: Model
  constructor(dev: HIDDevice, model: Model) {
    this.dev = dev
    this.model = model
  }
  get name() {
    return this.dev.productName || this.model.name
  }
  async send(plain: ArrayLike<number>) {
    await this.dev.sendReport(REPORT_ID, encrypt(plain))
  }
  onPacket(cb: (p: Packet) => void) {
    const h = (e: HIDInputReportEvent) =>
      cb(decrypt(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength)))
    this.dev.addEventListener('inputreport', h)
    return () => this.dev.removeEventListener('inputreport', h)
  }
  async close() {
    if (this.dev.opened) await this.dev.close()
  }
}

/**
 * MI_02 and MI_03 share usage page/usage and the browser hides interface numbers,
 * so open each matching collection and keep the one that answers DEV_INFO.
 */
async function probe(dev: HIDDevice, model: Model): Promise<HidTransport | null> {
  if (!dev.opened) await dev.open()
  const t = new HidTransport(dev, model)
  const ok = await new Promise<boolean>((resolve) => {
    const off = t.onPacket(() => {
      clearTimeout(timer)
      off()
      resolve(true)
    })
    const timer = setTimeout(() => {
      off()
      resolve(false)
    }, 500)
    t.send([0x10]).catch(() => {
      clearTimeout(timer)
      off()
      resolve(false)
    })
  })
  if (ok) return t
  await dev.close()
  return null
}

const isVendorIf = (d: HIDDevice) => d.collections.some((c) => c.usagePage === USAGE_PAGE && c.usage === USAGE)

async function pick(devs: HIDDevice[]): Promise<HidTransport | null> {
  for (const d of devs) {
    const model = findModel(d.vendorId, d.productId)
    if (!model || !isVendorIf(d)) continue
    try {
      const t = await probe(d, model)
      if (t) return t
    } catch {
      // busy / wrong collection: try the next one
    }
  }
  return null
}

/** A device the user picked that no registered model matches. Nothing was sent to it. */
export interface UnknownDevice {
  vid: number
  pid: number
  name: string
}

export type RequestResult = { transport: HidTransport } | { unknown: UnknownDevice } | null

const hex4 = (n: number) => n.toString(16).padStart(4, '0').toUpperCase()
export const usbId = (vid: number, pid: number) => `${hex4(vid)}:${hex4(pid)}`

/**
 * Shows the browser chooser. Known models are listed exactly; the whole vendor ID is listed
 * as well so other boards can at least be identified.
 */
export async function requestHid(): Promise<RequestResult> {
  const filters: HIDDeviceFilter[] = [
    ...MODELS.map((m) => ({ vendorId: m.vid, productId: m.pid, usagePage: USAGE_PAGE, usage: USAGE })),
    { vendorId: VENDOR_ID },
  ]
  const devs = await navigator.hid.requestDevice({ filters })
  if (!devs.length) return null
  const d = devs[0]
  if (!findModel(d.vendorId, d.productId)) return { unknown: { vid: d.vendorId, pid: d.productId, name: d.productName } }
  const transport = await pick(devs)
  return transport && { transport }
}

/** Reconnects to a previously granted device of a known model without a prompt. */
export async function reconnectHid(): Promise<HidTransport | null> {
  if (!webHidSupported()) return null
  return pick(await navigator.hid.getDevices())
}
