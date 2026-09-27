/**
 * Generates the full BOBA icon set from apps/desktop/app-icon.svg (tiled app icon)
 * and apps/desktop/app-mark.svg (transparent mark).
 *
 * Run from the repo root: node generate-icons.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const iconDir = path.join(root, 'apps/desktop/src-tauri/icons');
const publicDir = path.join(root, 'apps/desktop/public');

const tile = fs.readFileSync(path.join(root, 'apps/desktop/app-icon.svg'), 'utf8');
const mark = fs.readFileSync(path.join(root, 'apps/desktop/app-mark.svg'), 'utf8');

const markSvg = fs.readFileSync(path.join(root, 'apps/desktop/app-mark.svg'), 'utf8');

/* Android adaptive icons keep only the centre 66/108 of the canvas, so the mark
   is re-centred and scaled to sit well inside the safe zone. */
const androidForeground = (size) => {
  const body = markSvg.replace(/^[\s\S]*?<defs>/, '<defs>').replace(/<\/svg>\s*$/, '');
  const k = 0.62;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(${(256 - 270 * k).toFixed(1)},${(256 - 256 * k).toFixed(1)}) scale(${k})">${body}</g></svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
};

const render = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

const emit = (file, buf) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
};

function buildIco(svg, sizes) {
  const images = sizes.map((s) => render(svg, s));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0);
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    entries.push(e);
  }

  return Buffer.concat([header, ...entries, ...images]);
}

function buildIcns(svg, chunks) {
  const parts = chunks.map(({ type, size }) => {
    const data = render(svg, size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });

  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

/* Windows / Tauri desktop */
const flat = {
  '32x32.png': 32,
  '128x128.png': 128,
  '128x128@2x.png': 256,
  'icon.png': 512,
  'Square30x30Logo.png': 30,
  'Square44x44Logo.png': 44,
  'Square71x71Logo.png': 71,
  'Square89x89Logo.png': 89,
  'Square107x107Logo.png': 107,
  'Square142x142Logo.png': 142,
  'Square150x150Logo.png': 150,
  'Square284x284Logo.png': 284,
  'Square310x310Logo.png': 310,
  'StoreLogo.png': 50,
};
for (const [name, size] of Object.entries(flat)) emit(path.join(iconDir, name), render(tile, size));
emit(path.join(iconDir, 'icon.ico'), buildIco(tile, [16, 32, 48, 64, 128, 256]));
emit(path.join(iconDir, 'icon.icns'), buildIcns(tile, [
  { type: 'ic04', size: 16 },
  { type: 'ic05', size: 32 },
  { type: 'ic06', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic11', size: 64 },
  { type: 'ic12', size: 128 },
  { type: 'ic13', size: 256 },
  { type: 'ic14', size: 512 },
]));

/* Web assets */
emit(path.join(publicDir, 'logo.png'), render(tile, 512));
emit(path.join(publicDir, 'logo-mark.svg'), mark);
emit(path.join(publicDir, 'favicon.ico'), buildIco(tile, [16, 32, 48]));

/* Android launcher: adaptive foreground is the mark on transparency, padded to 108dp */
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, k] of Object.entries(densities)) {
  const dir = path.join(iconDir, 'android', `mipmap-${name}`);
  emit(path.join(dir, 'ic_launcher.png'), render(tile, Math.round(48 * k)));
  emit(path.join(dir, 'ic_launcher_round.png'), render(tile, Math.round(48 * k)));
  emit(path.join(dir, 'ic_launcher_foreground.png'), androidForeground(Math.round(108 * k)));
}

/* iOS: opaque tiles only, no alpha */
const ios = {
  'AppIcon-20x20@2x.png': 40,
  'AppIcon-20x20@2x-1.png': 40,
  'AppIcon-20x20@3x.png': 60,
  'AppIcon-29x29@1x.png': 29,
  'AppIcon-29x29@2x.png': 58,
  'AppIcon-29x29@2x-1.png': 58,
  'AppIcon-29x29@3x.png': 87,
  'AppIcon-40x40@1x.png': 40,
  'AppIcon-40x40@2x.png': 80,
  'AppIcon-40x40@2x-1.png': 80,
  'AppIcon-40x40@3x.png': 120,
  'AppIcon-60x60@2x.png': 120,
  'AppIcon-60x60@3x.png': 180,
  'AppIcon-76x76@1x.png': 76,
  'AppIcon-76x76@2x.png': 152,
  'AppIcon-83.5x83.5@2x.png': 167,
  'AppIcon-512@2x.png': 1024,
};
for (const [name, size] of Object.entries(ios)) emit(path.join(iconDir, 'ios', name), render(tile, size));

console.log('BOBA icon set generated.');
