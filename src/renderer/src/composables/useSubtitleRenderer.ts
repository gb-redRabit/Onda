import type { SubtitleTrack, MkvFont } from '@renderer/types/subtitles';
import { convertToAss, extractAssFamilies, hashContent } from '@renderer/utils/subtitleConvert';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import arialUrl from '/fonts/arial.ttf?url';
import arialBoldUrl from '/fonts/ArialBold.ttf?url';
import arialItalicUrl from '/fonts/ArialItalic.ttf?url';
import arialBoldItalicUrl from '/fonts/ArialBoldItalic.ttf?url';
import calibriUrl from '/fonts/Calibri.ttf?url';
import calibriBoldUrl from '/fonts/CalibriBold.ttf?url';
import calibriItalicUrl from '/fonts/CalibriItalic.ttf?url';
import timesNewRomanUrl from '/fonts/TimesNewRoman.ttf?url';
import tahomaUrl from '/fonts/Tahoma.ttf?url';
import tahomaBoldUrl from '/fonts/TahomaBold.ttf?url';
import trebuchetMsUrl from '/fonts/TrebuchetMS.ttf?url';
import trebuchetMsBoldUrl from '/fonts/TrebuchetMSBold.ttf?url';
import courierNewUrl from '/fonts/CourierNew.ttf?url';
import verdanaUrl from '/fonts/Verdana.ttf?url';
import verdanaBoldUrl from '/fonts/VerdanaBold.ttf?url';
import georgiaUrl from '/fonts/Georgia.ttf?url';
import comicSansMsUrl from '/fonts/ComicSansMS.ttf?url';
import segoeUiEmojiUrl from '/fonts/SegoeUIEmoji.ttf?url';
import { logger } from '@shared/logger';

const fontMapCache = new Map<string, Record<string, string>>();
const remoteFontCache = new Map<string, string>();

const availableFonts: Record<string, string> = {
  arial: arialUrl,
  'arial bold': arialBoldUrl,
  'arial italic': arialItalicUrl,
  'arial bold italic': arialBoldItalicUrl,
  calibri: calibriUrl,
  'calibri bold': calibriBoldUrl,
  'calibri italic': calibriItalicUrl,
  'times new roman': timesNewRomanUrl,
  tahoma: tahomaUrl,
  'tahoma bold': tahomaBoldUrl,
  'trebuchet ms': trebuchetMsUrl,
  'trebuchet ms bold': trebuchetMsBoldUrl,
  'courier new': courierNewUrl,
  verdana: verdanaUrl,
  'verdana bold': verdanaBoldUrl,
  georgia: georgiaUrl,
  'comic sans ms': comicSansMsUrl,
  'segoe ui emoji': segoeUiEmojiUrl
};

let JASSUBClass: typeof import('jassub').default | null = null;
let jassubInstance: InstanceType<typeof import('jassub').default> | null = null;
let videoEl: HTMLVideoElement | null = null;
let lastSubtitleData: {
  subContent: string;
  fonts: MkvFont[];
  availableFonts: Record<string, string>;
} | null = null;

async function loadRemoteVariant(
  fontMap: Record<string, string>,
  mapKey: string,
  postscript: string
): Promise<void> {
  if (fontMap[mapKey]) return;
  const cachedUrl = remoteFontCache.get(postscript);
  if (cachedUrl) {
    fontMap[mapKey] = cachedUrl;
    return;
  }
  try {
    const { queryRemoteFonts } = await import('lfa-ponyfill');
    const fonts = await queryRemoteFonts({ postscriptNames: [postscript] });
    if (!fonts.length) return;
    const blob = await fonts[0].blob();
    const url = URL.createObjectURL(blob);
    remoteFontCache.set(postscript, url);
    fontMap[mapKey] = url;
  } catch (e) {
    logger.error('Subtitles', 'failed to load font', mapKey, e);
  }
}

async function buildFontMap(
  assContent: string,
  attachmentNames: MkvFont[] = []
): Promise<Record<string, string>> {
  const cacheKey = `${hashContent(assContent)}-${attachmentNames.map((f) => f.name).join(',')}`;
  if (fontMapCache.has(cacheKey)) return fontMapCache.get(cacheKey)!;

  const fontMap: Record<string, string> = { ...availableFonts };
  const localKeys = new Set(Object.keys(availableFonts));

  // add embedded font data as blob URLs so jassub can use them
  for (const f of attachmentNames) {
    const key = f.name.toLowerCase();
    if (!fontMap[key]) {
      const blob = new Blob([new Uint8Array(f.data)], { type: 'font/ttf' });
      fontMap[key] = URL.createObjectURL(blob);
      logger.info('Subtitles', `added embedded font blob: ${f.name} (${f.data.length} bytes)`);
    }
  }

  const families = new Set<string>(extractAssFamilies(assContent));
  for (const f of attachmentNames) families.add(f.name);

  const local: string[] = [];
  const google: string[] = [];
  const missing: string[] = [];

  for (const family of families) {
    const key = family.toLowerCase();
    if (localKeys.has(key) || fontMap[key]) {
      local.push(family);
      continue;
    }

    const base = family.replace(/ /g, '-');
    const variants = [
      ['', base],
      [' bold', `${base}-Bold`],
      [' italic', `${base}-Italic`],
      [' bold italic', `${base}-BoldItalic`]
    ] as const;
    await Promise.all(
      variants.map(([suffix, post]) => loadRemoteVariant(fontMap, `${key}${suffix}`, post))
    );
    const loaded = variants.some(([suffix]) => fontMap[`${key}${suffix}`]);
    if (loaded) google.push(family);
    else missing.push(family);
  }

  logger.info(
    'Subtitles',
    `buildFontMap: local=${local.length} google=${google.length} missing=${missing.length} missingNames=[${missing.join(', ')}]`
  );
  fontMapCache.set(cacheKey, fontMap);
  return fontMap;
}

async function ensureJASSUB(): Promise<typeof import('jassub').default | null> {
  if (JASSUBClass) return JASSUBClass;
  try {
    const mod = await import('jassub');
    JASSUBClass = mod.default;
    return JASSUBClass;
  } catch (err) {
    logger.error('Subtitles', 'Failed to load JASSUB', err);
    return null;
  }
}

export function initSubtitleRenderer(video: HTMLVideoElement, _container?: HTMLElement): void {
  videoEl = video;
}

export async function loadSubtitleTrack(track: SubtitleTrack): Promise<void> {
  if (!videoEl) return;
  removeSubtitleTrack();
  const assContent = convertToAss(track);
  if (!assContent) return;

  const fontMap = await buildFontMap(assContent, track.fonts || []);
  logger.info(
    'Subtitles',
    `loadSubtitleTrack: format=${track.format} fonts=${(track.fonts || []).length} assLen=${assContent.length} fontMapKeys=${Object.keys(fontMap).length}`
  );

  const JASSUBCtor = await ensureJASSUB();
  if (!JASSUBCtor) {
    return;
  }

  const mkvFonts = (track.fonts || []).map((f) => new Uint8Array(f.data));
  logger.info(
    'Subtitles',
    `jassub fonts: ${mkvFonts.length} items, total=${mkvFonts.reduce((s, f) => s + f.length, 0)} bytes`
  );

  lastSubtitleData = {
    subContent: assContent,
    fonts: track.fonts || [],
    availableFonts: fontMap
  };

  try {
    jassubInstance = new JASSUBCtor({
      video: videoEl,
      subContent: assContent,
      workerUrl,
      wasmUrl,
      modernWasmUrl,
      queryFonts: false,
      fonts: mkvFonts,
      availableFonts: fontMap,
      defaultFont: 'arial'
    });

    await jassubInstance.ready;
  } catch (err) {
    logger.error('Subtitles', 'Failed to initialize JASSUB', err);
    jassubInstance = null;
  }
}

export function removeSubtitleTrack(): void {
  if (jassubInstance) {
    jassubInstance.destroy();
    jassubInstance = null;
  }
}

export function destroySubtitleRenderer(): void {
  removeSubtitleTrack();
  videoEl = null;
  const seen = new Set<string>();
  for (const [, fontMap] of fontMapCache) {
    for (const v of Object.values(fontMap)) {
      if (typeof v === 'string' && v.startsWith('blob:') && !seen.has(v)) {
        seen.add(v);
        URL.revokeObjectURL(v);
      }
    }
  }
  fontMapCache.clear();
  for (const v of remoteFontCache.values()) {
    URL.revokeObjectURL(v);
  }
  remoteFontCache.clear();
}

export function getLastSubtitleData(): {
  subContent: string;
  fonts: MkvFont[];
  availableFonts: Record<string, string>;
} | null {
  if (!lastSubtitleData) return null;
  const availableFonts: Record<string, string> = {};
  for (const [k, v] of Object.entries(lastSubtitleData.availableFonts)) {
    if (typeof v === 'string' && !v.startsWith('blob:')) availableFonts[k] = v;
  }
  const fonts: MkvFont[] = (lastSubtitleData.fonts || []).map((f) => ({
    name: f.name,
    ext: f.ext || 'ttf',
    data: Array.from(f.data || [])
  }));
  return {
    subContent: lastSubtitleData.subContent,
    fonts,
    availableFonts
  };
}

export async function preparePiPSubtitleData(videoPath: string): Promise<{
  subContent: string;
  fonts: MkvFont[];
  availableFonts: Record<string, string>;
} | null> {
  const embedded = (await window.api?.listEmbeddedSubtitles(videoPath)) ?? [];
  if (!embedded.length) return null;

  const target = embedded.find((s) => s.language === 'pol' || s.language === 'pl') || embedded[0];
  const [result, fonts] = await Promise.all([
    window.api?.extractEmbeddedSubtitle(videoPath, target.index) ?? Promise.resolve(null),
    window.api?.extractSubtitleFonts(videoPath) ?? Promise.resolve([])
  ]);
  if (!result) return null;

  const assContent = convertToAss({ format: result.format, content: result.content });
  if (!assContent) return null;

  const fontMap = await buildFontMap(assContent, fonts);

  const availableFonts: Record<string, string> = {};
  for (const [k, v] of Object.entries(fontMap)) {
    if (typeof v === 'string' && !v.startsWith('blob:')) availableFonts[k] = v;
  }
  const plainFonts: MkvFont[] = (fonts || []).map((f) => ({
    name: f.name,
    ext: f.ext || 'ttf',
    data: Array.from(f.data || [])
  }));
  return {
    subContent: assContent,
    fonts: plainFonts,
    availableFonts
  };
}
