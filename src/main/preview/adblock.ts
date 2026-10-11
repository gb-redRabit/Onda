import { app, session, type WebContents } from 'electron';
import { logger } from '../../shared/logger';
import { PREVIEW_PARTITION } from './preview-session';

// Własny, lekki ad-blocker dla osadzonych playerów — działa WYŁĄCZNIE w sesji
// podglądu Źródeł (`persist:onda-preview`), więc nie dotyka reszty aplikacji.
// Świadomie bez zewnętrznych list (EasyList/uBlock) — kuratorowane reguły + kosmetyka
// + pomijanie reklam wideo. Można go wyłączyć ustawieniem `appearance.previewAdblock`.

// Wzorce żądań do zablokowania (domeny reklamowe/trackery + typowe ścieżki).
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

// Selektory kontenerów reklam (ukrywanie kosmetyczne). CDA (cda.pl / ebd.cda.pl)
// reklamuje się same-origin, więc oprócz generycznych dodajemy znane selektory CDA.
const COSMETIC_CSS = `
  [id^="ad-"], [id*="-ad-"], [id$="-ad"], [class^="ad-"], [class*=" ad-"], [class*="ads"],
  [id*="banner"], [class*="banner"], [class*="sponsor"], [id*="sponsor"],
  [class*="popup"], [class*="popunder"],
  iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="/ads/"],
  #aa_ad, #kolumnaSrodkowa #aa_ad, .screening-video-panorama, .screening-video,
  [id*="reklama" i], [class*="reklama" i], body > span[onclick]
    { display: none !important; }
`;

// Pomijanie reklam wideo: klika „Pomiń", ukrywa znane kontenery i dla niepomijalnych
// pre-rollów (np. CDA) szybko przewija i wycisza; neutralizuje też popupy (nowoif).
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

let enabled = true;
let installed = false;
let listenerInstalled = false;

export function isPreviewAdblockEnabled(): boolean {
  return enabled;
}

export function setPreviewAdblock(on: boolean): void {
  enabled = on;
}

function shouldBlock(url: string): boolean {
  return BLOCK_PATTERNS.some((re) => re.test(url));
}

function injectCosmetic(contents: WebContents): void {
  if (!enabled) return;
  contents.insertCSS(COSMETIC_CSS).catch(() => {
    // best-effort: brak CSS nie jest błędem.
  });
  contents.executeJavaScript(SKIP_SCRIPT, true).catch(() => {
    // best-effort: skrypt może zostać odrzucony przez CSP strony.
  });
}

/**
 * Instaluje ad-blocker dla sesji podglądu (idempotentnie). Sieć filtrujemy przez
 * `webRequest`; kosmetykę i pomijanie reklam wideo wstrzykujemy do osadzeń `<webview>`.
 */
export function installPreviewAdblock(): void {
  if (!installed) {
    installed = true;
    const ses = session.fromPartition(PREVIEW_PARTITION);
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (enabled && shouldBlock(details.url)) {
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
}
