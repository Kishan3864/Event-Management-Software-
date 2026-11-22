// Post-build steps for the static export in ./out
// 1. Fix segment prefetch file names (Next.js writes them as nested folders when building on Windows,
//    but the browser requests flat names like /dashboard/__next.!KGFwcCk.dashboard.__PAGE__.txt).
// 2. Generate out/sw.js with a precache list of every exported file.
// Usage: node scripts/postbuild.mjs  (runs automatically after `npm run build`)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const outDir = path.join(root, "out");
if (!fs.existsSync(outDir)) {
  console.error("postbuild: ./out not found. Run `next build` first.");
  process.exit(1);
}

// ---------------------------------------------------------------- 1. flatten segment files
function walkDirs(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (e.name.startsWith("__next.")) cb(full);
    else walkDirs(full, cb);
  }
}
function filesIn(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesIn(full));
    else out.push(full);
  }
  return out;
}
let flattened = 0;
walkDirs(outDir, (segDir) => {
  const parent = path.dirname(segDir);
  const prefix = path.basename(segDir); // e.g. __next.!KGFwcCk
  for (const file of filesIn(segDir)) {
    const inner = path.relative(segDir, file).split(path.sep).join(".");
    const dest = path.join(parent, `${prefix}.${inner}`);
    if (!fs.existsSync(dest)) fs.copyFileSync(file, dest);
    flattened++;
  }
  fs.rmSync(segDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- 1b. install file for client links
// Served at /c/<name>/app.webmanifest (hosting rewrite). Its relative id and start_url resolve against that address,
// so every client's installed app is a separate app that opens that client's own login (/c/<name>/).
{
  const m = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.webmanifest"), "utf8"));
  const client = { ...m, id: "./", start_url: "./", scope: "/" };
  delete client.shortcuts;
  fs.writeFileSync(path.join(outDir, "client.webmanifest"), JSON.stringify(client, null, 2));
}

// ---------------------------------------------------------------- 1c. install file of the admin panel (admin address)
{
  const m = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.webmanifest"), "utf8"));
  const admin = {
    ...m,
    id: "/",
    start_url: "/login",
    scope: "/",
    name: `${m.name} Admin`,
    short_name: "THM Admin",
    description: "Admin panel: clients, logins and plans.",
    theme_color: "#1d4ed8",
    background_color: "#f3f6fb",
    icons: [
      { src: "/icons/admin-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/admin-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/admin-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  delete admin.shortcuts;
  fs.writeFileSync(path.join(outDir, "admin.webmanifest"), JSON.stringify(admin, null, 2));
}

// ---------------------------------------------------------------- 2. service worker
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
})(outDir);

const hash = crypto.createHash("sha256");
const urls = [];
let bytes = 0;
for (const full of files.sort()) {
  const rel = path.relative(outDir, full).split(path.sep).join("/");
  if (rel === "sw.js" || rel.endsWith(".map") || rel.startsWith(".")) continue;
  const buf = fs.readFileSync(full);
  bytes += buf.length;
  hash.update(rel);
  hash.update(buf);
  if (rel.endsWith(".html")) {
    let p = "/" + rel.slice(0, -5);
    if (p.endsWith("/index")) p = p.slice(0, -6);
    urls.push(p || "/");
  } else {
    urls.push("/" + rel);
  }
}

const version = hash.digest("hex").slice(0, 12);
const template = fs.readFileSync(path.join(root, "scripts", "sw-template.js"), "utf8");
const sw = template.replace("__SW_VERSION__", version).replace("__SW_PRECACHE__", JSON.stringify(urls));
fs.writeFileSync(path.join(outDir, "sw.js"), sw);
console.log(
  `postbuild: ${flattened} segment files fixed · service worker ${version} · ${urls.length} files · ${(bytes / 1024 / 1024).toFixed(2)} MB precached`
);
