import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Kilkanaście etykiet wpisano wprost w szablon, więc nigdy nie trafiły
// do plików lokalizacji. Polskie były najgorszym przypadkiem: `LibraryAlbumsTab`
// i `MusicBrainzSearchForm` miały zaszyte polskie etykiety sortowania i nazwy pól
// w komponencie bez `useI18n`, więc angielski użytkownik czytał "Rok" i
// "Wykonawca / Artysta" na skądinąd angielskim ekranie.
//
// To pilnuje konkretnej usterki — widocznego węzła tekstowego, który nie jest
// interpolacją — a nie wszystkich zaszytych ciągów, bo sporo widocznego
// tekstu celowo nie podlega tłumaczeniu: skróty klawiszowe, rozszerzenia plików,
// czasowniki HTTP, nazwy marek i nazwy poziomów logowania. Przetłumaczenie `warn`
// zepsułoby przeszukiwanie podglądu logów, więc poniższa lista dozwolonych jest decyzją, a nie
// przeoczeniem.

const SRC = join(process.cwd(), 'src/renderer/src');

/**
 * Widoczny tekst, który musi pozostać dosłowny w każdym języku.
 *
 * `kind` jest dopasowywany do otaczającego kontekstu, więc wyjątek jest wąski:
 * `brand` zwalnia tylko znany rzeczownik własny, `ext` tylko rozszerzenie pliku.
 */
const ALLOWED: { match: RegExp; why: string }[] = [
  { match: /^(Ctrl|Alt|Shift|Meta)\+[\w+]+$/, why: 'keyboard shortcut' },
  { match: /^&[a-z]+;$|^&#x?[0-9a-f]+;$/i, why: 'HTML entity' },
  { match: /^\.(webm|mp4|mp3|flac|m4a|opus|ogg|wav|aac)$/i, why: 'file extension' },
  { match: /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/, why: 'HTTP method' },
  {
    match:
      /^(YouTube|SoundCloud|MusicBrainz|Node\.js|Electron|Chrome|OpenAI|Generic|Ken Burns|SC|YT|LIB|WebM|MP4|SRT|VTT|ASS)$/,
    why: 'proper noun or format name'
  },
  { match: /^(debug|info|warn|error)$/, why: 'log level name, searched in the log viewer' },
  { match: /^\d+(\.\d+)?\s*(MB|KB|GB|ms|s|M\/s|MB\/s)$/, why: 'numeric value with a unit' },
  { match: /^(H|Space|Esc|M)$/, why: 'literal key name in a shortcut hint' },
  { match: /^(ms|kHz|px|pt|em)$/i, why: 'unit suffix after a value' },
  {
    // `{'{title}'}, {'{artist}'}` — przykład zmiennych szablonu, które mają
    // być pokazane użytkownikowi dokładnie tak, jak zostały zapisane.
    match: /^(?:\{['"]\{[a-z]+\}['"]\})(?:, \{['"]\{[a-z]+\}['"]\})*$/,
    why: 'example of template variables, meant to be shown literally'
  }
];

/** Fragmenty szablonu w nawiasach, na których powyższy regex w przeciwnym razie by się potknął. */
const TAIL = /^[A-Za-z]{2,}$/;

function isAllowed(text: string): boolean {
  if (ALLOWED.some((a) => a.match.test(text))) return true;
  return false;
}

function vueFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'locales' || entry === '__tests__') continue;
      vueFiles(full, acc);
    } else if (entry.endsWith('.vue')) {
      acc.push(full);
    }
  }
  return acc;
}

interface Offender {
  file: string;
  line: number;
  text: string;
}

function findHardcodedText(): Offender[] {
  const offenders: Offender[] = [];

  for (const file of vueFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf('<template>');
    if (start === -1) continue;
    // Blok <style> z atrybutem scoped to dla tego skanowania znacznik, a nie tekst widoczny dla użytkownika.
    const styleStart = source.indexOf('<style', start);
    const template = styleStart === -1 ? source.slice(start) : source.slice(start, styleStart);
    const lineOffset = source.slice(0, start).split('\n').length - 1;

    // Tekst między znacznikami. Wartości atrybutów w cudzysłowach są pochłaniane jawnie, żeby
    // `>` wewnątrz bindowania (`:aria-valuetext="... x > 0 ..."`) nie zakończył
    // skanowania przedwcześnie, a interpolacje są całkowicie pomijane.
    for (const match of template.matchAll(/>([^<>]+)</g)) {
      const raw = match[1].trim();
      if (!raw) continue;
      // Węzeł tekstowy może mieszać interpolację z literałem, a literał to
      // ta część, która umyka tłumaczeniu: `{{ count }} plików` to jeden węzeł, więc
      // pomijanie każdego węzła zawierającego `{{` — jak robiono to początkowo — przepuszczało
      // zaszyty polski plural. Sprawdzana jest reszta literału
      // po ostatniej interpolacji.
      const lastClose = raw.lastIndexOf('}}');
      const literal = (lastClose === -1 ? raw : raw.slice(lastClose + 2))
        .replace(/\s+/g, ' ')
        .trim();
      if (lastClose === -1) {
        // Brak jakiejkolwiek interpolacji: sprawdź cały węzeł.
        if (raw.includes('{{') || raw.includes('}}')) continue;
      }
      // Pojedynczy pozostały fragment interpolacji lub bindowanie to nie etykieta.
      if (/^[:@]?[a-z-]*[=\"']/.test(literal)) continue;
      const text = literal;
      if (!/[a-z]{2}/i.test(text)) continue;
      if (!/[a-z]/.test(text)) continue;
      if (isAllowed(text)) continue;
      // `Space stop` i podobne: odrzuć wiodący token klawisza, który jest
      // dosłowną nazwą klawisza, a nie częścią zdania.
      if (
        TAIL.test(text.split(' ')[0]) &&
        isAllowed(text.split(' ')[0]) &&
        !/^(GET|POST)$/.test(text)
      ) {
        const rest = text.split(' ').slice(1).join(' ').trim();
        if (rest && !isAllowed(rest)) {
          offenders.push({
            file: file.replace(`${process.cwd()}\\`, ''),
            line: lineOffset + template.slice(0, match.index).split('\n').length,
            text
          });
        }
        continue;
      }
      offenders.push({
        file: file.replace(`${process.cwd()}\\`, ''),
        line: lineOffset + template.slice(0, match.index).split('\n').length,
        text
      });
    }
  }

  return offenders;
}

describe('user-facing text goes through i18n', () => {
  const offenders = findHardcodedText();

  it('finds the component files it is meant to check', () => {
    const names = vueFiles(SRC).map((f) => f.split('\\').pop());
    expect(names).toContain('LibraryAlbumsTab.vue');
    expect(names).toContain('SettingsPlayback.vue');
  });

  it('has no visible text node left hardcoded in a template', () => {
    expect(
      offenders.map((o) => `${o.file}:${o.line}  >${o.text}<`),
      'visible text that bypasses i18n — wrap it in $t() or add it to ALLOWED with a reason'
    ).toEqual([]);
  });
});
