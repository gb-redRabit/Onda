import { VIDEO_EXTS } from '@shared/constants';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';

export interface CoverResult {
  type: 'video' | 'image' | null;
  data: string | null;
}

// Pobiera nieruchomą klatkę z lokalnego wideo przez ukryty `<video>` + canvas, serwowaną
// przez media server. Wydzielone z `stores/player-cover.ts` (plan 2.8).
//
// Klatka musi być rysowana dopiero, gdy dekoder ma gotową pikselową ramkę
// (`readyState >= HAVE_CURRENT_DATA`). Wcześniej `seeked` bywał emitowany przy samych
// metadanych i canvas dostawał czarny obraz — taki „czarny JPEG” trafiał do cache
// i okładka na Stronie głównej wyglądała jak brak okładki.

const DRAW_RETRY_LIMIT = 12;

export function captureVideoFrame(filePath: string): Promise<CoverResult> {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) return Promise.resolve({ type: null, data: null });

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // Element musi być w dokumencie: odłączony `<video>` w Chromium potrafi
    // zgłosić gotową klatkę, ale `drawImage` rysuje wtedy czarny prostokąt.
    video.style.cssText =
      'position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    video.src = toMediaServerUrl(filePath);

    let resolved = false;
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function done(result: CoverResult) {
      if (resolved) return;
      resolved = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearTimeout(timer);
      video.remove();
      resolve(result);
    }

    const timer = setTimeout(() => done({ type: null, data: null }), 15000);

    function draw(): void {
      if (resolved) return;
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        // Dekoder nie ma jeszcze klatki — czekaj zamiast rysować czarny prostokąt.
        if (retries >= DRAW_RETRY_LIMIT) {
          done({ type: null, data: null });
          return;
        }
        retries += 1;
        retryTimer = setTimeout(draw, 50);
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done({ type: null, data: null });
        ctx.drawImage(video, 0, 0);
        // Chromium potrafi oddać pierwszy `drawImage` po seeku jako czarny prostokąt,
        // mimo `readyState >= 2`. Sprawdzamy piksel i próbujemy ponownie.
        const probe = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1
        ).data;
        const isBlack = probe[0] === 0 && probe[1] === 0 && probe[2] === 0;
        if (isBlack && retries < 3) {
          retries += 1;
          retryTimer = setTimeout(draw, 120);
          return;
        }
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        done({ type: 'image', data: dataUrl });
      } catch {
        done({ type: null, data: null });
      }
    }

    video.onloadeddata = () => {
      const t = Math.min(1, video.duration || 1);
      video.currentTime = t > 0 ? t : 0.5;
    };

    video.onseeked = () => {
      retries = 0;
      draw();
    };

    // Plik bez możliwości seekowania (np. strumień) — spróbuj narysować to, co jest.
    video.oncanplay = () => {
      if (video.readyState >= 2) draw();
    };

    video.onerror = () => done({ type: null, data: null });
    video.onabort = () => done({ type: null, data: null });
  });
}
