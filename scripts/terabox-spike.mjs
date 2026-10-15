#!/usr/bin/env node
/*
 * SPIKE — TeraBox share (listowanie + direct URL + pobranie). NIE zintegrowane z aplikacją.
 * Służy do WERYFIKACJI niepublicznego API TeraBox na Twoim linku (endpointy bywają kruche).
 *
 * Użycie:
 *   node scripts/terabox-spike.mjs "<terabox share url>" [--download] [--probe-mb N]
 *
 * Obsługiwane hosty: terabox.com, teraboxapp.com, 1024terabox.com, dubox.com,
 * freeterabox.com, momerybox.com, tibibox.com, 4funbox.com, mirrobox.com, nephobox.com.
 */

const APP_ID = '250528';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HOST_RE =
  /^https?:\/\/(?:www\.)?(?:terabox\.com|teraboxapp\.com|1024terabox\.com|dubox\.com|freeterabox\.com|momerybox\.com|tibibox\.com|4funbox\.com|mirrobox\.com|nephobox\.com)\//i;

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const download = args.includes('--download');
const probeIdx = args.indexOf('--probe-mb');
const probeMb = probeIdx >= 0 ? Number(args[probeIdx + 1]) || 0 : 0;

const log = (...x) => console.log(...x);
const fmt = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 2 : 0)} ${u[i]}`;
};

function headers(host) {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    Referer: `https://${host}/`
  };
}

async function getJson(u, host) {
  const res = await fetch(u, { headers: headers(host), redirect: 'follow' });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* nie-JSON */
  }
  return { status: res.status, data, text };
}

async function main() {
  if (!url || !HOST_RE.test(url)) {
    console.error('Podaj poprawny link TeraBox (np. https://www.terabox.com/s/XXXX).');
    process.exit(2);
  }
  const host = new URL(url).host;
  const m = /\/s\/([^/?#]+)/.exec(url);
  if (!m) {
    console.error('Nie znaleziono /s/<id> w URL.');
    process.exit(2);
  }
  const shorturl = m[1];
  log(`host=${host} shorturl=${shorturl}`);

  log('\n== shorturlinfo ==');
  const info = await getJson(
    `https://${host}/api/shorturlinfo?app_id=${APP_ID}&shorturl=${encodeURIComponent(shorturl)}&root=1&web=1`,
    host
  );
  log(
    `status=${info.status} errno=${info.data?.errno} sign=${info.data?.sign ? 'OK' : '(brak)'} timestamp=${info.data?.timestamp ?? '?'}`
  );
  const list = info.data?.list || [];
  log(`root list: ${list.length} pozycji`);
  for (const e of list) {
    const dir = e.isdir === 1 || e.isdir === '1';
    log(
      `  ${dir ? '📁' : '📄'} ${e.server_filename || e.filename} — ${dir ? '' : fmt(Number(e.size))}  fs_id=${e.fs_id} path=${e.path ?? ''}`
    );
  }
  const file = list.find((e) => !(e.isdir === 1 || e.isdir === '1') && e.fs_id);
  if (!file) {
    log('\nBrak pliku do rozwiązania (sam folder root lub pusto).');
    return;
  }

  log(`\n== download (fs_id=${file.fs_id}) ==`);
  const q = new URLSearchParams({
    app_id: APP_ID,
    web: '1',
    channel: 'dubox',
    clienttype: '0',
    sign: info.data?.sign ?? '',
    timestamp: String(info.data?.timestamp ?? ''),
    fidlist: `[${file.fs_id}]`
  });
  const dl = await getJson(`https://${host}/api/download?${q.toString()}`, host);
  log(`status=${dl.status}`);
  const dlink =
    typeof dl.data?.dlink === 'string'
      ? dl.data.dlink
      : Array.isArray(dl.data?.dlink)
        ? dl.data.dlink[0]?.dlink
        : null;
  if (!dlink) {
    log('BRAK dlink. Surowa odpowiedź:');
    log(JSON.stringify(dl.data).slice(0, 500));
    return;
  }
  log(`dlink: ${dlink.slice(0, 110)}…`);

  if (download || probeMb > 0) {
    log(`\n== pobieranie${probeMb ? ` (${probeMb} MB)` : ' (całość)'} ==`);
    const max = probeMb > 0 ? probeMb * 1024 * 1024 : Infinity;
    const res = await fetch(dlink, {
      headers: { 'User-Agent': UA, Referer: `https://${host}/` },
      redirect: 'follow'
    });
    log(
      `upstream=${res.status} ct=${res.headers.get('content-type')} len=${fmt(Number(res.headers.get('content-length')) || 0)}`
    );
    let got = 0;
    for await (const chunk of res.body) {
      got += chunk.length;
      if (got >= max) break;
    }
    log(`pobrano ${fmt(got)} ✔`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e?.stack || e);
  process.exit(1);
});
