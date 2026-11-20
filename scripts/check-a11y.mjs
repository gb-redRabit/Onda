import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Strażnik a11y: kontrolki muszą mieć nazwę dostępną (aria-label/-labelledby,
// powiązany <label>, otaczający <label> albo `title` jako fallback). Baseline
// w `scripts/a11y-baseline.json` to dług, który tylko maleje: po naprawie
// kolejnej partii obniż wartości.
const BASELINE_FILE = join(process.cwd(), 'scripts/a11y-baseline.json');
const ROOT = join(process.cwd(), 'src/renderer/src');
const BUTTON = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
const CONTROL = /<(input|select|textarea)\b([^>]*)>/g;

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

function buttonHasName(attrs, inner) {
  // `aria-hidden` + tabindex -1 to celowo ukryte nakładki (np. play na hover).
  if (/aria-hidden="true"/.test(attrs)) return true;
  if (/aria-label=|aria-labelledby=/.test(attrs)) return true;
  if (visibleText(inner)) return true;
  return /\s(?::|v-bind:)?title=/.test(attrs);
}

function controlHasName(source, attrs, index, file) {
  // Wrappery `ui/*` i kontrolki z `v-bind="..."` dostają atrybuty (w tym
  // `aria-label`) od wywołującego — skan źródła tego nie zobaczy.
  if (/v-bind=/.test(attrs)) return true;
  if (file.replaceAll('\\', '/').includes('/components/ui/')) return true;
  if (/aria-hidden="true"/.test(attrs) || /type="hidden"/.test(attrs)) return true;
  if (/aria-label=|aria-labelledby=/.test(attrs)) return true;
  const id = /(?:^|\s)id="([^"]+)"/.exec(attrs)?.[1];
  if (id && new RegExp(`<label[^>]*\\bfor="${id}"`).test(source)) return true;
  const before = source.slice(0, index);
  if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) return true;
  return /\s(?::|v-bind:)?title=/.test(attrs);
}

const buttons = [];
const controls = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(BUTTON)) {
    if (buttonHasName(match[1], match[2])) continue;
    buttons.push({ file, line: source.slice(0, match.index).split('\n').length });
  }
  for (const match of source.matchAll(CONTROL)) {
    if (controlHasName(source, match[2], match.index, file)) continue;
    controls.push({ file, line: source.slice(0, match.index).split('\n').length });
  }
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
} catch {
  console.log('check:a11y — brak baseline, tworzę z aktualnym stanem');
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

const buttonsOk = report(
  'przyciski bez nazwy',
  buttons,
  baseline.iconOnlyButtonsWithoutName,
  'Dodaj `aria-label`/`aria-labelledby` albo widoczny tekst.'
);
const controlsOk = report(
  'kontrolki formularzy bez nazwy',
  controls,
  baseline.unlabelledFormControls,
  'Dodaj `aria-label`, `label for` albo otocz kontrolkę <label>.'
);

if (!buttonsOk || !controlsOk) process.exit(1);
