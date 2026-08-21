/**
 * Generates the 1200x630 link-preview card.
 *
 * Batwa spreads person to person over WhatsApp, where a square app icon is
 * cropped to a small thumbnail. This is the landscape card unfurlers want.
 *
 * Composed as SVG and rasterised with resvg, using the real brand faces from
 * scripts/fonts. An earlier version plotted the letterforms by hand to avoid
 * a dependency and looked exactly like what it was.
 *
 * Usage: node scripts/make-og-card.mjs ./public
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
const FONTS = [
  join(here, 'fonts/BricolageGrotesque-Bold.ttf'),
  join(here, 'fonts/SchibstedGrotesk-Medium.ttf'),
]

// Brand palette as literals — an SVG handed to a rasteriser has no stylesheet.
const BG = '#f5f2e9'
const BRAND = '#2a473c'
const GOLD = '#e6a83e'
const ON = '#f4f1e4'
const SUB = '#68766a'

/** The coin mark, positioned and scaled into the card. */
function coin(cx, cy, r) {
  const s = r / 44
  return `
    <g transform="translate(${cx - r} ${cy - r}) scale(${s})">
      <circle cx="44" cy="44" r="40" fill="${BRAND}"/>
      <circle cx="44" cy="44" r="33" fill="none" stroke="${GOLD}"
              stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>
      <rect x="28" y="26" width="10" height="36" fill="${ON}"/>
      <path fill-rule="evenodd" fill="${ON}"
            d="M37 26 A15 8.8 0 0 1 37 43.6 Z M37 31.2 A7.5 3.6 0 0 1 37 38.4 Z"/>
      <path fill-rule="evenodd" fill="${ON}"
            d="M37 43.4 A17 9.6 0 0 1 37 62.6 Z M37 48.4 A9 4.6 0 0 1 37 57.6 Z"/>
    </g>`
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <!-- Brand band, so the card still reads as Batwa when cropped to a strip. -->
  <rect x="1060" y="0" width="140" height="630" fill="${BRAND}"/>

  ${coin(190, 315, 118)}

  <text x="360" y="268" font-family="Bricolage Grotesque" font-weight="700"
        font-size="96" letter-spacing="-3" fill="${BRAND}">batwa<tspan fill="${GOLD}">.</tspan></text>

  <text x="362" y="336" font-family="Schibsted Grotesk" font-weight="500"
        font-size="34" fill="${BRAND}">Your bank texts, kept as a ledger.</text>

  <text x="362" y="392" font-family="Schibsted Grotesk" font-weight="500"
        font-size="26" fill="${SUB}">Automatic PKR expense tracking from bank SMS.</text>

  <rect x="362" y="440" width="120" height="5" rx="2.5" fill="${GOLD}"/>

  <text x="362" y="504" font-family="Schibsted Grotesk" font-weight="500"
        font-size="24" fill="${SUB}">Meezan · UBL · Faysal · JazzCash · Easypaisa</text>
</svg>`

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Schibsted Grotesk' },
})
  .render()
  .asPng()

writeFileSync(`${process.argv[2] ?? './public'}/og-card.png`, png)
console.log('og-card.png written')
