// Generates the NSIS installer bitmaps and the DMG background from build/icon.png.
// Run: node scripts/make-installer-bitmaps.mjs
//
// MUI2 requires BMP bitmaps with EXACT dimensions (warnings are errors):
//   - installerHeader / installerSidebar: 150x57 and 164x314.
// sharp cannot write BMP, so we render raw RGB with sharp and encode 24-bit BMP here.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const iconPath = join(buildDir, 'icon.png');

const BG = '#101018';
const BG_TOP = '#161622';
const BG_BOTTOM = '#0a0a11';
const ACCENT = '#605dff';
const FG = '#f4f4fb';
const MUTED = '#8b8b9e';
const FONT = 'Segoe UI, Arial, Helvetica, sans-serif';

function encodeBmp24(width, height, rgb) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const offBits = 14 + 40;
  const buf = Buffer.alloc(offBits + pixelDataSize);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(offBits, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive => bottom-up rows
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 3;
    let dst = offBits + y * rowSize;
    for (let x = 0; x < width; x++) {
      buf[dst++] = rgb[src + x * 3 + 2]; // B
      buf[dst++] = rgb[src + x * 3 + 1]; // G
      buf[dst++] = rgb[src + x * 3 + 0]; // R
    }
  }
  return buf;
}

async function render({ width, height, background, layers }) {
  const icon = readFileSync(iconPath);
  const composites = [];
  for (const layer of layers) {
    if (layer.type === 'icon') {
      const buf = await sharp(icon)
        .resize(layer.width, layer.height, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();
      composites.push({ input: buf, left: layer.x, top: layer.y });
    } else if (layer.type === 'svg') {
      composites.push({ input: Buffer.from(layer.svg), left: 0, top: 0 });
    } else if (layer.type === 'rect') {
      const rect = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${layer.fill}"/></svg>`;
      composites.push({ input: Buffer.from(rect), left: 0, top: 0 });
    }
  }
  const { data, info } = await sharp({ create: { width, height, channels: 3, background } })
    .composite(composites)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const text = (w, h, body) =>
  `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

async function writeBmp(outName, spec) {
  const { data, width, height } = await render(spec);
  writeFileSync(join(buildDir, outName), encodeBmp24(width, height, data));
  console.log(`wrote build/${outName} (${width}x${height}, ${(data.length / 1024) | 0} KiB raw)`);
}

async function main() {
  await writeBmp('installerHeader.bmp', {
    width: 150,
    height: 57,
    background: BG,
    layers: [
      { type: 'rect', x: 0, y: 0, w: 4, h: 57, fill: ACCENT },
      { type: 'icon', x: 14, y: 11, width: 34, height: 34 },
      {
        type: 'svg',
        svg: text(
          150,
          57,
          `<text x="56" y="36" font-family="${FONT}" font-size="19" font-weight="700" letter-spacing="3" fill="${FG}">ONDA</text>`
        )
      }
    ]
  });

  const sidebarLayers = (w, h) => [
    { type: 'rect', x: 0, y: 0, w, h: 4, fill: ACCENT },
    { type: 'icon', x: (w - 92) / 2, y: 92, width: 92, height: 92 },
    {
      type: 'svg',
      svg: text(
        w,
        h,
        `<text x="${w / 2}" y="228" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="700" letter-spacing="1" fill="${FG}">Onda</text>
         <text x="${w / 2}" y="250" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${MUTED}">media player</text>
         <line x1="${w / 2 - 26}" y1="266" x2="${w / 2 + 26}" y2="266" stroke="${ACCENT}" stroke-width="2"/>`
      )
    }
  ];

  const sidebarBg = { r: 0x16, g: 0x16, b: 0x22 };
  await writeBmp('installerSidebar.bmp', {
    width: 164,
    height: 314,
    background: sidebarBg,
    layers: sidebarLayers(164, 314)
  });
  await writeBmp('uninstallerSidebar.bmp', {
    width: 164,
    height: 314,
    background: sidebarBg,
    layers: sidebarLayers(164, 314)
  });

  const dmgW = 540;
  const dmgH = 380;
  await sharp({
    create: { width: dmgW, height: dmgH, channels: 4, background: BG_TOP }
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${dmgW}" height="${dmgH}" xmlns="http://www.w3.org/2000/svg">
             <defs>
               <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                 <stop offset="0" stop-color="${BG_TOP}"/>
                 <stop offset="1" stop-color="${BG_BOTTOM}"/>
               </linearGradient>
             </defs>
             <rect width="${dmgW}" height="${dmgH}" fill="url(#g)"/>
             <text x="${dmgW / 2}" y="238" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" letter-spacing="1" fill="${FG}">Onda</text>
             <text x="${dmgW / 2}" y="266" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${MUTED}">Drag Onda to Applications</text>
           </svg>`
        ),
        left: 0,
        top: 0
      },
      {
        input: await sharp(readFileSync(iconPath))
          .resize(120, 120, { fit: 'contain' })
          .png()
          .toBuffer(),
        left: (dmgW - 120) / 2,
        top: 78
      }
    ])
    .png()
    .toFile(join(buildDir, 'dmg-background.png'));
  console.log(`wrote build/dmg-background.png (${dmgW}x${dmgH})`);

  const pkgW = 620;
  const pkgH = 418;
  await sharp({ create: { width: pkgW, height: pkgH, channels: 4, background: BG_TOP } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${pkgW}" height="${pkgH}" xmlns="http://www.w3.org/2000/svg">
             <defs>
               <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                 <stop offset="0" stop-color="${BG_TOP}"/>
                 <stop offset="1" stop-color="${BG_BOTTOM}"/>
               </linearGradient>
             </defs>
             <rect width="${pkgW}" height="${pkgH}" fill="url(#pg)"/>
             <text x="${pkgW / 2}" y="300" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" letter-spacing="1" fill="${FG}">Onda</text>
             <text x="${pkgW / 2}" y="330" text-anchor="middle" font-family="${FONT}" font-size="14" fill="${MUTED}">media player</text>
             <line x1="${pkgW / 2 - 30}" y1="350" x2="${pkgW / 2 + 30}" y2="350" stroke="${ACCENT}" stroke-width="2"/>
           </svg>`
        ),
        left: 0,
        top: 0
      },
      {
        input: await sharp(readFileSync(iconPath))
          .resize(150, 150, { fit: 'contain' })
          .png()
          .toBuffer(),
        left: (pkgW - 150) / 2,
        top: 80
      }
    ])
    .png()
    .toFile(join(buildDir, 'pkg-background.png'));
  console.log(`wrote build/pkg-background.png (${pkgW}x${pkgH})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
