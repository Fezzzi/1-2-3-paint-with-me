const LINEAR = new Float32Array(256)
for (let value = 0; value < 256; value += 1) {
  const channel = value / 255
  LINEAR[value] = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function rgbToOklab(r: number, g: number, b: number, out: Float32Array, offset: number): void {
  const lr = LINEAR[r] ?? 0
  const lg = LINEAR[g] ?? 0
  const lb = LINEAR[b] ?? 0
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  out[offset] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  out[offset + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  out[offset + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
}

function encodeChannel(value: number): number {
  const linear = Math.min(1, Math.max(0, value))
  const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(encoded * 255)))
}

export function oklabToRgb(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    encodeChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encodeChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encodeChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

export function oklabToHex(L: number, A: number, B: number): string {
  const [r, g, b] = oklabToRgb(L, A, B)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function flattenRgba(rgba: ArrayLike<number>, pixel: number): [number, number, number] {
  const offset = pixel * 4
  const alpha = (rgba[offset + 3] ?? 255) / 255
  const r = Math.round((rgba[offset] ?? 0) * alpha + 255 * (1 - alpha))
  const g = Math.round((rgba[offset + 1] ?? 0) * alpha + 255 * (1 - alpha))
  const b = Math.round((rgba[offset + 2] ?? 0) * alpha + 255 * (1 - alpha))
  return [r, g, b]
}

function parseHexChannels(hex: string): [number, number, number] {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  const value = match?.[1] ?? '000000'
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function formatHexChannels(channels: readonly number[]): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function nudgeHex(hex: string, attempt: number): string {
  const channels = parseHexChannels(hex)
  const room = channels.map((channel) => Math.min(channel, 255 - channel))
  let best = 0
  for (let index = 1; index < 3; index += 1) {
    if ((room[index] ?? 0) > (room[best] ?? 0)) best = index
  }
  const channel = (best + attempt) % 3
  const value = channels[channel] ?? 0
  const direction = value >= 128 ? -1 : 1
  let next = value + direction
  if (next < 0 || next > 255) next = value - direction
  channels[channel] = Math.max(0, Math.min(255, next))
  return formatHexChannels(channels)
}

/** Nudges the lighter of any 8-bit hex collision by one step in the channel with the most headroom. */
export function ensureDistinctHexes(colors: { L: number; hex: string }[]): void {
  for (let pass = 0; pass < 12; pass += 1) {
    const seen = new Map<string, number>()
    let collision = false
    for (let index = 0; index < colors.length; index += 1) {
      const color = colors[index]
      if (!color) continue
      const other = seen.get(color.hex)
      if (other === undefined) {
        seen.set(color.hex, index)
        continue
      }
      collision = true
      const otherColor = colors[other]
      const nudgeIndex =
        !otherColor || color.L > otherColor.L || (color.L === otherColor.L && index >= other) ? index : other
      const target = colors[nudgeIndex]
      if (!target) continue
      const previous = target.hex
      target.hex = nudgeHex(previous, pass)
      seen.delete(previous)
      seen.set(target.hex, nudgeIndex)
      if (nudgeIndex !== index) seen.set(color.hex, index)
    }
    if (!collision) return
  }
}

export function renderColorPreview(labelMap: Uint8Array, hexes: readonly string[], width: number, height: number): Uint8ClampedArray {
  const lut = hexes.map((hex) => parseHexChannels(hex))
  const rgba = new Uint8ClampedArray(width * height * 4)
  const pixels = width * height
  for (let index = 0; index < pixels; index += 1) {
    const color = lut[labelMap[index] ?? 0] ?? [0, 0, 0]
    const offset = index * 4
    rgba[offset] = color[0]
    rgba[offset + 1] = color[1]
    rgba[offset + 2] = color[2]
    rgba[offset + 3] = 255
  }
  return rgba
}
