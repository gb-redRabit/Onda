import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Strażnik a11y: przycisk z samą ikoną musi mieć nazwę dostępną
// (`aria-label`/`aria-labelledby`). `title` liczy się jako nazwa zapasowa, więc
// takie przyciski nie są tu zgłaszane — chodzi o te bez żadnej etykiety.
//
// Baseline w `scripts/a11y-baseline.json` to dług, który zmniejszamy: próg
// może tylko spadać. Po naprawie części przycisków obniż wartość w pliku.
const BASELINE_FILE = join(process.cwd(), 'scripts/a11y-baseline.json');
const ROOT = join(process.cwd(), 'src/renderer/src');
const BUTTON = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;

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

function hasAccessibleName(attrs, inner) {
  // `aria-hidden` + tabindex -1 to celowo ukryte nakładki (np. play na hover) —
  // karta ma własny przycisk z nazwą, więc nie są częścią drzewa dostępności.
  if (/aria-hidden="true"/.test(attrs)) return true;
  if (/aria-label=|aria-labelledby=/.test(attrs)) return true;
  if (visibleText(inner)) return true;
  return /\s(?::|v-bind:)?title=/.test(attrs);
}

const offenders = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(BUTTON)) {
    const [, attrs, inner] = match;
    if (hasAccessibleName(attrs, inner)) continue;
    offenders.push({
      file: relative(process.cwd(), file).replaceAll('\\', '/'),
      line: source.slice(0, match.index).split('\n').length
    });
  }
}

let baseline = Number.POSITIVE_INFINITY;
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).iconOnlyButtonsWithoutName;
} catch {
  console.log('check:a11y — brak baseline, tworzę z aktualnym stanem');
}

const counts = new Map();
for (const row of offenders) counts.set(row.file, (counts.get(row.file) ?? 0) + 1);

console.log(
  `check:a11y — przyciski bez nazwy dostępnej: ${offenders.length} (baseline ${baseline})`
);
if (offenders.length > baseline) {
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [file, count] of top) console.log(`  ${String(count).padStart(3)} ${file}`);
  console.log('Dodaj `aria-label`/`aria-labelledby` albo widoczny tekst.');
  process.exit(1);
}
if (offenders.length < baseline) {
  console.log(`Możesz obniżyć baseline do ${offenders.length} w scripts/a11y-baseline.json.`);
}
