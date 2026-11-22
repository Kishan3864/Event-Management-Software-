// Icons of the admin panel (a shield on blue), so the owner's installed admin app never looks like a business app.
//   node scripts/generate-admin-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const outDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

function svg(size, { scale, radiusRatio }) {
  const r = 512 * radiusRatio;
  const t = (1 - scale) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="0" cy="0" r="1.3" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#3b82f6"/><stop offset="0.5" stop-color="#1d4ed8"/><stop offset="1" stop-color="#172554"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#g)"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <path d="M256 92 L392 144 V250 C392 334 334 398 256 428 C178 398 120 334 120 250 V144 Z" fill="#f8fafc"/>
    <path d="M256 128 L360 168 V250 C360 314 318 364 256 390 Z" fill="#bfd3fb"/>
    <path d="M200 262 L242 304 L318 220" fill="none" stroke="#1d4ed8" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const png = async (name, size, opts) =>
  fs.writeFileSync(path.join(outDir, name), await sharp(Buffer.from(svg(size, opts))).png({ compressionLevel: 9 }).toBuffer());

await png("admin-192.png", 192, { scale: 1, radiusRatio: 0.22 });
await png("admin-512.png", 512, { scale: 1, radiusRatio: 0.22 });
await png("admin-maskable-512.png", 512, { scale: 0.8, radiusRatio: 0 });
await png("admin-apple-touch-icon.png", 180, { scale: 0.9, radiusRatio: 0 });
await png("admin-favicon-32.png", 32, { scale: 1, radiusRatio: 0.22 });
await png("admin-favicon-16.png", 16, { scale: 1, radiusRatio: 0.22 });
console.log("admin icons written to public/icons");
