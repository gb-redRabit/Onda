const ASS_HEADER =
  '[Script Info]\nTitle: Subtitles\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,45,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

export function hashContent(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export function extractAssFamilies(assContent: string): string[] {
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

export function hexToAssColor(hex: string): string {
  const clean = hex.replace(/^#/, '');
  const m = clean.match(/^[0-9a-f]{6}$/i);
  if (!m) return '';
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}&`;
}

export function htmlToAssTags(text: string): string {
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
  let ass = ASS_HEADER;

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
  let ass = ASS_HEADER;

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

export function convertToAss(track: { format: string; content?: string }): string {
  if (!track.content) return '';
  if (track.format === 'ass' || track.format === 'ssa') return track.content;
  if (track.format === 'srt') return srtToAss(track.content);
  if (track.format === 'vtt') return vttToAss(track.content);
  return srtToAss(track.content);
}
