#!/usr/bin/env node
// Recompresses the bundled artwork in place.
//
// The frontend shipped 138 MB of images — a 1419x2468 PNG for an award badge
// that renders at about 100 px, and similar throughout. Tauri embeds the whole
// bundle into the binary, so every one of those megabytes landed in the APK
// twice, once per ABI.
//
// Filenames and extensions are preserved, so no import or CSS reference has to
// change. Only the pixels shrink.
//
//   node scripts/optimize-images.mjs [--check]

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["public", "src/assets"];

/** Wide enough for a 1080p TV backdrop; everything here renders far smaller. */
const MAX_EDGE = 1280;
/** Below this a re-encode rarely pays for itself. */
const MIN_BYTES = 40 * 1024;

const checkOnly = process.argv.includes("--check");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const targets = [];
for (const r of ROOTS) {
  const dir = join(ROOT, r);
  try {
    for (const f of walk(dir)) {
      if (![".png", ".jpg", ".jpeg"].includes(extname(f).toLowerCase())) continue;
      if (statSync(f).size < MIN_BYTES) continue;
      targets.push(f);
    }
  } catch {
    /* directory absent */
  }
}

let before = 0;
let after = 0;
let changed = 0;

for (const file of targets) {
  const original = statSync(file).size;
  before += original;
  try {
    const img = sharp(file, { limitInputPixels: false });
    const meta = await img.metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);

    let pipeline = img;
    if (longest > MAX_EDGE) {
      pipeline = pipeline.resize({
        width: meta.width >= meta.height ? MAX_EDGE : undefined,
        height: meta.height > meta.width ? MAX_EDGE : undefined,
        withoutEnlargement: true,
      });
    }

    const isPng = extname(file).toLowerCase() === ".png";
    const buf = await (isPng
      ? // Palette quantisation is where the win is on flat UI art; it keeps the
        // alpha channel these badges and avatars depend on.
        pipeline.png({ compressionLevel: 9, palette: true, quality: 82, effort: 8 })
      : pipeline.jpeg({ quality: 82, mozjpeg: true })
    ).toBuffer();

    // Never write a file that got bigger — some already-optimised assets do.
    if (buf.length < original) {
      if (!checkOnly) writeFileSync(file, buf);
      after += buf.length;
      changed++;
    } else {
      after += original;
    }
  } catch (e) {
    after += original;
    console.warn(`  skipped ${file}: ${e.message}`);
  }
}

const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(
  `${checkOnly ? "would rewrite" : "rewrote"} ${changed}/${targets.length} images: ` +
    `${mb(before)} MB -> ${mb(after)} MB (saved ${mb(before - after)} MB)`,
);
