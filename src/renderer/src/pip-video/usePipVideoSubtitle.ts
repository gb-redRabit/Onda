import { ref, onUnmounted } from 'vue';
import JASSUB from 'jassub';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import type { MkvFont } from '@renderer/types/subtitles';
import { logger } from '@shared/logger';
import { createJassub } from '@renderer/utils/jassub';

export interface PipSubtitleData {
  subContent: string;
  fonts: MkvFont[];
  availableFonts: Record<string, string>;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chars = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) chars[i] = String.fromCharCode(bytes[i]);
  return btoa(chars.join(''));
}

export function usePipVideoSubtitle(videoRef: { value: HTMLVideoElement | null }) {
  const subsVisible = ref(true);
  let jassub: InstanceType<typeof JASSUB> | null = null;  let lastSubtitleData: PipSubtitleData | null = null;
  let subtitleLoadSeq = 0;

  function destroyJassub(): void {
    if (jassub) {
      try {
        jassub.destroy();
      } catch {
        /* already broken */
      }
      jassub = null;
    }
  }

  async function loadSubtitle(data: PipSubtitleData) {
    const seq = ++subtitleLoadSeq;
    destroyJassub();
    try {
      const v = videoRef.value;
      if (!v) return;
      const fonts = data.fonts.map((f) => new Uint8Array(f.data));
      const [wasmData, modernWasmData] = await Promise.all([
        fetch(wasmUrl).then((r) => r.arrayBuffer()),
        fetch(modernWasmUrl).then((r) => r.arrayBuffer())
      ]);
      if (seq !== subtitleLoadSeq) return;
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
      if (seq !== subtitleLoadSeq) return;
      const instance = await createJassub(JASSUB, {
        video: v,
        subContent: data.subContent,
        fonts,
        availableFonts,
        queryFonts: false,
        wasmUrlOverride: wasmDataUrl,
        modernWasmUrlOverride: modernWasmDataUrl
      });
      if (seq !== subtitleLoadSeq) {
        try {
          instance.destroy();
        } catch {
          /* superseded */
        }
        return;
      }
      jassub = instance;
    } catch (err) {
      if (seq !== subtitleLoadSeq) return;
      logger.error('pip-video', 'JASSUB init failed – subtitles disabled', err);
      destroyJassub();
    }
  }

  function clearSubtitle() {
    subtitleLoadSeq++;
    destroyJassub();
  }

  function toggleSubtitles() {
    subsVisible.value = !subsVisible.value;
    if (subsVisible.value && lastSubtitleData) {
      loadSubtitle(lastSubtitleData);
    } else {
      clearSubtitle();
    }
  }

  function receiveSubtitle(data: PipSubtitleData | null) {
    lastSubtitleData = data;
    if (data && data.subContent && subsVisible.value) loadSubtitle(data);
    else clearSubtitle();
  }

  onUnmounted(() => {
    clearSubtitle();
  });

  return {
    subsVisible,
    toggleSubtitles,
    receiveSubtitle,
    clearSubtitle
  };
}
