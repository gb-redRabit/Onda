import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readSelect } from '../selectOptions';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import type { DownloadSettings } from '@renderer/types/settings';

// readSelect replaces a raw `as any` cast on a <select>'s value. The cast never
// failed, so a renamed option, or a value left over from an older settings file,
// flowed straight into the store. The value is now checked against the option
// list, and these tests pin both halves: the check works, and the declared lists
// still cover the options their templates render.

function change(value: string): Event {
  // A bare <select> with no options discards an assigned value, so the target
  // is a plain stand-in with the one field readSelect touches.
  return { target: { value } } as unknown as Event;
}

describe('readSelect', () => {
  it('accepts a value from the list', () => {
    expect(readSelect(change('flac'), AUDIO_FORMATS)).toBe('flac');
    expect(readSelect(change('1080p'), VIDEO_QUALITIES)).toBe('1080p');
    expect(readSelect(change('mkv'), VIDEO_CONTAINERS)).toBe('mkv');
  });

  it('falls back to the first option for a value the list does not contain', () => {
    // The case the old cast let through: the union on the settings field said
    // 'best' | 'mp3' | ..., and anything else was accepted anyway.
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
 * Option values of the one <select> that calls readSelect with `list`.
 *
 * Scanning the whole file would pick up the options of every other select in the
 * component — sort order, visualizer palettes — and compare them against the
 * wrong list.
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
 * The validation lists live next to the components while the <option> tags are
 * hand-written with translated labels. Adding an option without adding it to the
 * list would make that option snap back to the first one when selected, so the
 * two are compared here rather than trusted.
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
 * Type-level half: each list must match the union on the settings field it
 * writes, so a value added to one and not the other is a compile error.
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
