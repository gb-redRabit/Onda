import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Detektor „klikalnych div-ów": elementy, które nie są kontrolkami, mają `@click`,
// ale nie mają semantyki (`role`), obsługi klawiatury ani `v-activate`. Takie
// wiersze/karty były dostępne wyłącznie myszą. Naprawa: `v-activate`
// (`utils/activateDirective.ts`) albo jawne role/tabindex/keydown.

const ROOTS = [
  join(process.cwd(), 'src/renderer/src/components'),
  join(process.cwd(), 'src/renderer/src/views')
];

interface ClickableTag {
  line: number;
  tag: string;
}

function readClickableNonInteractive(file: string): ClickableTag[] {
  const source = readFileSync(file, 'utf8');
  const out: ClickableTag[] = [];
  // Dopasuj otwierający tag do pierwszego `>`; atrybuty Vue nie zawierają `>` poza
  // wartościami w cudzysłowach, więc dla naszych plików to wystarcza.
  const tagRe = /<(?:div|span|li|td|tr|article|section|figure)\b[^>]*>/gi;
  for (let m = tagRe.exec(source); m !== null; m = tagRe.exec(source)) {
    const tag = m[0];
    if (!/@click/.test(tag)) continue;
    // `@click.self` = zamknięcie nakładki (obsługiwane też przez Escape),
    // goły `@click.stop` = guard propagacji, nie kontrolka.
    if (/@click\.self/.test(tag)) continue;
    if (/@click\.stop(?!\s*=)/.test(tag)) continue;
    const hasSemantics = /(^|\s):?role=/.test(tag);
    const hasTabindex = /:?tabindex=/.test(tag);
    const hasKeyboard = /@key(?:down|up|press)/.test(tag);
    const hasDirective = /v-activate/.test(tag);
    if (hasSemantics || hasTabindex || hasKeyboard || hasDirective) continue;
    out.push({ line: source.slice(0, m.index).split('\n').length, tag: tag.replace(/\s+/g, ' ') });
  }
  return out;
}

function walkVue(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...walkVue(full));
    } else if (entry.name.endsWith('.vue')) {
      out.push(full);
    }
  }
  return out;
}

describe('clickable non-interactive elements are keyboard accessible', () => {
  const files = ROOTS.flatMap(walkVue);

  it.each(files)('%s: no bare @click on non-control elements', (file) => {
    const flagged = readClickableNonInteractive(file);
    const rel = file.slice(file.indexOf('src/renderer/src')).replace(/\\/g, '/');
    expect(
      flagged.map((f) => `${rel}:${f.line} ${f.tag}`),
      `clickable non-control elements without role/tabindex/keyboard/v-activate in ${rel}`
    ).toEqual([]);
  });
});
