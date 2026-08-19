// Parsers for internet radio station files (.pls / .m3u / .m3u8 / .xspf) and
// direct stream URLs. Returns normalized { name, url } entries.
export interface ParsedRadioStation {
  name: string;
  url: string;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanUrl(raw: string): string {
  const t = raw.trim();
  try {
    const parsed = new URL(t);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

// PLS: ini-like [playlist] section with File1=/Title1= pairs (SHOUTcast,
// Icecast "listen.pls" files). Also tolerates unnumbered File=/Title= and a
// bare File line without [playlist].
export function parsePls(text: string): ParsedRadioStation[] {
  const out: ParsedRadioStation[] = [];
  const byNumber = new Map<number, { url?: string; title?: string }>();
  let hasNumbered = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('[') || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    const numMatch = key.match(/^(\w+)(\d+)$/);
    if (numMatch) {
      hasNumbered = true;
      const n = parseInt(numMatch[2]!, 10);
      const field = numMatch[1]!;
      if (!byNumber.has(n)) byNumber.set(n, {});
      if (field === 'file') byNumber.get(n)!.url = value;
      else if (field === 'title') byNumber.get(n)!.title = value;
    } else if (key === 'file' || key === 'title') {
      const prev = byNumber.get(-1) ?? {};
      byNumber.set(-1, key === 'file' ? { ...prev, url: value } : { ...prev, title: value });
    }
  }
  if (hasNumbered) {
    for (const n of [...byNumber.keys()].sort((a, b) => a - b)) {
      if (n < 0) continue;
      const entry = byNumber.get(n);
      if (entry?.url) {
        const url = cleanUrl(entry.url);
        if (url) out.push({ name: entry.title?.trim() || url, url });
      }
    }
  } else {
    const entry = byNumber.get(-1);
    if (entry?.url) {
      const url = cleanUrl(entry.url);
      if (url) out.push({ name: entry.title?.trim() || url, url });
    }
  }
  return out;
}

// M3U / M3U8: either plain URL-per-line or extended (#EXTM3U + #EXTINF:title
// followed by the URL). Tolerates comments and blank lines.
export function parseM3u(text: string): ParsedRadioStation[] {
  const out: ParsedRadioStation[] = [];
  let pendingTitle = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#EXTINF:')) {
        const comma = line.indexOf(',');
        pendingTitle = comma >= 0 ? line.slice(comma + 1).trim() : '';
      }
      continue;
    }
    const url = cleanUrl(line);
    if (url) out.push({ name: pendingTitle || url, url });
    pendingTitle = '';
  }
  return out;
}

// XSPF: XML with <track><location>URL</location><title>Name</title></track>.
export function parseXspf(text: string): ParsedRadioStation[] {
  const out: ParsedRadioStation[] = [];
  const trackRe = /<track\b[^>]*>([\s\S]*?)<\/track>/gi;
  for (const m of text.matchAll(trackRe)) {
    const body = m[1] ?? '';
    const loc = body.match(/<location\b[^>]*>([\s\S]*?)<\/location>/i)?.[1] ?? '';
    const title = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const url = cleanUrl(decodeXmlEntities(loc.trim()));
    if (url) out.push({ name: decodeXmlEntities(title.trim()) || url, url });
  }
  return out;
}

// A single direct stream URL (pasted by the user) with an optional name.
export function parseDirectUrl(raw: string): ParsedRadioStation | null {
  const url = cleanUrl(raw);
  if (!url) return null;
  return { name: url, url };
}

export function parseRadioFile(fileName: string, text: string): ParsedRadioStation[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pls')) return parsePls(text);
  if (lower.endsWith('.m3u') || lower.endsWith('.m3u8')) return parseM3u(text);
  if (lower.endsWith('.xspf')) return parseXspf(text);
  // Unknown extension: sniff by content.
  const trimmed = text.trimStart();
  if (trimmed.startsWith('[playlist]')) return parsePls(text);
  if (trimmed.startsWith('#EXTM3U')) return parseM3u(text);
  if (/<playlist[\s>]/i.test(trimmed)) return parseXspf(text);
  if (cleanUrl(trimmed)) return parseM3u(text);
  return [];
}