/**
 * Generates the Batwa PWA icons — the M3 "Coin" mark — with zero dependencies:
 * raw RGBA composed by hand, then PNG-encoded via zlib.
 *
 * The B is drawn geometrically rather than as text because there is no font
 * engine here, and because a brand mark should not depend on a webfont
 * loading at all. The same geometry is mirrored in public/favicon.svg and in
 * src/components/BatwaLogo.tsx so all three are the identical shape.
 *
 * Usage: node scripts/make-icons.mjs ./public
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

// Brand palette, converted from the design's oklch to sRGB.
const BRAND = [42, 71, 60] // oklch(0.32 0.06 160)
const GOLD = [230, 168, 62] // oklch(0.78 0.15 75)
const ON = [244, 241, 228] // oklch(0.965 0.02 90)

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const inEllipse = (x, y, cx, cy, rx, ry) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

/**
 * Is (x, y) — in the design's 88-unit space — part of the letter B?
 * A stem plus two bowls, each bowl an ellipse with an elliptical counter.
 */
function inB(x, y) {
  if (x >= 28 && x <= 37 && y >= 26 && y <= 62) return true

  const upper =
    x >= 36.5 &&
    inEllipse(x, y, 37, 34.8, 15, 8.8) &&
    !inEllipse(x, y, 37, 34.8, 7.5, 3.6)
  if (upper) return true

  const lower =
    x >= 36.5 &&
    inEllipse(x, y, 37, 53, 17, 9.6) &&
    !inEllipse(x, y, 37, 53, 9, 4.6)
  return lower
}

/**
 * The milled edge: a dashed ring at r=33, dash 2 / gap 6 in path units,
 * matching stroke-dasharray="2 6" on the SVG.
 */
function inDashedRing(x, y) {
  const dx = x - 44
  const dy = y - 44
  const r = Math.hypot(dx, dy)
  if (Math.abs(r - 33) > 1.6) return false
  const arc = Math.atan2(dy, dx) * 33 // arc length along the ring
  return (((arc % 8) + 8) % 8) < 2.4
}

function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4)
  // Maskable icons are cropped to a circle by the launcher, so the artwork
  // shrinks into the safe zone and the brand fills the whole tile.
  const scale = size / 88
  const inset = maskable ? 0.78 : 1

  const at = (v) => 44 + (v - 44) / inset

  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      // Sample at the pixel centre, in 88-unit design space.
      const ux = at((pxi + 0.5) / scale)
      const uy = at((py + 0.5) / scale)

      let colour = null
      if (maskable) colour = BRAND
      if (Math.hypot(ux - 44, uy - 44) <= 40) colour = BRAND
      if (inDashedRing(ux, uy)) colour = GOLD
      if (inB(ux, uy)) colour = ON

      const o = (py * size + pxi) * 4
      if (colour) {
        px[o] = colour[0]
        px[o + 1] = colour[1]
        px[o + 2] = colour[2]
        px[o + 3] = 255
      }
    }
  }
  return png(size, px)
}

const out = process.argv[2] ?? './public'
writeFileSync(`${out}/pwa-192x192.png`, render(192, { maskable: false }))
writeFileSync(`${out}/pwa-512x512.png`, render(512, { maskable: false }))
writeFileSync(`${out}/pwa-maskable-512x512.png`, render(512, { maskable: true }))
console.log('Batwa icons written to', out)
