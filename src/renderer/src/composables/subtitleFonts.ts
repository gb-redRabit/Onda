import type { MkvFont } from '@renderer/types/subtitles';
import { extractAssFamilies, hashContent } from '@renderer/utils/subtitleConvert';
import { logger } from '@shared/logger';

// Czcionki napisów są rozwiązywane na żądanie zamiast dostarczać pliki czcionek:
//   1. rodzina wskazana przez napisy jest wyszukiwana przez ponyfill Local Font
//      Access — najpierw zainstalowane czcionki, Google Fonts jako fallback,
//   2. jeśli ta rodzina nie może zostać rozwiązana, popularne rodziny Windows/Office są
//      mapowane na ich wolne, metrycznie zgodne klony w Google Fonts
//      (Arial → Arimo, Calibri → Carlito, …), aby stare pliki napisów zachowały
//      zamierzony wygląd.
// Dołączanie oryginalnych czcionek Windows kosztowało 25 MB zastrzeżonych plików
// (Calibri/Arial/Segoe nie podlegają redystrybucji), co to całkowicie usuwa.
const FONT_ALIASES: Record<string, string> = {
  arial: 'Arimo',
  'arial black': 'Archivo Black',
  calibri: 'Carlito',
  cambria: 'Caladea',
  'comic sans ms': 'Comic Neue',
  'courier new': 'Cousine',
  georgia: 'Gelasio',
  'times new roman': 'Tinos',
  // Brak metrycznych klonów w Google Fonts — neutralny sans zapewnia czytelność tekstu.
  tahoma: 'Noto Sans',
  'trebuchet ms': 'Noto Sans',
  verdana: 'Noto Sans',
  'segoe ui emoji': 'Noto Emoji'
};

const VARIANT_SUFFIXES = [
  ['', ''],
  [' bold', '-Bold'],
  [' italic', '-Italic'],
  [' bold italic', '-BoldItalic']
] as const;

const fontMapCache = new Map<string, Record<string, string>>();
const remoteFontCache = new Map<string, string>();

type FontQuery = (options?: {
  postscriptNames?: string[];
}) => Promise<Array<{ blob: () => Promise<Blob> }>>;

// lfa-ponyfill dostarcza czysty JS bez deklaracji typów; opisujemy mały
// zakres, którego używamy (jeden uzasadniony cast na tej granicy).
let fontQuery: FontQuery | null = null;
async function loadFontQuery(): Promise<FontQuery> {
  if (fontQuery) return fontQuery;
  const mod = (await import('lfa-ponyfill')) as unknown as {
    default?: FontQuery;
    queryRemoteFonts?: FontQuery;
  };
  const fn = mod.default ?? mod.queryRemoteFonts;
  if (!fn) throw new Error('lfa-ponyfill: no font query export');
  fontQuery = fn;
  return fontQuery;
}

// Ładuje cztery warianty stylu `family` do `fontMap` pod `mapKey`
// (nazwa rodziny używana przez napisy), zwracając czy cokolwiek zostało rozwiązane.
async function loadFamilyVariants(
  fontMap: Record<string, string>,
  mapKey: string,
  family: string
): Promise<boolean> {
  const base = family.replace(/\s+/g, '-');
  const results = await Promise.all(
    VARIANT_SUFFIXES.map(async ([mapSuffix, psSuffix]) => {
      const key = `${mapKey}${mapSuffix}`;
      if (fontMap[key]) return true;
      const postscript = `${base}${psSuffix}`;
      const cached = remoteFontCache.get(postscript);
      if (cached) {
        fontMap[key] = cached;
        return true;
      }
      try {
        const queryFonts = await loadFontQuery();
        const fonts = await queryFonts({ postscriptNames: [postscript] });
        if (!fonts.length) return false;
        const url = URL.createObjectURL(await fonts[0].blob());
        remoteFontCache.set(postscript, url);
        fontMap[key] = url;
        return true;
      } catch (e) {
        logger.warn('Subtitles', `failed to load font ${postscript}`, e);
        return false;
      }
    })
  );
  return results.some(Boolean);
}

export async function buildFontMap(
  assContent: string,
  attachmentNames: MkvFont[] = []
): Promise<Record<string, string>> {
  const cacheKey = `${hashContent(assContent)}-${attachmentNames.map((f) => f.name).join(',')}`;
  if (fontMapCache.has(cacheKey)) return fontMapCache.get(cacheKey)!;

  const fontMap: Record<string, string> = {};

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

  const resolved: string[] = [];
  const aliased: string[] = [];
  const missing: string[] = [];

  for (const family of families) {
    const key = family.toLowerCase();
    if (fontMap[key]) {
      resolved.push(family);
      continue;
    }
    if (await loadFamilyVariants(fontMap, key, family)) {
      resolved.push(family);
      continue;
    }
    const alias = FONT_ALIASES[key];
    if (alias && (await loadFamilyVariants(fontMap, key, alias))) {
      aliased.push(`${family}→${alias}`);
      continue;
    }
    missing.push(family);
  }

  logger.info(
    'Subtitles',
    `buildFontMap: resolved=${resolved.length} alias=${aliased.length} missing=${missing.length} ` +
      `aliasedNames=[${aliased.join(', ')}] missingNames=[${missing.join(', ')}]`
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
