import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Strażnik a11y i poprawności formularzy:
//  - przycisk z samą ikoną musi mieć nazwę dostępną,
//  - surowa kontrolka formularza musi mieć nazwę (aria-label/-labelledby,
//    powiązany lub otaczający <label>, albo `title` jako fallback),
//  - przycisk musi mieć `type` (w formularzu domyślnie byłby submitem).
// Baseline w `scripts/a11y-baseline.json` to dług, który tylko maleje.
const BASELINE_FILE = join(process.cwd(), 'scripts/a11y-baseline.json');
const ROOT = join(process.cwd(), 'src/renderer/src');

/**
 * Znaczniki wraz z atrybutami. Skanujemy cudzysłowy, bo prosty `[^>]*` ucina
 * atrybuty zawierające `>` (np. `:ref="(el) => ..."`) i gubi ich treść.
 */
function findTags(source, names) {
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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.vue')) out.push(full);
  }
  return out;
}

/** Tekst widoczny w przycisku (bez tagów; interpolacje to zwykle etykiety). */
function visibleText(inner) {
  return inner
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' x ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Obrazek z niepustym `alt` wewnątrz przycisku daje mu nazwę. */
function hasNamedImage(inner) {
  return findTags(inner, ['img']).some((tag) => /\s(?::|v-bind:)?alt="[^"]+"/.test(tag.attrs));
}

function buttonHasName(attrs, inner) {
  // `aria-hidden` + tabindex -1 to celowo ukryte nakładki (np. play na hover).
  if (/aria-hidden="true"/.test(attrs)) return true;
  if (/aria-label=|aria-labelledby=/.test(attrs)) return true;
  if (visibleText(inner)) return true;
  if (hasNamedImage(inner)) return true;
  return /\s(?::|v-bind:)?title=/.test(attrs);
}

function controlHasName(source, attrs, start, file) {
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

const buttons = [];
const controls = [];
const withoutType = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8');
  for (const tag of findTags(source, ['button'])) {
    const line = source.slice(0, tag.start).split('\n').length;
    if (!/(^|\s):?type=/.test(tag.attrs)) withoutType.push({ file, line });
    const close = tag.selfClosing ? tag.end : source.indexOf('</button>', tag.end);
    const inner = close < 0 ? '' : source.slice(tag.end, close);
    if (buttonHasName(tag.attrs, inner)) continue;
    buttons.push({ file, line });
  }
  for (const tag of findTags(source, ['input', 'select', 'textarea'])) {
    if (controlHasName(source, tag.attrs, tag.start, file)) continue;
    controls.push({ file, line: source.slice(0, tag.start).split('\n').length });
  }
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
} catch {
  console.log('check:a11y — brak baseline, używam 0');
}

function report(label, rows, allowed, hint) {
  const limit = Number.isFinite(allowed) ? allowed : Number.POSITIVE_INFINITY;
  console.log(`check:a11y — ${label}: ${rows.length} (baseline ${allowed ?? 'brak'})`);
  if (rows.length <= limit) {
    if (Number.isFinite(limit) && rows.length < limit) {
      console.log(`  Możesz obniżyć baseline do ${rows.length} w scripts/a11y-baseline.json.`);
    }
    return true;
  }
  const counts = new Map();
  for (const row of rows) counts.set(row.file, (counts.get(row.file) ?? 0) + 1);
  for (const [file, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(
      `  ${String(count).padStart(3)} ${relative(process.cwd(), file).replaceAll('\\', '/')}`
    );
  }
  console.log(`  ${hint}`);
  return false;
}

const okButtons = report(
  'przyciski bez nazwy',
  buttons,
  baseline.iconOnlyButtonsWithoutName,
  'Dodaj `aria-label`/`aria-labelledby`, widoczny tekst albo `alt` obrazka.'
);
const okControls = report(
  'kontrolki formularzy bez nazwy',
  controls,
  baseline.unlabelledFormControls,
  'Dodaj `aria-label`, `label for` albo otocz kontrolkę <label>.'
);
const okTypes = report(
  'przyciski bez type',
  withoutType,
  baseline.buttonsWithoutType,
  'Dodaj `type="button"` (w formularzu domyślnie byłby submitem).'
);

if (!okButtons || !okControls || !okTypes) process.exit(1);
