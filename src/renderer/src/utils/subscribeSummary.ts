// Pure subscription-prefs summary extracted from
// `components/online/SubscribeConfigDialog.vue` (plan 2.8).

export interface SummaryItem {
  label: string;
  value: string;
}

export interface SubscribeSummaryInput {
  isSc: boolean;
  folderMode: 'channel' | 'global' | 'custom';
  channelFolder: string;
  outputDir: string;
  filenameTemplate: string;
  addToLibrary: boolean;
  kind: 'audio' | 'video';
  format: string;
  quality: string;
  audioQuality: string;
  audioLanguage: string;
  coverType: string;
  sponsorBlock: 'off' | 'mark' | 'remove';
  trimStart: number | null;
  trimEnd: number | null;
  subsEnabled: boolean;
  subsLangs: string;
  artist: string;
  album: string;
  year: string;
}

export function buildSubscribeSummary(
  s: SubscribeSummaryInput,
  t: (key: string) => string
): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (s.isSc) {
    const folder =
      s.folderMode === 'channel'
        ? s.channelFolder || t('youtube.prefOutputDirChannel')
        : s.folderMode === 'custom'
          ? s.outputDir || t('youtube.prefOutputDirCustom')
          : t('youtube.prefOutputDirGlobal');
    items.push({ label: 'SoundCloud MP3', value: folder });
    if (s.filenameTemplate.trim()) {
      items.push({ label: t('youtube.prefTemplate'), value: s.filenameTemplate.trim() });
    }
    items.push({
      label: t('youtube.addToLibraryPref'),
      value: s.addToLibrary ? t('common.yes') : t('common.no')
    });
    return items;
  }
  items.push({
    label: t('youtube.prefKind'),
    value: s.kind === 'audio' ? t('youtube.prefAudio') : t('youtube.prefVideo')
  });
  if (s.kind === 'audio') {
    items.push({ label: t('youtube.prefFormat'), value: s.format });
  }
  if (s.kind === 'video') {
    items.push({ label: t('youtube.prefQuality'), value: s.quality });
  }
  if (s.kind !== 'video') {
    items.push({
      label: t('settings.defaultAudioQuality'),
      value: t('settings.audioQuality.' + s.audioQuality)
    });
  }
  if (s.audioLanguage.trim()) {
    items.push({ label: t('youtube.audioLanguage'), value: s.audioLanguage.trim() });
  }
  if (s.kind !== 'video') {
    items.push({ label: t('youtube.coverSection'), value: t('settings.cover.' + s.coverType) });
  }
  if (s.sponsorBlock !== 'off') {
    items.push({
      label: t('youtube.sponsorBlock'),
      value:
        s.sponsorBlock === 'mark' ? t('youtube.sponsorBlockMark') : t('youtube.sponsorBlockRemove')
    });
  }
  if (s.trimStart != null && s.trimEnd != null) {
    items.push({
      label: t('youtube.trimStart') + ' / ' + t('youtube.trimEnd'),
      value: `${s.trimStart}s – ${s.trimEnd}s`
    });
  }
  if (s.subsEnabled && s.subsLangs.trim()) {
    items.push({ label: t('youtube.subsSection'), value: s.subsLangs.trim() });
  }
  const folder =
    s.folderMode === 'channel'
      ? s.channelFolder || t('youtube.prefOutputDirChannel')
      : s.folderMode === 'custom'
        ? s.outputDir || t('youtube.prefOutputDirCustom')
        : t('youtube.prefOutputDirGlobal');
  items.push({ label: t('youtube.prefOutputDir'), value: folder });
  if (s.filenameTemplate.trim()) {
    items.push({ label: t('youtube.prefTemplate'), value: s.filenameTemplate.trim() });
  }
  if (s.artist.trim() || s.album.trim() || s.year.trim()) {
    items.push({
      label: t('youtube.metaSection'),
      value: [s.artist, s.album, s.year].filter(Boolean).join(' / ')
    });
  }
  items.push({
    label: t('youtube.addToLibraryPref'),
    value: s.addToLibrary ? t('common.yes') : t('common.no')
  });
  return items;
}
