import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanSource } from './lib/a11y-scan.mjs';

// Strażnik a11y i poprawności formularzy:
//  - przycisk z samą ikoną musi mieć nazwę dostępną,
//  - surowa kontrolka formularza musi mieć nazwę (aria-label/-labelledby,
//    powiązany lub otaczający <label>, albo `title` jako fallback),
//  - przycisk musi mieć `type` (w formularzu domyślnie byłby submitem).
// Baseline w `scripts/a11y-baseline.json` to dług, który tylko maleje.
const BASELINE_FILE = join(process.cwd(), 'scripts/a11y-baseline.json');
const ROOT = join(process.cwd(), 'src/renderer/src');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.vue')) out.push(full);
  }
  return out;
}

const buttons = [];
const controls = [];
const withoutType = [];
const images = [];
const dialogs = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8');
  const rows = scanSource(source, file);
  buttons.push(...rows.buttons);
  controls.push(...rows.controls);
  withoutType.push(...rows.withoutType);
  images.push(...rows.images);
  dialogs.push(...rows.dialogs);
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
const okImages = report(
  'obrazy bez alt',
  images,
  baseline.imagesWithoutAlt,
  'Dodaj `alt="..."`; dla ozdobnych `alt=""`.'
);
const okDialogs = report(
  'dialogi bez nazwy',
  dialogs,
  baseline.unnamedDialogs,
  'Dodaj `aria-label`/`aria-labelledby` do `role="dialog"`.'
);

if (!okButtons || !okControls || !okTypes || !okImages || !okDialogs) process.exit(1);
