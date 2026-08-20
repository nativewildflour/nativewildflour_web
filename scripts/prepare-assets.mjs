/**
 * One-time asset generation for Native WILDFlour.
 *
 * Source of truth: assets/logo.jpg (the only raster asset in this project).
 * Run with:  npm run prepare-assets
 *
 * Outputs (all committed to the repo):
 *   public/images/logo-256.png     256 x 256   square, white background
 *   public/images/logo-256.webp    256 x 256   square, white background (site header)
 *   public/images/logo-512.webp    512 x 512   square, white background
 *   public/images/logo-1024.webp  1024 x 1024  square, white background
 *   src/app/icon.png               512 x 512   app icon  -> served at /icon.png
 *   src/app/apple-icon.png         180 x 180   apple icon -> served at /apple-icon.png
 *   src/app/favicon.ico            16 + 32 px  PNG-in-ICO favicon -> served at /favicon.ico
 *   public/images/og-default.png  1200 x 630   social share card
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'assets', 'logo.jpg');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CREAM = '#FFF8EC';
const BARK = '#3B2A1A';
const WOOD = '#8B5A2B';

const p = (...parts) => path.join(ROOT, ...parts);

/** Square, contained on a white background — the logo art already sits on white. */
async function square(size, outFile, format) {
  const pipeline = sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: WHITE })
    .flatten({ background: WHITE });

  return format === 'webp'
    ? pipeline.webp({ quality: 82 }).toFile(outFile)
    : pipeline.png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(outFile);
}

/**
 * Build a .ico container holding PNG images (supported by every modern browser and
 * by Windows since Vista). Layout: ICONDIR (6 bytes) + N * ICONDIRENTRY (16 bytes) + PNG data.
 */
async function favicon(outFile, sizes) {
  const pngs = [];
  for (const size of sizes) {
    const buf = await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: WHITE })
      .flatten({ background: WHITE })
      .ensureAlpha()
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    pngs.push({ size, buf });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += buf.length;
  }
  await writeFile(outFile, Buffer.concat([header, ...entries, ...pngs.map((x) => x.buf)]));
}

/** Escape the few characters that are not legal as raw text inside an SVG document. */
function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function openGraphCard(outFile) {
  const W = 1200;
  const H = 630;

  // White rounded badge on the left, logo contained inside it.
  const badge = { x: 68, y: 95, size: 440, radius: 44 };
  const logoInset = 26;
  const logoSize = badge.size - logoInset * 2;

  // Text column to the right of the badge.
  const textX = badge.x + badge.size + 72;

  const title = escapeXml('Native WILDFlour');
  const subtitle = escapeXml('Authentic Alaskan Bannock · Skagway, Alaska');
  const font = 'Arial, Helvetica, Liberation Sans, DejaVu Sans, sans-serif';

  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="0" y="${H - 14}" width="${W}" height="14" fill="${WOOD}"/>
  <rect x="${badge.x + 6}" y="${badge.y + 10}" width="${badge.size}" height="${badge.size}" rx="${badge.radius}" fill="${BARK}" opacity="0.10"/>
  <rect x="${badge.x}" y="${badge.y}" width="${badge.size}" height="${badge.size}" rx="${badge.radius}" fill="#FFFFFF"/>
  <text x="${textX}" y="300" font-family="${font}" font-size="62" font-weight="700" fill="${BARK}">${title}</text>
  <text x="${textX}" y="356" font-family="${font}" font-size="27" font-weight="400" fill="${BARK}">${subtitle}</text>
</svg>`,
    'utf8',
  );

  const logo = await sharp(SOURCE)
    .resize(logoSize, logoSize, { fit: 'contain', background: WHITE })
    .flatten({ background: WHITE })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: logo, left: badge.x + logoInset, top: badge.y + logoInset }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(outFile);
}

async function main() {
  await mkdir(p('public', 'images'), { recursive: true });
  await mkdir(p('src', 'app'), { recursive: true });

  const outputs = [
    ['public/images/logo-256.png', () => square(256, p('public', 'images', 'logo-256.png'), 'png')],
    ['public/images/logo-256.webp', () => square(256, p('public', 'images', 'logo-256.webp'), 'webp')],
    ['public/images/logo-512.webp', () => square(512, p('public', 'images', 'logo-512.webp'), 'webp')],
    ['public/images/logo-1024.webp', () => square(1024, p('public', 'images', 'logo-1024.webp'), 'webp')],
    ['src/app/icon.png', () => square(512, p('src', 'app', 'icon.png'), 'png')],
    ['src/app/apple-icon.png', () => square(180, p('src', 'app', 'apple-icon.png'), 'png')],
    ['public/images/og-default.png', () => openGraphCard(p('public', 'images', 'og-default.png'))],
    ['src/app/favicon.ico', () => favicon(p('src', 'app', 'favicon.ico'), [16, 32])],
  ];

  for (const [label, run] of outputs) {
    await run();
    if (label.endsWith('.ico')) {
      console.log(`${label.padEnd(30)} ico ${(await stat(p(...label.split('/')))).size} bytes`);
      continue;
    }
    const meta = await sharp(p(...label.split('/'))).metadata();
    console.log(`${label.padEnd(30)} ${meta.width}x${meta.height} ${meta.format}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
