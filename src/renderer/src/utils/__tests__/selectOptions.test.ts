import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readSelect } from '../selectOptions';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import type { DownloadSettings } from '@renderer/types/settings';

// readSelect zastępuje surowy cast `as any` na wartości <select>. Cast nigdy nie
// zawodził, więc zmieniona nazwa opcji albo wartość pozostawiona ze starszego pliku
// ustawień wpływała prosto do store. Wartość jest teraz sprawdzana względem listy
// opcji, a te testy pilnują obu połówek: sprawdzenie działa i zadeklarowane listy
// nadal pokrywają opcje renderowane przez ich szablony.

function change(value: string): Event {
  // Samotny <select> bez opcji odrzuca przypisaną wartość, więc cel jest
  // zwykłym zaślepkiem z jednym polem, którego dotyka readSelect.
  return { target: { value } } as unknown as Event;
}

describe('readSelect', () => {
  it('accepts a value from the list', () => {
    expect(readSelect(change('flac'), AUDIO_FORMATS)).toBe('flac');
    expect(readSelect(change('1080p'), VIDEO_QUALITIES)).toBe('1080p');
    expect(readSelect(change('mkv'), VIDEO_CONTAINERS)).toBe('mkv');
  });

  it('falls back to the first option for a value the list does not contain', () => {
    // Przypadek, który przepuszczał stary cast: unia na polu ustawień mówiła
    // 'best' | 'mp3' | ..., a i tak przyjmowano cokolwiek innego.
    expect(readSelect(change('wma'), AUDIO_FORMATS)).toBe('best');
    expect(readSelect(change('4320p'), VIDEO_QUALITIES)).toBe('best');
  });

  it('does not accept a value that is merely a prefix of a real one', () => {
    expect(readSelect(change('web'), VIDEO_CONTAINERS)).toBe('mp4');
  });

  it('returns the first option for an empty value', () => {
    expect(readSelect(change(''), VIDEO_CONTAINERS)).toBe('mp4');
  });

  it('survives an event with no usable target', () => {
    expect(readSelect({ target: null } as unknown as Event, AUDIO_FORMATS)).toBe('best');
  });
});

const SETTINGS_DIR = join(process.cwd(), 'src/renderer/src/components/settings');

function declaredList(file: string, name: string): string[] {
  const source = readFileSync(file, 'utf8');
  const match = source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`${name} not found in ${file}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Wartości opcji jednego <select>, który wywołuje readSelect z `list`.
 *
 * Skanowanie całego pliku wychwyciłoby opcje każdego innego select w
 * komponencie — kolejność sortowania, palety wizualizera — i porównało je z
 * niewłaściwą listą.
 */
function optionsForList(file: string, list: string): string[] {
  const source = readFileSync(file, 'utf8');
  const at = source.indexOf(`readSelect($event, ${list})`);
  if (at === -1) throw new Error(`readSelect($event, ${list}) not found in ${file}`);
  const start = source.lastIndexOf('<select', at);
  const end = source.indexOf('</select>', at);
  if (start === -1 || end === -1) throw new Error(`no <select> around ${list} in ${file}`);
  return [...source.slice(start, end).matchAll(/<option\s+value="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Listy walidacyjne żyją obok komponentów, a tagi <option> są pisane ręcznie
 * z przetłumaczonymi etykietami. Dodanie opcji bez dodania jej do listy
 * powodowałoby, że po wybraniu ta opcja wracałaby do pierwszej, więc oba
 * elementy są tu porównywane, a nie uznawane za pewne.
 */
describe('declared select lists cover the options they validate', () => {
  const cases = [
    { name: 'SettingsExplorer.vue', list: 'EXPLORER_SORT_BY' },
    { name: 'SettingsPlayback.vue', list: 'VIZ_MODES' },
    { name: 'SettingsSystemLogs.vue', list: 'LOG_LEVELS' }
  ];

  it('finds the components it is meant to guard', () => {
    const names = readdirSync(SETTINGS_DIR).filter((f) => f.endsWith('.vue'));
    for (const c of cases) expect(names).toContain(c.name);
  });

  it.each(cases)(
    '$name: $list covers exactly the options that select renders',
    ({ name, list }) => {
      const file = join(SETTINGS_DIR, name);
      expect(optionsForList(file, list).sort()).toEqual(declaredList(file, list).sort());
    }
  );
});

/**
 * Połowa na poziomie typów: każda lista musi pasować do unii na polu ustawień,
 * do którego pisze, więc wartość dodana do jednej, a nie do drugiej, to błąd kompilacji.
 */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const checks: [
  AssertEqual<(typeof AUDIO_FORMATS)[number], DownloadSettings['defaultAudioFormat']>,
  AssertEqual<(typeof VIDEO_QUALITIES)[number], DownloadSettings['defaultVideoQuality']>,
  AssertEqual<(typeof VIDEO_CONTAINERS)[number], DownloadSettings['defaultVideoContainer']>
] = [true, true, true];

describe('select lists match the settings field unions', () => {
  it('audio format, video quality and container lists line up with their fields', () => {
    expect(checks).toEqual([true, true, true]);
  });
});
