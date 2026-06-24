// Rasterizes the IntelDoc "iD" brand mark (assets/pwa-icon-source.svg) into the
// PNG icon sizes the PWA manifest + apple-touch-icon reference. Run with:
//   node scripts/generate-pwa-icons.mjs
//
// Output (all square, written to public/):
//   pwa-192x192.png            — standard any-purpose icon
//   pwa-512x512.png            — standard any-purpose icon
//   maskable-512x512.png       — maskable variant (full-bleed navy field)
//   apple-touch-icon-180x180.png — iOS home-screen icon
//
// The source SVG already has a full-bleed navy field, so the maskable variant
// is the same render — its glyphs sit inside the central safe area, so platform
// masks (circle / squircle) never clip the "iD".

import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const SRC = resolve(root, 'assets/pwa-icon-source.svg')
const OUT_DIR = resolve(root, 'public')

// Navy brand field — matches background_color in the manifest.
const NAVY = '#0B1B3B'

const targets = [
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
  { file: 'maskable-512x512.png', size: 512 },
  { file: 'apple-touch-icon-180x180.png', size: 180 },
]

async function run() {
  await mkdir(OUT_DIR, { recursive: true })

  for (const { file, size } of targets) {
    const out = resolve(OUT_DIR, file)
    await sharp(SRC, { density: 384 })
      .resize(size, size, { fit: 'cover', background: NAVY })
      // Flatten onto navy so there is never a transparent edge (important for
      // the maskable variant and iOS, which does not honour transparency).
      .flatten({ background: NAVY })
      .png()
      .toFile(out)

    const meta = await sharp(out).metadata()
    const square = meta.width === size && meta.height === size
    console.log(
      `  ${file}  ${meta.width}x${meta.height}  ${square ? 'OK (square)' : 'NOT SQUARE!'}`,
    )
    if (!square) {
      throw new Error(`${file} is not ${size}x${size}`)
    }
  }
  console.log('PWA icons generated into public/.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
