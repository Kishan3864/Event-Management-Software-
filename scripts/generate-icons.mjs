// Generates the product icons (a tent on a maroon tile) and the web app manifest.
// The product name comes from .env.local (NEXT_PUBLIC_PRODUCT_NAME / NEXT_PUBLIC_PRODUCT_SHORT_NAME).
// Usage: npm run brand
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const outDir = path.join(root, "public", "icons");
fs.mkdirSync(outDir, { recursive: true });
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  /* optional */
}
const NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || "Tent House Manager";
const SHORT = process.env.NEXT_PUBLIC_PRODUCT_SHORT_NAME || "Tent Manager";

const BG_A = "#8F2346";
const BG_B = "#5A1029";
const FG_A = "#FFF6E5";
const FG_B = "#F1D49A";

// Tent artwork drawn on a 512 grid; `scale` shrinks it around the centre (maskable safe zone).
function tent(scale) {
  const s = (v) => 256 + (v - 256) * scale;
  const P = (x, y) => `${s(x).toFixed(1)} ${s(y).toFixed(1)}`;
  // Body with a door cut out (even-odd), flag pole + pennant, ground line
  const body = `M${P(256, 128)} L${P(412, 372)} L${P(100, 372)} Z M${P(256, 226)} L${P(312, 372)} L${P(200, 372)} Z`;
  const scallop = `M${P(134, 318)} Q${P(156, 340)} ${P(178, 318)} Q${P(200, 340)} ${P(222, 318)}`;
  const scallop2 = `M${P(290, 318)} Q${P(312, 340)} ${P(334, 318)} Q${P(356, 340)} ${P(378, 318)}`;
  const flag = `M${P(256, 128)} L${P(256, 76)} M${P(258, 78)} L${P(306, 92)} L${P(258, 106)} Z`;
  const ground = { x: s(84), y: s(380), w: 344 * scale, h: 16 * scale, r: 8 * scale };
  return `
  <path d="${body}" fill="url(#fg)" fill-rule="evenodd"/>
  <path d="${scallop} ${scallop2}" fill="none" stroke="#7A1F3D" stroke-opacity="0.35" stroke-width="${6 * scale}" stroke-linecap="round"/>
  <path d="${flag}" fill="url(#fg)" stroke="url(#fg)" stroke-width="${8 * scale}" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="${ground.x}" y="${ground.y}" width="${ground.w}" height="${ground.h}" rx="${ground.r}" fill="url(#fg)" opacity="0.9"/>`;
}

function svg(size, { scale, radiusRatio, ring }) {
  const r = 512 * radiusRatio;
  const ringEl = ring
    ? `<rect x="30" y="30" width="452" height="452" rx="${Math.max(0, r - 30)}" fill="none" stroke="url(#fg)" stroke-opacity="0.35" stroke-width="6"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG_A}"/>
      <stop offset="1" stop-color="${BG_B}"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FG_A}"/>
      <stop offset="1" stop-color="${FG_B}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.2" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${r}" fill="url(#glow)"/>
  ${ringEl}
  ${tent(scale)}
</svg>`;
}

async function png(name, size, opts) {
  const buf = await sharp(Buffer.from(svg(size, opts))).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(outDir, name), buf);
  return buf;
}

await png("icon-192.png", 192, { scale: 1, radiusRatio: 0.22, ring: true });
await png("icon-512.png", 512, { scale: 1, radiusRatio: 0.22, ring: true });
await png("maskable-512.png", 512, { scale: 0.78, radiusRatio: 0, ring: false });
await png("maskable-192.png", 192, { scale: 0.78, radiusRatio: 0, ring: false });
await png("apple-touch-icon.png", 180, { scale: 0.88, radiusRatio: 0, ring: false });
const fav32 = await png("favicon-32.png", 32, { scale: 1.08, radiusRatio: 0.22, ring: false });
await png("favicon-16.png", 16, { scale: 1.1, radiusRatio: 0.22, ring: false });
fs.writeFileSync(path.join(outDir, "monogram.svg"), svg(512, { scale: 1, radiusRatio: 0.22, ring: true }));

// favicon.ico with a single 32x32 PNG entry
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0);
entry.writeUInt8(32, 1);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(fav32.length, 8);
entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(root, "public", "favicon.ico"), Buffer.concat([header, entry, fav32]));

// Web app manifest
const manifest = {
  id: "/",
  name: NAME,
  short_name: SHORT,
  description: "Bookings, billing, payments and stock for tent houses, resorts and gardens.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#FAF7F4",
  theme_color: "#7A1F3D",
  lang: "en-IN",
  dir: "ltr",
  categories: ["business", "productivity"],
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [
    { name: "New Booking", short_name: "New", url: "/bookings/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    { name: "Calendar", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
  ],
};
fs.writeFileSync(path.join(root, "public", "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Icons and manifest written for "${NAME}"`);
