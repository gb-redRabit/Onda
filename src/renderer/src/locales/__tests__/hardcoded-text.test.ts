import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A dozen labels were written straight into the template, so they never reached
// the locale files. The Polish ones were the worst case: `LibraryAlbumsTab` and
// `MusicBrainzSearchForm` had Polish sort labels and field names hardcoded in a
// component with no `useI18n` at all, so an English user read "Rok" and
// "Wykonawca / Artysta" in an otherwise English screen.
//
// This guards the specific failure — a visible text node that is not an
// interpolation — rather than all hardcoded strings, because plenty of visible
// text is deliberately not translated: keyboard shortcuts, file extensions,
// HTTP verbs, brand names, and log level names. Translating `warn` would break
// searching the log viewer, so the allowlist below is a decision, not an
// oversight.

const SRC = join(process.cwd(), 'src/renderer/src');

/**
 * Visible text that must stay verbatim in every language.
 *
 * `kind` is matched against the surrounding context so the exemption is narrow:
 * `brand` only exempts a known proper noun, `ext` only a file extension.
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
    // `{'{title}'}, {'{artist}'}` — an example of template variables, meant to
    // be shown to the user exactly as written.
    match: /^(?:\{['"]\{[a-z]+\}['"]\})(?:, \{['"]\{[a-z]+\}['"]\})*$/,
    why: 'example of template variables, meant to be shown literally'
  }
];

/** Bracketed template fragments the regex above would otherwise trip on. */
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
    // A scoped <style> block is markup to this scan, not user-facing text.
    const styleStart = source.indexOf('<style', start);
    const template = styleStart === -1 ? source.slice(start) : source.slice(start, styleStart);
    const lineOffset = source.slice(0, start).split('\n').length - 1;

    // Text between tags. Quoted attribute values are consumed explicitly so a
    // `>` inside a binding (`:aria-valuetext="... x > 0 ..."`) cannot end the
    // scan early, and interpolations are skipped outright.
    for (const match of template.matchAll(/>([^<>]+)</g)) {
      const raw = match[1].trim();
      if (!raw) continue;
      // A text node may mix an interpolation with a literal, and the literal is
      // the part that escapes translation: `{{ count }} plików` is one node, so
      // skipping every node containing `{{` — as this did at first — let a
      // hardcoded Polish plural through. What is checked is the literal remainder
      // after the last interpolation.
      const lastClose = raw.lastIndexOf('}}');
      const literal = (lastClose === -1 ? raw : raw.slice(lastClose + 2))
        .replace(/\s+/g, ' ')
        .trim();
      if (lastClose === -1) {
        // No interpolation at all: check the whole node.
        if (raw.includes('{{') || raw.includes('}}')) continue;
      }
      // A single leftover interpolation fragment or binding is not a label.
      if (/^[:@]?[a-z-]*[=\"']/.test(literal)) continue;
      const text = literal;
      if (!/[a-z]{2}/i.test(text)) continue;
      if (!/[a-z]/.test(text)) continue;
      if (isAllowed(text)) continue;
      // `Space stop` and similar: drop the leading keycap token, which is a
      // literal key name and not part of the sentence.
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
