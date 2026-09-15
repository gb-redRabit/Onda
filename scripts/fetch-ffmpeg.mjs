// Fetches pinned FFmpeg + FFprobe binaries into `resources/ffmpeg/<platform>-<arch>/`
// for bundling into the packaged app (electron-builder `extraResources` copies the
// whole `resources/ffmpeg` folder into `process.resourcesPath/ffmpeg`).
//
// Versions, URLs and SHA-256 hashes live in `binaries.json` (single source, PR-only
// updates — never a mutable `latest` redirect). Keep them in sync with the runtime
// managed-FFmpeg entries in the same file (src/main/ipc/dependency-utils.ts).
//
// Usage:
//   node scripts/fetch-ffmpeg.mjs                    # current platform
//   node scripts/fetch-ffmpeg.mjs --platform win32
//   node scripts/fetch-ffmpeg.mjs --platform darwin --arch arm64
//   node scripts/fetch-ffmpeg.mjs --all              # every platform/arch
//   node scripts/fetch-ffmpeg.mjs --all --dry-run    # print resolved sources only
//
// Every download is verified against the pinned SHA-256 before it is extracted.

import { createWriteStream, mkdirSync, readdirSync, statSync } from 'fs';
import { mkdir, rm, readFile, copyFile } from 'fs/promises';
import { createHash } from 'crypto';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'resources', 'ffmpeg');

const DRY_RUN = process.argv.includes('--dry-run');

const MANIFEST = JSON.parse(await readFile(join(ROOT, 'binaries.json'), 'utf-8'));

// Bundled sources keyed by `<platform>-<arch>` (BtbN assets are pinned to a
// concrete `autobuild-…` tag in binaries.json; there is no mutable tag here).
const SOURCES = MANIFEST.ffmpeg.bundled;

// macOS ships ffprobe as a separate evermeet archive.
const PROBE_URLS = {};
const PROBE_SHA256 = {};
for (const [key, src] of Object.entries(SOURCES)) {
  if (src.probeUrl) {
    PROBE_URLS[key] = src.probeUrl;
    PROBE_SHA256[key] = src.probeSha256 ?? null;
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Onda-build/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        download(new URL(res.headers.location, url).toString(), dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function sha256(file) {
  const data = await readFile(file);
  return createHash('sha256').update(data).digest('hex');
}

async function verify(expectedSha, shaUrl, file) {
  if (expectedSha) {
    const actual = await sha256(file);
    if (expectedSha.toLowerCase() !== actual) {
      throw new Error(`checksum mismatch for ${basename(file)}`);
    }
    return;
  }
  if (!shaUrl) {
    console.warn(`no SHA-256 source for ${basename(file)} — trusting pinned immutable URL`);
    return;
  }
  const shaDest = join(OUT, `verify-${Date.now()}.sha256`);
  try {
    await download(shaUrl, shaDest);
    const manifest = await readFile(shaDest, 'utf-8');
    const expected = (manifest.match(/([0-9a-fA-F]{64})/) || [])[1];
    const actual = await sha256(file);
    if (!expected || expected.toLowerCase() !== actual) {
      throw new Error(`checksum mismatch for ${basename(file)}`);
    }
  } finally {
    await rm(shaDest, { force: true }).catch(() => {});
  }
}

async function extract(archive, dest, kind) {
  await mkdir(dest, { recursive: true });
  if (kind === 'zip') {
    if (process.platform === 'win32') {
      const psLiteral = (p) => p.replace(/'/g, "''");
      const r = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${psLiteral(archive)}' -DestinationPath '${psLiteral(dest)}' -Force`
        ],
        { stdio: 'inherit' }
      );
      if (r.status !== 0) throw new Error('Expand-Archive failed');
    } else {
      const r = spawnSync('unzip', ['-o', archive, '-d', dest], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('unzip failed');
    }
  } else {
    const r = spawnSync('tar', ['-xf', archive, '-C', dest], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('tar failed');
  }
}

// Recursively finds the first file named `name` under `root`.
function findFile(root, name) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (entry === name) return full;
    }
  }
  return null;
}

async function fetchFor(key) {
  const src = SOURCES[key];
  if (!src) {
    console.warn(`skip ${key}: no source configured`);
    return;
  }
  if (DRY_RUN) {
    console.log(`[dry-run] ${key}: ${src.url} sha256=${src.sha256 ?? '(none)'}`);
    if (PROBE_URLS[key]) console.log(`[dry-run] ${key}: probe ${PROBE_URLS[key]}`);
    return;
  }
  const destDir = join(OUT, key);
  const work = join(OUT, '.work');
  await mkdir(work, { recursive: true });
  const archive = join(work, `${key}.${src.kind.replace('.', '-')}`);
  console.log(`fetch ${key}: ${src.url}`);
  await rm(archive, { force: true }).catch(() => {});
  await download(src.url, archive);
  await verify(src.sha256, src.shaUrl, archive);
  const extractDir = join(work, key);
  await rm(extractDir, { recursive: true, force: true }).catch(() => {});
  await extract(archive, extractDir, src.kind);

  await rm(destDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(destDir, { recursive: true });
  const ffmpeg = await findFile(extractDir, src.ffmpeg);
  if (!ffmpeg) throw new Error(`ffmpeg not found for ${key}`);
  await copyFile(ffmpeg, join(destDir, src.ffmpeg));

  if (src.ffprobe) {
    const ffprobe = await findFile(extractDir, src.ffprobe);
    if (ffprobe) await copyFile(ffprobe, join(destDir, src.ffprobe));
  }
  // macOS ships ffprobe as a separate archive.
  if (PROBE_URLS[key]) {
    const probeArchive = join(work, `${key}-probe.zip`);
    await rm(probeArchive, { force: true }).catch(() => {});
    await download(PROBE_URLS[key], probeArchive);
    await verify(PROBE_SHA256[key] || null, null, probeArchive);
    await extract(probeArchive, extractDir, 'zip');
    const ffprobe = await findFile(extractDir, 'ffprobe');
    if (ffprobe) await copyFile(ffprobe, join(destDir, 'ffprobe'));
  }
  console.log(`done ${key}`);
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const platformIdx = args.indexOf('--platform');
  const archIdx = args.indexOf('--arch');
  const platform = platformIdx !== -1 ? args[platformIdx + 1] : process.platform;
  const arch = archIdx !== -1 ? args[archIdx + 1] : process.arch;

  mkdirSync(OUT, { recursive: true });
  if (all) {
    for (const key of Object.keys(SOURCES)) {
      try {
        await fetchFor(key);
      } catch (e) {
        console.error(`FAILED ${key}: ${e.message}`);
        process.exitCode = 1;
      }
    }
  } else {
    const key = `${platform}-${arch}`;
    try {
      await fetchFor(key);
    } catch (e) {
      console.error(`FAILED ${key}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  await rm(join(OUT, '.work'), { recursive: true, force: true }).catch(() => {});
}

main();
