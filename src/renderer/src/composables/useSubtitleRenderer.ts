import type { SubtitleTrack, MkvFont } from '@renderer/types/subtitles';
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
import { queryRemoteFonts } from 'lfa-ponyfill';
import { logger } from '@renderer/utils/logger';

const fontMapCache = new Map<string, any>();

function hashContent(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

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

function extractAssFamilies(assContent: string): string[] {
  const families = new Set<string>();
  const lines = assContent.split('\n');
  let inStyles = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[V4+ Styles]')) {
      inStyles = true;
      continue;
    }
    if (trimmed.startsWith('[')) {
      inStyles = false;
      continue;
    }
    if (!inStyles) continue;
    if (!trimmed.startsWith('Style:')) continue;
    const parts = trimmed.slice(6).split(',');
    if (parts.length >= 2) families.add(parts[1].trim());
  }
  return [...families];
}

async function loadRemoteVariant(
  fontMap: Record<string, Uint8Array | string>,
  mapKey: string,
  postscript: string
): Promise<void> {
  if (fontMap[mapKey]) return;
  try {
    const fonts = await queryRemoteFonts({ postscriptNames: [postscript] });
    if (!fonts.length) return;
    const blob = await fonts[0].blob();
    fontMap[mapKey] = URL.createObjectURL(blob);
  } catch (e) {
    logger.error('Subtitles', 'failed to load font', mapKey, e);
  }
}

async function buildFontMap(assContent: string, attachmentNames: MkvFont[] = []): Promise<any> {
  const cacheKey = `${hashContent(assContent)}-${attachmentNames.map((f) => f.name).join(',')}`;
  if (fontMapCache.has(cacheKey)) return fontMapCache.get(cacheKey);

  const fontMap: Record<string, any> = { ...availableFonts };
  const localKeys = new Set(Object.keys(availableFonts));

  const families = new Set<string>(extractAssFamilies(assContent));
  for (const f of attachmentNames) families.add(f.name);

  const local: string[] = [];
  const google: string[] = [];
  const missing: string[] = [];

  for (const family of families) {
    const key = family.toLowerCase();
    if (localKeys.has(key)) {
      local.push(family);
      continue;
    }

    const base = family.replace(/ /g, '-');
    let loaded = false;
    for (const [suffix, post] of [
      ['', base],
      [' bold', `${base}-Bold`],
      [' italic', `${base}-Italic`],
      [' bold italic', `${base}-BoldItalic`]
    ] as const) {
      const before = fontMap[`${key}${suffix}`];
      await loadRemoteVariant(fontMap, `${key}${suffix}`, post);
      if (!before && fontMap[`${key}${suffix}`]) loaded = true;
    }
    if (loaded) google.push(family);
    else missing.push(family);
  }

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

function hexToAssColor(hex: string): string {
  const m = hex.replace('#', '').match(/^[0-9a-f]{6}$/i);
  if (!m) return '';
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}&`;
}

function htmlToAssTags(text: string): string {
  let result = text;

  result = result.replace(/<i>([\s\S]*?)<\/i>/gi, '{\\i1}$1{\\i0}');
  result = result.replace(/<b>([\s\S]*?)<\/b>/gi, '{\\b1}$1{\\b0}');
  result = result.replace(/<u>([\s\S]*?)<\/u>/gi, '{\\u1}$1{\\u0}');
  result = result.replace(/<strong>([\s\S]*?)<\/strong>/gi, '{\\b1}$1{\\b0}');
  result = result.replace(/<em>([\s\S]*?)<\/em>/gi, '{\\i1}$1{\\i0}');

  result = result.replace(
    /<font\s+color=["']([^"']+)["'][^>]*>([\s\S]*?)<\/font>/gi,
    (_match, color: string, content: string) => {
      const assColor = hexToAssColor(color);
      return assColor ? `{\\c${assColor}}${content}` : content;
    }
  );

  result = result.replace(/<[^>]+>/g, '');

  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');
  result = result.replace(/&nbsp;/g, ' ');

  return result.trim();
}

function srtToAss(srt: string): string {
  let ass =
    '[Script Info]\nTitle: Subtitles\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,45,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  const blocks = srt.trim().replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const rawText = lines.slice(2).join('\n');
    const text = htmlToAssTags(rawText).replace(/\n/g, '\\N');
    const m = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!m) continue;
    const start = `${m[1]}:${m[2]}:${m[3]}.${m[4].slice(0, 2)}`;
    const end = `${m[5]}:${m[6]}:${m[7]}.${m[8].slice(0, 2)}`;
    if (!text) continue;
    ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }
  return ass;
}

function vttToAss(vtt: string): string {
  let ass =
    '[Script Info]\nTitle: Subtitles\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,45,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  const lines = vtt.trim().replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    if (
      lines[i].startsWith('WEBVTT') ||
      lines[i].startsWith('Kind:') ||
      lines[i].startsWith('Language:') ||
      lines[i].trim() === ''
    ) {
      i++;
      continue;
    }
    const line = lines[i];
    const m = line.match(
      /(\d{2}):(\d{2}):(\d{2})[.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.](\d{3})/
    );
    if (m) {
      const start = `${m[1]}:${m[2]}:${m[3]}.${m[4].slice(0, 2)}`;
      const end = `${m[5]}:${m[6]}:${m[7]}.${m[8].slice(0, 2)}`;
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i]);
        i++;
      }
      const rawText = textLines.join('\n');
      const text = htmlToAssTags(rawText).replace(/\n/g, '\\N');
      if (text) {
        ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
      }
    } else {
      i++;
    }
  }
  return ass;
}

function convertToAss(track: SubtitleTrack): string {
  if (!track.content) return '';
  if (track.format === 'ass' || track.format === 'ssa') return track.content;
  if (track.format === 'srt') return srtToAss(track.content);
  if (track.format === 'vtt') return vttToAss(track.content);
  return srtToAss(track.content);
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

  const JASSUBCtor = await ensureJASSUB();
  if (!JASSUBCtor) {
    return;
  }

  const mkvFonts = (track.fonts || []).map((f) => new Uint8Array(f.data));

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
}

export function getLastSubtitleData(): {
  subContent: string;
  fonts: MkvFont[];
  availableFonts: Record<string, string>;
} | null {
  if (!lastSubtitleData) return null;
  const availableFonts: Record<string, string> = {};
  for (const [k, v] of Object.entries(lastSubtitleData.availableFonts)) {
    if (!v.startsWith('blob:')) availableFonts[k] = v;
  }
  const plain = {
    subContent: lastSubtitleData.subContent,
    fonts: lastSubtitleData.fonts,
    availableFonts
  };
  return JSON.parse(JSON.stringify(plain));
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

  const assContent =
    result.format === 'ass' || result.format === 'ssa'
      ? result.content
      : result.format === 'srt'
        ? srtToAss(result.content)
        : result.format === 'vtt'
          ? vttToAss(result.content)
          : srtToAss(result.content);
  if (!assContent) return null;

  const fontMap = await buildFontMap(assContent, fonts);

  return JSON.parse(
    JSON.stringify({
      subContent: assContent,
      fonts,
      availableFonts: fontMap
    })
  );
}
