import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { brand } from '../src/brand.ts'

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')

function logo(inset: number): string {
  const scale = 1 - inset * 2
  const shift = inset * 64
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${brand.paper}"/>
  <g transform="translate(${shift} ${shift}) scale(${scale})">
    <polygon points="8,8 38,8 34,34 8,36" fill="${brand.orange}" stroke="${brand.paper}" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="38,8 56,8 56,30 34,34" fill="${brand.green}" stroke="${brand.paper}" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="8,36 34,34 56,30 56,56 8,56" fill="${brand.purple}" stroke="${brand.paper}" stroke-width="2.5" stroke-linejoin="round"/>
    <text x="22" y="22" fill="${brand.ink}" font-size="11" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central">1</text>
    <text x="46" y="20" fill="${brand.ink}" font-size="11" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central">2</text>
    <text x="30" y="46" fill="${brand.ink}" font-size="11" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central">3</text>
  </g>
</svg>`
}

await mkdir(outDir, { recursive: true })

async function writeIcon(name: string, size: number, inset: number) {
  await sharp(Buffer.from(logo(inset))).resize(size, size).png().toFile(resolve(outDir, name))
}

await writeIcon('icon-192.png', 192, 0)
await writeIcon('icon-512.png', 512, 0)
await writeIcon('icon-maskable-512.png', 512, 0.12)
await writeIcon('apple-touch-icon.png', 180, 0)
console.log(`wrote icons to ${outDir}`)
