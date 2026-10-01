import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Każda kontrolka tylko z ikoną w widoku audio była kiedyś <button> bez etykiety:
// wiersz transportu, mute, przełączniki korektora i kolejki. Czytnik ekranu
// ogłaszał je wszystkie jako samo "button", więc transport był bezużyteczny bez
// widoku ikon. Przyciski z widocznym tekstem biorą nazwę z treści i
// są wyłączone — to sprawdza tylko te, które nie mają nic poza ikoną.

const AUDIO_DIR = join(process.cwd(), 'src/renderer/src/components/audio');

interface ButtonOpeningTag {
  line: number;
  tag: string;
  hasName: boolean;
  textContent: string;
}

function readButtons(file: string): ButtonOpeningTag[] {
  const source = readFileSync(file, 'utf8');
  const buttons: ButtonOpeningTag[] = [];
  const openTag = /<button\b[^>]*>/g;

  for (let match = openTag.exec(source); match !== null; match = openTag.exec(source)) {
    const tag = match[0];
    const line = source.slice(0, match.index).split('\n').length;
    // Treść do pasującego </button>, ignorując zagnieżdżone tagi. Każdy mustache
    // liczy się jako wyrenderowany tekst — to, co produkuje binding, jest pytaniem o runtime,
    // a nie defektem statycznego źródła, a pilnowane tu przyciski transportu zawierają
    // tylko komponent ikony.
    const close = source.indexOf('</button>', match.index);
    const body = close === -1 ? '' : source.slice(match.index + tag.length, close);
    const textContent = body
      .replace(/\{\{[\s\S]*?\}\}/g, ' TEXT ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    buttons.push({
      line,
      tag: tag.replace(/\s+/g, ' '),
      hasName: /aria-label|:title|title=/.test(tag),
      textContent
    });
  }
  return buttons;
}

describe('audio view controls are named', () => {
  const files = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.vue'));

  it('finds the component files it is meant to check', () => {
    expect(files).toContain('AudioControlsCore.vue');
    expect(files).toContain('AudioHudToolbar.vue');
  });

  it.each(files)('%s: every icon-only button has an accessible name', (file) => {
    const unnamed = readButtons(join(AUDIO_DIR, file)).filter(
      (b) => !b.hasName && b.textContent === ''
    );
    expect(
      unnamed.map((b) => `${file}:${b.line} ${b.tag}`),
      `icon-only buttons without aria-label or title in ${file}`
    ).toEqual([]);
  });
});
