import { describe, it, expect } from 'vitest';
import { buildSubscribeSummary, type SubscribeSummaryInput } from '../subscribeSummary';

// Siatka regresyjna dla podsumowania preferencji subskrypcji (etykiety/opcje w
// dialogu). Używamy translatora tożsamościowego, więc wartości to klucze i18n.

const t = (key: string): string => key;

function input(o: Partial<SubscribeSummaryInput> = {}): SubscribeSummaryInput {
  return {
    isSc: false,
    folderMode: 'global',
    channelFolder: 'C:/chan',
    outputDir: '',
    filenameTemplate: '',
    addToLibrary: false,
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    audioQuality: 'best',
    audioLanguage: '',
    coverType: 'thumbnail',
    sponsorBlock: 'off',
    trimStart: null,
    trimEnd: null,
    subsEnabled: false,
    subsLangs: '',
    artist: '',
    album: '',
    year: '',
    ...o
  };
}

const labels = (items: Array<{ label: string }>) => items.map((i) => i.label);
const byLabel = (items: Array<{ label: string; value: string }>, label: string) =>
  items.find((i) => i.label === label)?.value;

describe('SoundCloud summary', () => {
  it('shows a compact SoundCloud MP3 summary', () => {
    const items = buildSubscribeSummary(input({ isSc: true, folderMode: 'channel' }), t);
    expect(byLabel(items, 'SoundCloud MP3')).toBe('C:/chan');
    expect(labels(items)).toContain('youtube.addToLibraryPref');
    // SoundCloud nie pokazuje jakości ani formatu.
    expect(labels(items)).not.toContain('youtube.prefKind');
  });

  it('includes the template when set', () => {
    const items = buildSubscribeSummary(input({ isSc: true, filenameTemplate: '  {title}  ' }), t);
    expect(byLabel(items, 'youtube.prefTemplate')).toBe('{title}');
  });
});

describe('YouTube summary', () => {
  it('shows audio format + quality but not video quality', () => {
    const items = buildSubscribeSummary(input({ kind: 'audio', format: 'opus' }), t);
    expect(byLabel(items, 'youtube.prefKind')).toBe('youtube.prefAudio');
    expect(byLabel(items, 'youtube.prefFormat')).toBe('opus');
    expect(labels(items)).not.toContain('youtube.prefQuality');
  });

  it('shows video quality but not audio format/cover for video', () => {
    const items = buildSubscribeSummary(input({ kind: 'video', quality: '1080p' }), t);
    expect(byLabel(items, 'youtube.prefQuality')).toBe('1080p');
    expect(labels(items)).not.toContain('youtube.prefFormat');
    expect(labels(items)).not.toContain('youtube.coverSection');
  });

  it('formats the output folder per folder mode', () => {
    expect(
      byLabel(buildSubscribeSummary(input({ folderMode: 'channel' }), t), 'youtube.prefOutputDir')
    ).toBe('C:/chan');
    expect(
      byLabel(buildSubscribeSummary(input({ folderMode: 'global' }), t), 'youtube.prefOutputDir')
    ).toBe('youtube.prefOutputDirGlobal');
    expect(
      byLabel(
        buildSubscribeSummary(input({ folderMode: 'custom', outputDir: 'D:/x' }), t),
        'youtube.prefOutputDir'
      )
    ).toBe('D:/x');
  });

  it('includes sponsorBlock only when enabled', () => {
    expect(labels(buildSubscribeSummary(input({ sponsorBlock: 'off' }), t))).not.toContain(
      'youtube.sponsorBlock'
    );
    expect(
      byLabel(buildSubscribeSummary(input({ sponsorBlock: 'mark' }), t), 'youtube.sponsorBlock')
    ).toBe('youtube.sponsorBlockMark');
    expect(
      byLabel(buildSubscribeSummary(input({ sponsorBlock: 'remove' }), t), 'youtube.sponsorBlock')
    ).toBe('youtube.sponsorBlockRemove');
  });

  it('includes a trim range only when both ends are set', () => {
    const withTrim = buildSubscribeSummary(input({ trimStart: 5, trimEnd: 10 }), t);
    expect(withTrim.some((i) => i.value === '5s – 10s')).toBe(true);
    const noTrim = buildSubscribeSummary(input({ trimStart: 5 }), t);
    expect(noTrim.some((i) => i.value.includes('s –'))).toBe(false);
  });

  it('includes subtitles only when enabled with languages', () => {
    expect(
      byLabel(
        buildSubscribeSummary(input({ subsEnabled: true, subsLangs: 'pl,en' }), t),
        'youtube.subsSection'
      )
    ).toBe('pl,en');
    expect(
      labels(buildSubscribeSummary(input({ subsEnabled: true, subsLangs: '' }), t))
    ).not.toContain('youtube.subsSection');
  });

  it('includes metadata only when any field is set', () => {
    expect(
      byLabel(buildSubscribeSummary(input({ artist: 'A', album: 'B' }), t), 'youtube.metaSection')
    ).toBe('A / B');
    expect(labels(buildSubscribeSummary(input(), t))).not.toContain('youtube.metaSection');
  });

  it('always ends with the addToLibrary item', () => {
    const items = buildSubscribeSummary(input({ addToLibrary: true }), t);
    expect(items.at(-1)).toEqual({ label: 'youtube.addToLibraryPref', value: 'common.yes' });
  });
});
