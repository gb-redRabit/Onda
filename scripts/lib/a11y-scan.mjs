// Wspólna logika skanowania szablonów Vue dla `check:a11y.mjs`.
// Wydzielone, bo parsowanie znaczników jest subtelne: atrybuty mogą zawierać `>`
// (np. `:ref="(el) => ..."`), a komentarze HTML potrafią wspominać `<img>`.

/**
 * Znaczniki wraz z atrybutami. Skanujemy cudzysłowy, bo prosty `[^>]*` ucina
 * atrybuty zawierające `>` (np. `:ref="(el) => ..."`) i gubi ich treść.
 */
export function findTags(source, names) {
  const out = [];
  const pattern = new RegExp(`<(${names.join('|')})\\b`, 'g');
  let match;
  while ((match = pattern.exec(source))) {
    let index = match.index + match[0].length;
    let quote = null;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '>') break;
    }
    out.push({
      tag: match[1],
      attrs: source.slice(match.index + match[0].length, index),
      start: match.index,
      end: index + 1,
      selfClosing: /\/\s*$/.test(source.slice(match.index, index))
    });
  }
  return out;
}

/** Tylko szablon SFC, bez komentarzy: skrypty mogą zawierać stringi z `<img>` itp. */
export function templateOf(source) {
  const start = source.search(/^<template>\s*$/m);
  if (start < 0) return '';
  const end = source.lastIndexOf('</template>');
  if (end < start) return '';
  return source
    .slice(start, end)
    .replace(/^<template>\s*$/m, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** Tekst widoczny w przycisku (bez tagów; interpolacje to zwykle etykiety). */
export function visibleText(inner) {
  return inner
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' x ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Obrazek z niepustym `alt` wewnątrz przycisku daje mu nazwę. */
export function hasNamedImage(inner) {
  return findTags(inner, ['img']).some((tag) => /\s(?::|v-bind:)?alt="[^"]+"/.test(tag.attrs));
}

export function buttonHasName(attrs, inner) {
  // `aria-hidden` + tabindex -1 to celowo ukryte nakładki (np. play na hover).
  if (/aria-hidden="true"/.test(attrs)) return true;
  if (/aria-label=|aria-labelledby=/.test(attrs)) return true;
  if (visibleText(inner)) return true;
  if (hasNamedImage(inner)) return true;
  return /\s(?::|v-bind:)?title=/.test(attrs);
}

export function controlHasName(source, attrs, start, file) {
  // Wrappery `ui/*` i kontrolki z `v-bind="..."` dostają atrybuty (w tym
  // `aria-label`) od wywołującego — skan źródła tego nie zobaczy.
  if (/v-bind=/.test(attrs)) return true;
  if (file.replaceAll('\\', '/').includes('/components/ui/')) return true;
  if (/aria-hidden="true"/.test(attrs) || /type="hidden"/.test(attrs)) return true;
  if (/aria-label=|aria-labelledby=/.test(attrs)) return true;
  const id = /(?:^|\s)id="([^"]+)"/.exec(attrs)?.[1];
  if (id && new RegExp(`<label[^>]*\\bfor="${id}"`).test(source)) return true;
  const before = source.slice(0, start);
  if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) return true;
  return /\s(?::|v-bind:)?title=/.test(attrs);
}

/**
 * Zwraca naruszenia w jednym pliku. `source` to cała treść SFC.
 * Każda pozycja: { file, line }.
 */
export function scanSource(source, file) {
  const template = templateOf(source);
  const buttons = [];
  const controls = [];
  const withoutType = [];
  const images = [];
  const dialogs = [];

  const lineOf = (index) => template.slice(0, index).split('\n').length;

  for (const tag of findTags(template, ['button'])) {
    const line = lineOf(tag.start);
    if (!/(^|\s):?type=/.test(tag.attrs)) withoutType.push({ file, line });
    const close = tag.selfClosing ? tag.end : template.indexOf('</button>', tag.end);
    const inner = close < 0 ? '' : template.slice(tag.end, close);
    if (buttonHasName(tag.attrs, inner)) continue;
    buttons.push({ file, line });
  }
  for (const tag of findTags(template, ['input', 'select', 'textarea'])) {
    if (controlHasName(template, tag.attrs, tag.start, file)) continue;
    controls.push({ file, line: lineOf(tag.start) });
  }
  for (const tag of findTags(template, ['img'])) {
    if (/\s(?::|v-bind:)?alt=/.test(tag.attrs)) continue;
    images.push({ file, line: lineOf(tag.start) });
  }
  for (const tag of findTags(template, ['div', 'section', 'aside', 'form'])) {
    if (!/role="dialog"/.test(tag.attrs)) continue;
    if (/aria-label=|aria-labelledby=/.test(tag.attrs)) continue;
    dialogs.push({ file, line: lineOf(tag.start) });
  }

  return { buttons, controls, withoutType, images, dialogs };
}
