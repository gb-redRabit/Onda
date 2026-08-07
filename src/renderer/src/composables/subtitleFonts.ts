import type { MkvFont } from '@renderer/types/subtitles';
import { extractAssFamilies, hashContent } from '@renderer/utils/subtitleConvert';
import { logger } from '@shared/logger';
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

export async function buildFontMap(
  assContent: string,
  attachmentNames: MkvFont[] = []
): Promise<Record<string, string>> {
  const cacheKey = `${hashContent(assContent)}-${attachmentNames.map((f) => f.name).join(',')}`;
  if (fontMapCache.has(cacheKey)) return fontMapCache.get(cacheKey)!;

  const fontMap: Record<string, string> = { ...availableFonts };
  const localKeys = new Set(Object.keys(availableFonts));

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

export function releaseFontBlobUrls(): void {
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
