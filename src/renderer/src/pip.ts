import JASSUB from 'jassub';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import workerUrl from 'jassub/dist/worker/worker.js?url';
import type { MkvFont } from '@renderer/types/subtitles';

const STYLE = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #000; height: 100%; overflow: hidden; font-family: sans-serif; }
#wrap { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; }
#pipV { flex: 1; width: 100%; object-fit: contain; background: #000; }
#close { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 12px; background: rgba(0,0,0,0.6); border: none; color: #aaa; font: 12px sans-serif; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: all .15s; opacity: 0; }
#close:hover { background: rgba(229,62,62,0.9); color: #fff; }
#barW { height: 4px; background: rgba(255,255,255,0.15); cursor: pointer; flex-shrink: 0; }
#barF { height: 100%; background: #7c6aef; width: 0%; pointer-events: none; border-radius: 0 2px 2px 0; }
#curT { position: absolute; bottom: 8px; left: 8px; font: 10px monospace; color: rgba(255,255,255,0.5); pointer-events: none; }
#durT { position: absolute; bottom: 8px; right: 8px; font: 10px monospace; color: rgba(255,255,255,0.5); pointer-events: none; }
`;

interface PipSubtitleData {
  subContent: string;
  fonts: MkvFont[];
  availableFonts: Record<string, string>;
}

async function main() {
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  const v = document.getElementById('pipV') as HTMLVideoElement;
  v.crossOrigin = 'anonymous';
  const barF = document.getElementById('barF') as HTMLDivElement;
  const barW = document.getElementById('barW') as HTMLDivElement;
  const curT = document.getElementById('curT') as HTMLSpanElement;
  const durT = document.getElementById('durT') as HTMLSpanElement;

  const fmt = (t: number) => {
    if (!t || !isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  let pendingStart = 0;
  let waitingForPlay = false;

  v.onloadedmetadata = () => {
    durT.textContent = fmt(v.duration);
    if (pendingStart > 0) {
      v.currentTime = pendingStart;
    }
    if (!waitingForPlay) {
      v.play().catch(() => {});
    }
  };

  v.ontimeupdate = () => {
    barF.style.width = (v.duration ? (v.currentTime / v.duration) * 100 : 0) + '%';
    curT.textContent = fmt(v.currentTime);
  };

  v.onended = () => {
    window.api.send('pip:ended');
  };

  barW.onclick = (e) => {
    const r = barW.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };

  const closeBtn = document.getElementById('close') as HTMLButtonElement;
  closeBtn.onmouseover = function () {
    closeBtn.style.background = 'rgba(229,62,62,0.9)';
    closeBtn.style.color = '#fff';
  };
  closeBtn.onmouseout = function () {
    closeBtn.style.background = 'rgba(0,0,0,0.6)';
    closeBtn.style.color = '#aaa';
  };
  closeBtn.onclick = () => {
    window.api.send('pip:hidden');
  };
  const wrap = document.getElementById('wrap') as HTMLDivElement;
  wrap.onmouseenter = () => (closeBtn.style.opacity = '1');
  wrap.onmouseleave = () => (closeBtn.style.opacity = '0');

  window.api.on('pip:videoSrc', (...args: unknown[]) => {
    const { src, start } = args[0] as { src: string; start: number };
    pendingStart = start || 0;
    waitingForPlay = true;
    v.src = src;
  });

  window.api.on('pip:play', (...args: unknown[]) => {
    const startTime = args[0] as number;
    waitingForPlay = false;
    if (startTime > 0) v.currentTime = startTime;
    v.play().catch(() => {});
  });

  window.api.on('pip:requestTime', () => {
    window.api.send('pip:timeUpdate', v.currentTime || 0);
  });

  window.api.on('pip:pause', () => {
    v.pause();
  });

  window.api.on('pip:clear', () => {
    clearSubtitle();
    waitingForPlay = false;
    v.pause();
    v.removeAttribute('src');
    v.load();
  });

  let jassub: any = null;

  async function loadSubtitle(data: PipSubtitleData) {
    try {
      if (jassub) {
        jassub.destroy();
        jassub = null;
      }
      const fonts = data.fonts.map((f) => new Uint8Array(f.data));
      const [wasmData, modernWasmData] = await Promise.all([
        fetch(wasmUrl).then((r) => r.arrayBuffer()),
        fetch(modernWasmUrl).then((r) => r.arrayBuffer())
      ]);
      const wasmDataUrl = 'data:application/wasm;base64,' + uint8ToBase64(new Uint8Array(wasmData));
      const modernWasmDataUrl =
        'data:application/wasm;base64,' + uint8ToBase64(new Uint8Array(modernWasmData));
      const availableFonts: Record<string, string> = {};
      for (const [k, val] of Object.entries(data.availableFonts)) {
        try {
          availableFonts[k] = new URL(val, document.baseURI).href;
        } catch {
          availableFonts[k] = val;
        }
      }
      jassub = new JASSUB({
        video: v,
        subContent: data.subContent,
        workerUrl,
        wasmUrl: wasmDataUrl,
        modernWasmUrl: modernWasmDataUrl,
        queryFonts: 'localandremote',
        fonts,
        availableFonts,
        defaultFont: 'arial'
      });
      await jassub.ready;
    } catch {}
  }

  function clearSubtitle() {
    if (jassub) {
      jassub.destroy();
      jassub = null;
    }
  }

  function uint8ToBase64(bytes: Uint8Array): string {
    const chars = new Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) chars[i] = String.fromCharCode(bytes[i]);
    return btoa(chars.join(''));
  }

  window.api.on('pip:subtitle', (...args: unknown[]) => {
    const data = args[0] as PipSubtitleData | null;
    if (data && data.subContent) loadSubtitle(data);
    else clearSubtitle();
  });

  window.api.on('pip:clearSubtitle', () => clearSubtitle());
}

main();
