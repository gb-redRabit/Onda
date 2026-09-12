// Fetches pinned FFmpeg + FFprobe binaries into `resources/ffmpeg/<platform>-<arch>/`
// for bundling into the packaged app (electron-builder `extraResources` copies the
// whole `resources/ffmpeg` folder into `process.resourcesPath/ffmpeg`).
//
// Usage:
//   node scripts/fetch-ffmpeg.mjs                    # current platform
//   node scripts/fetch-ffmpeg.mjs --platform win32
//   node scripts/fetch-ffmpeg.mjs --platform darwin --arch arm64
//   node scripts/fetch-ffmpeg.mjs --all              # every platform/arch
//
// Every download is verified against the upstream SHA-256 before it is extracted.
// Keep the versions below pinned; never point at a mutable `latest` redirect.

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

const FFMPEG_VERSION = '7.1';

// Stable, versioned download sources per platform. Bump the version together
// with the URLs below. (BtbN `latest` is deliberately avoided — it is mutable.)
const SOURCES = {
  'win32-x64': {
    url: `https://github.com/GyanD/codexffmpeg/releases/download/${FFMPEG_VERSION}/ffmpeg-${FFMPEG_VERSION}-essentials_build.zip`,
    // GyanD publishes no .sha256 assets, so the hash is pinned here instead
    // (computed from the 7.1 release asset, size 92100272). Bump alongside
    // the version/URL above; never point at a mutable `latest` redirect.
    sha256: 'fa7d4d7e795db0e2503f49f105f46ed5852386f0cfdd819899be3b65ebde24fc',
    kind: 'zip',
    ffmpeg: 'ffmpeg.exe',
    ffprobe: 'ffprobe.exe'
  },
  'win32-arm64': {
    url: `https://github.com/GyanD/codexffmpeg/releases/download/${FFMPEG_VERSION}/ffmpeg-${FFMPEG_VERSION}-essentials_build.zip`,
    // Same archive as win32-x64 until an upstream arm64 (win) build exists.
    sha256: 'fa7d4d7e795db0e2503f49f105f46ed5852386f0cfdd819899be3b65ebde24fc',
    kind: 'zip',
    ffmpeg: 'ffmpeg.exe',
    ffprobe: 'ffprobe.exe'
  },
  'darwin-arm64': {
    // Evermeet has no versioned `getrelease/<version>` path (it 404s); the
    // pinned release file is `ffmpeg-<version>.zip` (see /ffmpeg/info API).
    url: `https://evermeet.cx/ffmpeg/ffmpeg-${FFMPEG_VERSION}.zip`,
    // Evermeet publishes no .sha256 manifest (only gpg .sig), so the hash is
    // pinned here (computed from the 7.1 zip, size 25438013). Bump alongside
    // the version/URL above.
    sha256: '5a1303c7babaffff3c32c141ff49c7f44bd3b3b3e7dcea992fd7d04b6558ef43',
    kind: 'zip',
    ffmpeg: 'ffmpeg',
    ffprobe: null // fetched separately below
  },
  'darwin-x64': {
    // Same pinned evermeet release file as darwin-arm64 (see note above).
    url: `https://evermeet.cx/ffmpeg/ffmpeg-${FFMPEG_VERSION}.zip`,
    sha256: '5a1303c7babaffff3c32c141ff49c7f44bd3b3b3e7dcea992fd7d04b6558ef43',
    kind: 'zip',
    ffmpeg: 'ffmpeg',
    ffprobe: null
  },
  'linux-x64': {
    url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-${FFMPEG_VERSION}-amd64-static.tar.xz`,
    shaUrl: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-${FFMPEG_VERSION}-amd64-static.tar.xz.sha256`,
    kind: 'tar.xz',
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe'
  },
  'linux-arm64': {
    url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-${FFMPEG_VERSION}-arm64-static.tar.xz`,
    shaUrl: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-${FFMPEG_VERSION}-arm64-static.tar.xz.sha256`,
    kind: 'tar.xz',
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe'
  }
};

const PROBE_URLS = {
  'darwin-arm64': `https://evermeet.cx/ffmpeg/ffprobe-${FFMPEG_VERSION}.zip`,
  'darwin-x64': `https://evermeet.cx/ffmpeg/ffprobe-${FFMPEG_VERSION}.zip`
};
// Pinned SHA-256 of the ffprobe 7.1 zip (size 25376985); evermeet offers no
// .sha256 manifest, same as the ffmpeg entries above.
const PROBE_SHA256 = {
  'darwin-arm64': 'fc289c963346d7dc0891cbaed02ba270e8abec54df9259e22d59559018b25709',
  'darwin-x64': 'fc289c963346d7dc0891cbaed02ba270e8abec54df9259e22d59559018b25709'
};

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
