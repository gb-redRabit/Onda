#!/usr/bin/env node
/*
 * SPIKE - 123pan (123云盘) share: listowanie + próba URL pobierania. NIE zintegrowane.
 * Share publiczny (shareKey), opcjonalne hasło (?pwd= w linku lub --pwd).
 *   node scripts/123pan-spike.mjs "https://www.123pan.com/s/XXXX" [--pwd 1234] [--probe-mb N]
 */
const API = 'https://www.123pan.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const pi = args.indexOf('--pwd');
let pwd = pi >= 0 ? String(args[pi + 1] ?? '') : '';
const bi = args.indexOf('--probe-mb');
const probeMb = bi >= 0 ? Number(args[bi + 1]) || 0 : 0;
const log = (...x) => console.log(...x);
const fmt = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 2 : 0)} ${u[i]}`;
};
const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  Referer: `${API}/`
};
async function getJson(path, query = {}) {
  const u = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { headers: HEADERS });
  const t = await res.text();
  let d = null;
  try {
    d = t ? JSON.parse(t) : null;
  } catch {
    /* nie-JSON */
  }
  return { status: res.status, data: d, text: t };
}
async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const t = await res.text();
  let d = null;
  try {
    d = t ? JSON.parse(t) : null;
  } catch {
    /* nie-JSON */
  }
  return { status: res.status, data: d, text: t };
}
async function probe(direct) {
  const res = await fetch(direct, { headers: HEADERS, redirect: 'follow' });
  log(`upstream=${res.status} ct=${res.headers.get('content-type')}`);
  let got = 0;
  for await (const chunk of res.body) {
    got += chunk.length;
    if (got >= probeMb * 1024 * 1024) break;
  }
  log(`pobrano ${fmt(got)}`);
}
async function main() {
  if (!url) {
    console.error('Podaj link 123pan /s/...');
    process.exit(2);
  }
  const m = /\/s\/([^/?#]+)/.exec(url);
  if (!m) {
    console.error('Nie znaleziono shareKey w linku (/s/<key>).');
    process.exit(2);
  }
  const shareKey = m[1];
  if (!pwd) {
    try {
      pwd = new URL(url).searchParams.get('pwd') || '';
    } catch {
      /* brak */
    }
  }
  log(`shareKey=${shareKey} pwd=${pwd || '(brak)'}`);

  const list = await getJson('/api/share/get', { shareKey, sharePwd: pwd });
  const items = list.data?.data?.InfoList || list.data?.data?.infoList || [];
  log(`\n== list == status=${list.status} code=${list.data?.code} items=${items.length}`);
  for (const e of items) {
    const type = e.Type ?? e.fileType;
    const name = e.FileName ?? e.fileName;
    const size = e.Size ?? e.size;
    const id = e.FileId ?? e.fileId;
    log(
      `  ${type === 1 ? 'FOLDER' : 'FILE  '} ${name} — ${type === 1 ? '' : fmt(Number(size))} id=${id}`
    );
  }
  const file = items.find((e) => (e.Type ?? e.fileType) !== 1 && (e.FileId ?? e.fileId) != null);
  if (!file) {
    log('\nBrak pliku do pobrania.');
    return;
  }
  const fid = String(file.FileId ?? file.fileId);
  log(`\n== download info (id=${fid}) ==`);
  const dl = await postJson('/api/share/download/info', {
    shareKey,
    fileId: fid,
    sharePwd: pwd,
    DownloadType: '',
    etag: ''
  });
  const direct = dl.data?.data?.DownloadUrl || dl.data?.data?.downloadUrl;
  log(`status=${dl.status} code=${dl.data?.code} url=${direct ? 'OK' : '(brak)'}`);
  if (!direct) {
    log(JSON.stringify(dl.data).slice(0, 400));
    return;
  }
  log(`url: ${direct.slice(0, 120)}…`);
  if (probeMb > 0) await probe(direct);
}
main().catch((e) => {
  console.error('FATAL:', e?.stack || e);
  process.exit(1);
});
