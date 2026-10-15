#!/usr/bin/env node
/*
 * SPIKE / TEST — NIE zintegrowane z aplikacją Onda.
 *
 * Cel: sprawdzić czy opłaca się dodać obsługę PikPak share linków do Onda.
 * Skrypt odpowiada na 3 pytania:
 *   1. Czy da się wylistować zawartość share (foldery → podfoldery → pliki + info)?
 *   2. Czy da się rozwiązać plik do bezpośredniego URL (web_content_link)?
 *   3. Czy da się pobrać cały plik wideo (i ile to trwa / jaki transfer)?
 *
 * Algorytm przeniesiony z działających implementacji (tryb anonimowy, bez logowania):
 *   - TeamBreakerr/gopeed-extension-pikpak (JS, no-login)
 *   - quan666/pikpakapi + alistgo/alist (pikpak_share)
 *
 * Przepływ: captcha/init (liczy captcha_sign) → share/detail (rekurencja+stronicowanie)
 *           → share/file_info (web_content_link) → HTTP GET z UA + Referer.
 *
 * Użycie:
 *   node scripts/pikpak-spike.mjs <shareUrl> [opcje]
 *
 * Opcje:
 *   --resolve                pobierz bezpośrednie URL-e dla wszystkich plików
 *   --download               pobierz cały wybrany plik wideo
 *   --probe-mb <N>           pobierz tylko pierwsze N MB (szybki test łączności)
 *   --index <N>              który plik wideo pobrać (0 = największy, domyślnie 0)
 *   --pass <kod>             hasło do share (pass_code)
 *   --host <com|net>         domena API (domyślnie com, fallback net)
 *   --out <dir>              katalog zapisu (domyślnie ./pikpak-spike-out)
 *   --max-files <N>          limit plików do rozwiązania URL (ochrona przed API)
 */

import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';

// ── Stałe klienta web PikPak ────────────────────────────────────────────────
const CLIENT_ID = 'YUMx5nI8ZU8Ap8pm';
const CLIENT_VERSION = '2.0.0';
const PACKAGE_NAME = 'mypikpak.com';
const ALGORITHMS = [
  'C9qPpZLN8ucRTaTiUMWYS9cQvWOE',
  '+r6CQVxjzJV6LCV',
  'F',
  'pFJRC',
  '9WXYIDGrwTCz2OiVlgZa90qpECPD6olt',
  '/750aCr4lm/Sly/c',
  'RB+DT/gZCrbV',
  '',
  'CyLsf7hdkIRxRm215hl',
  '7xHvLi2tOYP0Y92b',
  'ZGTXXxu8E/MIWaEDB+Sm/',
  '1UI3',
  'E7fP5Pfijd+7K+t6Tg/NhuLq0eEUVChpJSkrKxpO',
  'ihtqpG6FMt65+Xk+tWUH2',
  'NhXXU9rg4XXdzo7u5o'
];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
const VIDEO_EXT = /\.(mp4|mkv|mov|webm|avi|ts|m2ts|flv|wmv|m4v)$/i;

const HOST_SETS = {
  com: { api: 'api-drive.mypikpak.com', user: 'user.mypikpak.com' },
  net: { api: 'api-drive.mypikpak.net', user: 'user.mypikpak.net' }
};

// ── Argumenty CLI ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = {
    resolve: false,
    download: false,
    probeMb: 0,
    index: 0,
    pass: '',
    out: 'pikpak-spike-out',
    maxFiles: 60,
    maxDirs: 200,
    find: 3,
    subId: '',
    root: false,
    verbose: false,
    quiet: false,
    name: ''
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--resolve') a.resolve = true;
    else if (t === '--download') a.download = true;
    else if (t === '--quiet' || t === '-q') a.quiet = true;
    else if (t === '--name') a.name = String(argv[++i] ?? '');
    else if (t === '--verbose' || t === '-v') a.verbose = true;
    else if (t === '--probe-mb') a.probeMb = Number(argv[++i]) || 0;
    else if (t === '--index') a.index = Number(argv[++i]) || 0;
    else if (t === '--pass') a.pass = String(argv[++i] ?? '');
    else if (t === '--host') a.host = String(argv[++i] ?? '').toLowerCase();
    else if (t === '--out') a.out = String(argv[++i] ?? a.out);
    else if (t === '--max-files') a.maxFiles = Number(argv[++i]) || a.maxFiles;
    else if (t === '--max-dirs') a.maxDirs = Number(argv[++i]) || a.maxDirs;
    else if (t === '--find') a.find = Number(argv[++i]) || a.find;
    else if (t === '--sub-id') a.subId = String(argv[++i] ?? '');
    else if (t === '--root') a.root = true;
    else rest.push(t);
  }
  a.url = rest[0];
  return a;
}

// ── Narzędzia ───────────────────────────────────────────────────────────────
const md5hex = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtBytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / 1024 ** i).toFixed(i ? 2 : 0)} ${u[i]}`;
};
const log = (...x) => console.log(...x);
const hr = (t) => log(`\n${'─'.repeat(4)} ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

function captchaSign(deviceId, ts) {
  let s = CLIENT_ID + CLIENT_VERSION + PACKAGE_NAME + deviceId + ts;
  for (const algo of ALGORITHMS) s = md5hex(s + algo);
  return '1.' + s;
}

function parseShareUrl(rawUrl) {
  const m = /^https?:\/\/[^/]+(\/[^?#]*)/i.exec(rawUrl || '');
  if (!m) throw new Error(`Nieprawidłowy URL: ${rawUrl}`);
  const parts = m[1].split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 's')
    throw new Error(`To nie jest link PikPak /s/: ${rawUrl}`);
  return { shareId: parts[1], initialParentId: parts[2] || '' };
}

function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// ── Klient PikPak (anonimowy) ───────────────────────────────────────────────
class PikPak {
  constructor(hostKey) {
    this.host = HOST_SETS[hostKey] || HOST_SETS.com;
    this.deviceId = randomBytes(16).toString('hex');
    this.captchaToken = '';
    this.passCodeToken = '';
    this.stats = { req: 0, bytes: 0 };
  }

  headers() {
    return {
      'User-Agent': UA,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Client-ID': CLIENT_ID,
      'X-Device-ID': this.deviceId,
      'X-Captcha-Token': this.captchaToken || ''
    };
  }

  async httpJson({ url, method = 'GET', headers, body, timeoutMs = 30000 }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      this.stats.req++;
      const res = await fetch(url, {
        method,
        headers: headers || this.headers(),
        body,
        signal: ctrl.signal
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* nie-JSON */
      }
      return { status: res.status, ok: res.ok, text, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async refreshCaptcha(action) {
    const ts = String(Date.now());
    const body = {
      action,
      captcha_token: this.captchaToken || '',
      client_id: CLIENT_ID,
      device_id: this.deviceId,
      meta: {
        captcha_sign: captchaSign(this.deviceId, ts),
        client_version: CLIENT_VERSION,
        package_name: PACKAGE_NAME,
        timestamp: ts,
        user_id: ''
      },
      redirect_uri: 'xlaccsdk01://xbase.cloud/callback?state=harbor'
    };
    const r = await this.httpJson({
      url: `https://${this.host.user}/v1/shield/captcha/init?client_id=${CLIENT_ID}`,
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (!r.ok || !r.data?.captcha_token) {
      throw new Error(
        `captcha/init ${r.status}: ${r.data?.error_description || r.text.slice(0, 200)}`
      );
    }
    this.captchaToken = r.data.captcha_token;
  }

  // GET na API z automatycznym captcha + 1 retry po error_code 9 (captcha wygasła).
  async request(pathname, query) {
    const url = `https://${this.host.api}${pathname}${query ? `?${buildQuery(query)}` : ''}`;
    const action = `GET:${pathname}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!this.captchaToken) await this.refreshCaptcha(action);
      const r = await this.httpJson({ url, method: 'GET' });
      const code = r.data?.error_code;
      if (attempt < 3 && (code === 9 || code === 16)) {
        this.captchaToken = '';
        continue;
      }
      if (!r.data) throw new Error(`Brak JSON (${r.status}): ${r.text.slice(0, 200)}`);
      if (r.data.error_code) {
        throw new Error(
          `API ${r.data.error_code}: ${r.data.error_description || r.data.error || ''}`
        );
      }
      return r.data;
    }
    throw new Error('Nie udało się wykonać żądania (captcha).');
  }

  getShareInfo(shareId, passCode) {
    return this.request('/drive/v1/share', {
      share_id: shareId,
      pass_code: passCode || '',
      thumbnail_size: 'SIZE_LARGE',
      limit: '100'
    });
  }

  getShareDetail(shareId, parentId, pageToken) {
    return this.request('/drive/v1/share/detail', {
      share_id: shareId,
      parent_id: parentId || '',
      pass_code_token: this.passCodeToken || '',
      thumbnail_size: 'SIZE_LARGE',
      with_audit: 'true',
      limit: '100',
      page_token: pageToken || '',
      filters: '{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}'
    });
  }

  getFileInfo(shareId, fileId) {
    return this.request('/drive/v1/share/file_info', {
      share_id: shareId,
      file_id: fileId,
      pass_code_token: this.passCodeToken || ''
    });
  }
}

// ── Przeszukiwanie wszerz (BFS) — schodzi w foldery aż zbierze kilka plików ──
function pickDownloadUrl(fileInfo, preferTranscode = false) {
  if (!fileInfo) return '';
  const medias = fileInfo.medias || [];
  if (preferTranscode && medias[1]?.link?.url) return medias[1].link.url;
  return fileInfo.web_content_link || medias[0]?.link?.url || '';
}

async function walk(client, shareId, rootParentId, opts) {
  const ctx = {
    files: [],
    dirs: [],
    truncated: false,
    processed: 0,
    verbose: opts.verbose,
    match: null
  };
  const queue = [{ id: rootParentId, path: '', depth: 0 }];
  const nameLower = opts.matchName ? opts.matchName.toLowerCase() : '';
  while (queue.length && ctx.processed < opts.maxDirs) {
    const node = queue.shift();
    const subfolders = [];
    let pageToken = '';
    const seen = new Set();
    do {
      const resp = await client.getShareDetail(shareId, node.id, pageToken);
      if (resp.share_status && resp.share_status !== 'OK') {
        throw new Error(
          `share_status=${resp.share_status}${resp.share_status_text ? ` (${resp.share_status_text})` : ''}`
        );
      }
      for (const f of resp.files || []) {
        if (f.kind === 'drive#folder') {
          subfolders.push(f);
          ctx.dirs.push({ id: f.id, name: f.name, path: node.path, depth: node.depth + 1 });
        } else {
          const rec = { id: f.id, name: f.name, path: node.path, size: parseInt(f.size, 10) || 0 };
          ctx.files.push(rec);
          if (nameLower && !ctx.match && f.name.toLowerCase().includes(nameLower)) ctx.match = rec;
        }
      }
      if (opts.verbose) {
        log(
          `   … ${node.path || '(root)'} [lvl ${node.depth}]  →  ${subfolders.length} folderów, ` +
            `${(resp.files || []).length - subfolders.length} plików` +
            (resp.next_page_token ? '  (next page)' : '')
        );
      }
      const next = resp.next_page_token || '';
      if (next && seen.has(next)) break;
      seen.add(next);
      pageToken = next;
    } while (pageToken);
    ctx.processed++;
    if (ctx.match) break;
    for (const f of subfolders)
      queue.push({
        id: f.id,
        path: node.path ? `${node.path}/${f.name}` : f.name,
        depth: node.depth + 1
      });
    if (!nameLower && ctx.files.length >= opts.wantFiles) break;
  }
  ctx.truncated = queue.length > 0 && !ctx.match;
  return ctx;
}

// ── Pobieranie ──────────────────────────────────────────────────────────────
async function download(url, dest, { maxBytes = Infinity } = {}) {
  const ctrl = new AbortController();
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://mypikpak.com/' },
    redirect: 'follow',
    signal: ctrl.signal
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length')) || 0;
  log(`  Content-Type: ${res.headers.get('content-type') || '?'}`);
  log(`  Content-Length: ${total ? fmtBytes(total) : '(brak)'}`);
  const reader = res.body.getReader();
  const ws = createWriteStream(dest);
  let got = 0;
  let lastTick = Date.now();
  const started = Date.now();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!ws.write(Buffer.from(value))) await once(ws, 'drain');
      if (Date.now() - lastTick > 1000) {
        const secs = (Date.now() - started) / 1000;
        const pct = total ? ` (${((got / total) * 100).toFixed(1)}%)` : '';
        log(`  ↓ ${fmtBytes(got)}${pct} · ${fmtBytes((got / secs) | 0)}/s`);
        lastTick = Date.now();
      }
      if (got >= maxBytes) {
        ctrl.abort();
        break;
      }
    }
  } finally {
    await new Promise((r) => ws.end(r));
  }
  const secs = (Date.now() - started) / 1000;
  return { got, total, secs, avg: got / secs };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error(
      'Użycie: node scripts/pikpak-spike.mjs <shareUrl> [--download] [--probe-mb N] [--find N] [--index N] [--resolve] [--sub-id id] [--pass kod] [--host com|net] [--out dir]'
    );
    process.exit(2);
  }
  const parsed = parseShareUrl(args.url);
  const verdict = { list: false, resolve: false, download: false, note: '' };

  const hostOrder = args.host ? [args.host] : ['com', 'net'];
  let client;
  let lastErr = null;

  for (const hk of hostOrder) {
    client = new PikPak(hk);
    try {
      hr(`FAZA 1 — Rozwiązywanie share (host=${hk})`);
      log(`shareId=${parsed.shareId}  initialParentId=${parsed.initialParentId || '(brak)'}`);
      const t0 = Date.now();
      if (args.pass) {
        const info = await client.getShareInfo(parsed.shareId, args.pass);
        client.passCodeToken = info.pass_code_token || '';
        log(`pass_code_token: ${client.passCodeToken ? 'OK' : '(brak)'}`);
      } else {
        log('Bez hasła — tryb anonimowy (pass_code_token="").');
      }

      hr('FAZA 2 — Zawartość linku (przeszukiwanie wszerz)');
      const startId = args.subId || '';
      if (startId) log(`Punkt startowy (--sub-id): ${startId}`);
      else log('Punkt startowy: korzeń share (segmenty URL to tylko ścieżka wyświetlania).');
      if (args.name) log(`Szukam pliku zawierającego: "${args.name}" …`);
      const ctx = await walk(client, parsed.shareId, startId, {
        maxDirs: args.maxDirs,
        wantFiles: args.find,
        matchName: args.name,
        verbose: args.verbose
      });
      if (args.name && !ctx.match)
        log(`✖ Nie znaleziono "${args.name}" w ${ctx.processed} folderach (zwiększ --max-dirs).`);
      if (ctx.truncated)
        log(
          `(Zatrzymano po ${ctx.processed} folderach / ${ctx.files.length} plikach — użyj --max-dirs / --find, aby iść dalej.)`
        );

      // Foldery (pogrupowane, z wcięciem po głębokości)
      const dirsByPath = new Map();
      for (const d of ctx.dirs) {
        const key = d.path ? `${d.path}/${d.name}` : d.name;
        if (!dirsByPath.has(key)) dirsByPath.set(key, d);
      }
      if (!args.quiet && dirsByPath.size) {
        log(`\nFoldery (${dirsByPath.size}):`);
        for (const [key, d] of [...dirsByPath.entries()].sort()) {
          log(`${'   '.repeat(Math.max(0, d.depth - 1))}📁 ${key}`);
        }
      }

      // Pliki pogrupowane po katalogu
      const filesByDir = new Map();
      for (const f of ctx.files) {
        const key = f.path || '(root)';
        if (!filesByDir.has(key)) filesByDir.set(key, []);
        filesByDir.get(key).push(f);
      }
      if (!args.quiet && ctx.files.length) {
        log(`\nPliki (${ctx.files.length}):`);
        for (const [dir, list] of [...filesByDir.entries()].sort()) {
          log(`📂 ${dir}`);
          for (const f of list.sort((a, b) => b.size - a.size))
            log(`   • ${f.name}  —  ${fmtBytes(f.size)}`);
        }
      }
      const totalSize = ctx.files.reduce((s, f) => s + f.size, 0);
      log('');
      log(
        `Podsumowanie linku: ${dirsByPath.size} folderów, ${ctx.files.length} plików, ${fmtBytes(totalSize)} w widocznym zakresie.`
      );
      log(`✔ Listowanie OK (${Date.now() - t0} ms, ${client.stats.req} żądań API)`);
      if (!ctx.files.length && !dirsByPath.size) {
        verdict.note = 'Share zwrócił 0 pozycji (możliwy PROHIBITED / hasło / pusta zawartość).';
        break;
      }
      verdict.list = true;

      // Wybór pliku do pobrania (--name = znaleziony po nazwie; domyślnie NAJWIĘKSZY wideo)
      const videos = ctx.files
        .filter((f) => VIDEO_EXT.test(f.name))
        .sort((a, b) => b.size - a.size);
      const pool = videos.length ? videos : [...ctx.files].sort((a, b) => b.size - a.size);
      const target = args.name ? ctx.match : pool[Math.min(args.index, pool.length - 1)];
      if (!target) {
        verdict.note = args.name
          ? `Nie znaleziono pliku "${args.name}".`
          : 'W widocznym zakresie nie ma plików do pobrania — zwiększ --max-dirs.';
        break;
      }
      log(`\nWybrany plik do testu pobrania: ${target.name} (${fmtBytes(target.size)})`);
      log(`   ścieżka: ${target.path || '(root)'}`);

      hr('FAZA 3 — Rozwiązywanie bezpośredniego URL (web_content_link)');
      const toResolve = args.resolve ? ctx.files.slice(0, args.maxFiles) : [target];
      for (const f of toResolve) {
        try {
          const info = await client.getFileInfo(parsed.shareId, f.id);
          const fi = info.file_info || info;
          const u = pickDownloadUrl(fi);
          f.url = u;
          if (u) verdict.resolve = true;
          if (f === target)
            log(`  ${u ? '✔' : '✖'} ${f.name}${u ? ` → ${u.slice(0, 110)}…` : ' (brak URL)'}`);
        } catch (e) {
          f.url = '';
          if (f === target) log(`  ✖ ${f.name} → błąd: ${e.message}`);
        }
        await sleep(150);
      }
      if (args.resolve)
        log(
          `  Rozwiązano URL dla ${toResolve.filter((f) => f.url).length}/${toResolve.length} plików`
        );
      if (!target.url) {
        verdict.note =
          'Nie udało się rozwiązać URL. Prawdopodobnie: blokada IP (PROHIBITED), wymagane konto, albo share tylko do zapisu (zip).';
        break;
      }

      if (args.download || args.probeMb > 0) {
        const maxBytes = args.probeMb > 0 ? args.probeMb * 1024 * 1024 : Infinity;
        hr(
          `FAZA 4 — Pobieranie ${maxBytes === Infinity ? 'CAŁEGO pliku' : 'próbki'}: ${target.name}`
        );
        await mkdir(args.out, { recursive: true });
        const dest = path.join(args.out, target.name.replace(/[<>:"/\\|?*]/g, '_'));
        log(`Zapis do: ${path.resolve(dest)}`);
        if (maxBytes !== Infinity) log(`Tryb PROBE — maksymalnie ${fmtBytes(maxBytes)}`);
        const res = await download(target.url, dest, { maxBytes });
        log('');
        const expected = res.total || target.size;
        const ok = res.got >= expected * 0.98;
        log(
          `✔ Pobrano ${fmtBytes(res.got)} / ${fmtBytes(expected)} w ${res.secs.toFixed(1)} s · średnio ${fmtBytes(res.avg | 0)}/s`
        );
        verdict.download = ok;
      } else {
        log(
          '\n(Pominięto pobieranie — dodaj --download, aby pobrać CAŁY plik, lub --probe-mb N dla szybkiego testu.)'
        );
      }
      break; // sukces na tym hoście
    } catch (e) {
      lastErr = e;
      log(`✖ Host ${hk}: ${e.message}`);
      if (hk !== hostOrder[hostOrder.length - 1]) log('Fallback na drugi host…');
    }
  }

  hr('PODSUMOWANIE');
  const mark = (b) => (b ? 'TAK' : 'NIE');
  log(`  1. Listowanie zawartości : ${mark(verdict.list)}`);
  log(`  2. Bezpośredni URL pliku : ${mark(verdict.resolve)}`);
  log(
    `  3. Pobranie całego pliku : ${args.download || args.probeMb > 0 ? mark(verdict.download) : 'nie testowano'}`
  );
  if (verdict.note) log(`  Uwaga: ${verdict.note}`);
  if (lastErr && !verdict.list) log(`  Ostatni błąd: ${lastErr.message}`);
  log('');
}

main().catch((e) => {
  console.error('\nFATAL:', e?.stack || e);
  process.exit(1);
});
