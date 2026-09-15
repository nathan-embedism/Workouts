// Renders the app icons from one SVG source. Run with `npm run icons`.
import { writeFileSync, mkdirSync } from 'node:fs'
import sharp from 'sharp'

const bolt = (scale) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M300 60 L150 280 H240 L212 452 L366 226 H272 Z"
          fill="url(#bolt)" stroke="#eafdff" stroke-width="6" stroke-linejoin="round"/>
  </g>`

const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bolt" x1="120" y1="40" x2="400" y2="470" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#21e6ff"/>
      <stop offset="0.55" stop-color="#7ad7ff"/>
      <stop offset="1" stop-color="#ff2ea6"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="#21e6ff" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#05060c" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
  </defs>
  <rect width="512" height="512" fill="#05060c"/>
  <rect width="512" height="512" fill="url(#glow)"/>
  <g filter="url(#blur)" opacity="0.85">${bolt(scale)}</g>
  ${bolt(scale)}
</svg>`

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/favicon.svg', svg(1))

const targets = [
  ['public/icons/icon-192.png', 192, 1],
  ['public/icons/icon-512.png', 512, 1],
  // Maskable icons get cropped to a circle on Android — keep the bolt inside 80%.
  ['public/icons/maskable-512.png', 512, 0.68],
]

for (const [file, size, scale] of targets) {
  await sharp(Buffer.from(svg(scale))).resize(size, size).png().toFile(file)
  console.log('wrote', file)
}
