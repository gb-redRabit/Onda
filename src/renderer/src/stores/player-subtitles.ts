import { ref } from 'vue';
import type { SubtitleTrack, MkvFont } from '@renderer/types/subtitles';
import { logger } from '@shared/logger';

export function usePlayerSubtitles() {
  const subtitleTracks = ref<SubtitleTrack[]>([]);
  const activeSubtitleId = ref<string | null>(null);
  let currentLoadId = 0;

  async function loadSubtitles(videoPath: string): Promise<void> {
    const loadId = ++currentLoadId;
    const prevId = activeSubtitleId.value;
    const tracks: SubtitleTrack[] = [];

    const external = (await window.api?.findExternalSubtitles(videoPath)) ?? [];
    if (loadId !== currentLoadId) return;
    for (const sub of external) {
      const content = await window.api?.readSubtitleFile(sub.path);
      if (loadId !== currentLoadId) return;
      if (content) {
        tracks.push({
          id: `ext-${sub.path}`,
          label: sub.name,
          language: sub.name.includes('.') ? sub.name.split('.').slice(-2, -1)[0] || 'pl' : 'pl',
          format: sub.format as SubtitleTrack['format'],
          source: 'external',
          filePath: sub.path,
          content
        });
      }
    }

    const embedded = (await window.api?.listEmbeddedSubtitles(videoPath)) ?? [];
    if (loadId !== currentLoadId) return;
    for (const sub of embedded) {
      const label = sub.title || sub.language || `Track ${sub.index}`;
      tracks.push({
        id: `emb-${sub.index}`,
        label: `${label} (wbudowane)`,
        language: sub.language,
        format: 'ass',
        source: 'embedded'
      });
    }

    subtitleTracks.value = tracks;

    if (prevId && tracks.some((t) => t.id === prevId)) {
      activeSubtitleId.value = prevId;
    } else {
      const firstEmbedded = tracks.find((t) => t.source === 'embedded');
      activeSubtitleId.value = firstEmbedded ? firstEmbedded.id : null;
    }
  }

  async function loadEmbeddedSubtitle(
    trackId: string,
    videoPath: string
  ): Promise<{
    content: string;
    format: SubtitleTrack['format'];
    fonts: MkvFont[];
  } | null> {
    const embIndex = parseInt(trackId.replace('emb-', ''));
    if (isNaN(embIndex)) return null;
    const [result, fonts] = await Promise.all([
      window.api?.extractEmbeddedSubtitle(videoPath, embIndex) ?? Promise.resolve(null),
      window.api?.extractSubtitleFonts(videoPath) ?? Promise.resolve([] as MkvFont[])
    ]);
    if (!result) return null;
    logger.info(
      'Subtitles',
      `loadEmbedded: format=${result.format} fonts=${fonts.length} fontNames=[${fonts.map((f) => f.name).join(', ')}]`
    );
    return {
      content: result.content,
      format: result.format as SubtitleTrack['format'],
      fonts
    };
  }

  function setActiveSubtitle(trackId: string | null): void {
    activeSubtitleId.value = trackId;
  }

  async function loadCustomSubtitles(filePaths: string[]): Promise<number> {
    let added = 0;
    for (const filePath of filePaths) {
      const content = await window.api?.readSubtitleFile(filePath);
      if (!content) continue;
      const name = (filePath.split(/[/\\]/).pop() || filePath).replace(
        /\.(srt|ass|ssa|vtt|sub)$/i,
        ''
      );
      const ext = (filePath.split('.').pop() || '').toLowerCase();
      const format = (
        ['ass', 'ssa', 'srt', 'vtt', 'sub'].includes(ext) ? ext : 'srt'
      ) as SubtitleTrack['format'];
      subtitleTracks.value.push({
        id: `custom-${filePath}`,
        label: name,
        language: 'custom',
        format,
        source: 'custom',
        filePath,
        content
      });
      added++;
    }
    if (added > 0 && subtitleTracks.value.length > 0) {
      const last = subtitleTracks.value[subtitleTracks.value.length - 1];
      activeSubtitleId.value = last.id;
    }
    return added;
  }

  function clearSubtitles(): void {
    subtitleTracks.value = [];
    activeSubtitleId.value = null;
  }

  return {
    subtitleTracks,
    activeSubtitleId,
    loadSubtitles,
    loadEmbeddedSubtitle,
    setActiveSubtitle,
    loadCustomSubtitles,
    clearSubtitles
  };
}
