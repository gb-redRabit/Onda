import { app, session, type WebContents } from 'electron';
import { readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import https from 'https';
import { logger } from '../../shared/logger';
import { PREVIEW_PARTITION } from './preview-session';
import {
  parseFilterList,
  matchNetwork,
  cosmeticCssFor,
  scriptletsFor,
  hostOf,
  type FilterSet,
  type ScriptletRule
} from './adblock-filters';

// Własny ad-blocker dla osadzonych playerów — działa WYŁĄCZNIE w sesji podglądu
// Źródeł (`persist:onda-preview`), więc nie dotyka reszty aplikacji. Łączy wbudowane,
// kuratorowane reguły z pobranymi listami filtrów (oficjalne polskie filtry MajkiIT),
// parsowanymi przez minimalny silnik ABP (`adblock-filters.ts`). Wyłączany ustawieniem
// `appearance.previewAdblock`.

// Wbudowane reguły (działają nawet offline, zanim pobiorą się listy).
const BLOCK_PATTERNS: RegExp[] = [
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /googleadservices\.com/i,
  /adservice\.google\./i,
  /adnxs\.com/i,
  /adsrvr\.org/i,
  /amazon-adsystem\.com/i,
  /criteo\./i,
  /taboola\./i,
  /outbrain\./i,
  /popads\.net/i,
  /popcash\.net/i,
  /propellerads\.com/i,
  /onclickads\.net/i,
  /exoclick\.com/i,
  /juicyads\.com/i,
  /\/ads?\//i,
  /\/advert/i,
  /\/vast\b/i,
  /\/preroll/i,
  /\/popunder/i,
  /\/pagead\//i,
  /\/adserver/i
];

const COSMETIC_CSS = `
  [id^="ad-"], [id*="-ad-"], [id$="-ad"], [class^="ad-"], [class*=" ad-"], [class*="ads"],
  [id*="banner"], [class*="banner"], [class*="sponsor"], [id*="sponsor"],
  [class*="popup"], [class*="popunder"],
  iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="/ads/"],
  #aa_ad, #kolumnaSrodkowa #aa_ad, .screening-video-panorama, .screening-video,
  [id*="reklama" i], [class*="reklama" i], body > span[onclick]
    { display: none !important; }
`;

const SKIP_SCRIPT = `(() => {
  try { window.open = () => null; } catch (e) { void e; }
  const adPlaying = () => {
    if (!document.body) return false;
    if (/reklama|reklamy|advertisement|zobacz na/i.test(document.body.innerText || '')) return true;
    return !!document.querySelector(
      '[class*="preroll" i], [id*="preroll" i], [class*="advert" i], [id*="advert" i]'
    );
  };
  const tick = () => {
    const skip = document.querySelector(
      '.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern, ' +
      'button[class*="skip" i][class*="ad" i], [class*="skip" i][class*="ad" i]'
    );
    if (skip && typeof skip.click === 'function') { skip.click(); return; }
    document.querySelectorAll('.screening-video-panorama, #aa_ad').forEach((el) => {
      el.style.display = 'none';
    });
    const v = document.querySelector('video');
    if (!v) return;
    if (adPlaying() && isFinite(v.duration) && v.duration > 0 && v.duration < 150) {
      try {
        v.muted = true;
        v.playbackRate = 16;
        if (v.currentTime < v.duration - 0.5) v.currentTime = v.duration;
      } catch (e) { void e; }
    }
  };
  tick();
  setInterval(tick, 800);
  new MutationObserver(tick).observe(document.documentElement, {
    childList: true, subtree: true
  });
})();`;

// Oficjalne polskie filtry (MajkiIT) — zawierają reguły CDA/WP/Onet/Interia itd.
const FILTER_URLS = [
  'https://raw.githubusercontent.com/MajkiIT/polish-ads-filter/master/polish-adblock-filters/adblock_ublock.txt',
  'https://raw.githubusercontent.com/MajkiIT/polish-ads-filter/master/polish-adblock-filters/adblock.txt'
];
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FILTER_BYTES = 8 * 1024 * 1024;

let enabled = true;
let installed = false;
let listenerInstalled = false;
let filters: FilterSet = { network: [], cosmetic: [], scriptlets: [] };
let filtersLoaded = false;

export function isPreviewAdblockEnabled(): boolean {
  return enabled;
}

export function setPreviewAdblock(on: boolean): void {
  enabled = on;
}

function shouldBlock(url: string): boolean {
  return BLOCK_PATTERNS.some((re) => re.test(url));
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT_MS }, (res) => {
      if ((res.statusCode ?? 0) >= 300 && res.headers.location) {
        res.resume();
        resolve(fetchText(new URL(res.headers.location, url).toString()));
        return;
      }
      if ((res.statusCode ?? 0) !== 200) {
        res.resume();
        resolve('');
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size <= MAX_FILTER_BYTES) chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', () => resolve(''));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
    req.on('error', () => resolve(''));
  });
}

async function loadExternalFilters(): Promise<void> {
  if (filtersLoaded) return;
  filtersLoaded = true;
  const cachePath = join(app.getPath('userData'), 'adblock-cache.txt');
  try {
    const info = await stat(cachePath).catch(() => null);
    if (info && Date.now() - info.mtimeMs < CACHE_TTL_MS) {
      filters = parseFilterList(await readFile(cachePath, 'utf-8'));
      logger.info('preview', `adblock filters from cache (${filters.network.length} net rules)`);
      return;
    }
  } catch (e) {
    logger.warn('preview', 'adblock cache read failed', e);
  }
  try {
    const parts = await Promise.all(FILTER_URLS.map((u) => fetchText(u)));
    const text = parts.filter(Boolean).join('\n');
    if (text) {
      filters = parseFilterList(text);
      await writeFile(cachePath, text, 'utf-8');
      logger.info('preview', `adblock filters fetched (${filters.network.length} net rules)`);
    }
  } catch (e) {
    logger.warn('preview', 'adblock filters fetch failed (built-in rules only)', e);
  }
}

function scriptletScript(rules: ScriptletRule[]): string {
  const parts: string[] = [];
  for (const r of rules) {
    if (r.name === 'nowoif') {
      parts.push('try{window.open=()=>null;}catch(e){void e;}');
    } else if (r.name === 'set-constant' && r.args[0]) {
      const value = r.args[1] ?? 'undefined';
      parts.push(
        `try{Object.defineProperty(window,${JSON.stringify(r.args[0])},{get:()=>(${value}),set:()=>{}});}catch(e){void e;}`
      );
    }
  }
  return parts.join('\n');
}

function injectCosmetic(contents: WebContents): void {
  if (!enabled) return;
  const host = hostOf(contents.getURL());
  const css = `${COSMETIC_CSS}\n${cosmeticCssFor(filters, host)}`;
  const script = `${SKIP_SCRIPT}\n${scriptletScript(scriptletsFor(filters, host))}`;
  contents.insertCSS(css).catch(() => {
    // best-effort: brak CSS nie jest błędem.
  });
  contents.executeJavaScript(script, true).catch(() => {
    // best-effort: skrypt może zostać odrzucony przez CSP strony.
  });
}

/**
 * Instaluje ad-blocker dla sesji podglądu (idempotentnie). Sieć filtrujemy przez
 * `webRequest` (wbudowane wzorce + pobrane listy); kosmetykę i skryptlety wstrzykujemy
 * do osadzeń `<webview>`. Listy filtrów pobierane są w tle i cache'owane na dysku.
 */
export function installPreviewAdblock(): void {
  if (!installed) {
    installed = true;
    const ses = session.fromPartition(PREVIEW_PARTITION);
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (enabled && (shouldBlock(details.url) || matchesFilters(details))) {
        callback({ cancel: true });
        return;
      }
      callback({});
    });
    logger.info('preview', 'adblock installed (preview session only)');
  }

  if (!listenerInstalled) {
    listenerInstalled = true;
    app.on('web-contents-created', (_event, contents) => {
      contents.on('did-finish-load', () => {
        if (contents.getType() === 'webview') injectCosmetic(contents);
      });
    });
  }

  void loadExternalFilters();
}

function matchesFilters(details: {
  url: string;
  resourceType: string;
  initiator?: string;
}): boolean {
  if (!filters.network.length) return false;
  const initiatorHost = details.initiator ? hostOf(details.initiator) : '';
  return matchNetwork(filters, {
    url: details.url,
    initiatorHost,
    type: details.resourceType
  });
}
