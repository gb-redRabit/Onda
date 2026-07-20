import type { Router } from 'vue-router';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';
import { VIDEO_EXTS } from '@shared/constants';

function toMediaFile(path: string): MediaFile {
  const name = path.split(/[/\\]/).pop() || path;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    name,
    type: VIDEO_EXTS.includes(`.${ext}`) ? 'video' : 'audio',
    size: 0,
    duration: 0,
    extension: ext,
    mimeType: '',
    addedAt: Date.now(),
    playCount: 0
  };
}

export async function openMediaFiles(paths: string[], router: Router): Promise<void> {
  const player = usePlayerStore();

  if (!paths.length) return;

  const ordered = paths.map(toMediaFile);
  const audioTracks = ordered.filter((t) => t.type === 'audio');
  const videoTracks = ordered.filter((t) => t.type === 'video');

  const mixed = audioTracks.length > 0 && videoTracks.length > 0;
  const onlyAudio = audioTracks.length > 0 && videoTracks.length === 0;

  const playQueue = mixed ? audioTracks : ordered;

  player.clearQueue();

  const [first, ...rest] = playQueue;

  if (first.type === 'audio') {
    await window.api?.clearPlaybackPosition(first.path);
  } else {
    await handleVideoResume(first, player);
  }

  if (rest.length) {
    player.pendingQueue = [...rest];
  }

  player.setTrack(first);
  player.enrichTrack(first);

  router.push(mixed || onlyAudio ? '/audio' : '/player');
}

async function handleVideoResume(
  track: MediaFile,
  player: ReturnType<typeof usePlayerStore>
): Promise<void> {
  let savedPos = 0;
  try {
    savedPos = (await window.api?.getPlaybackPosition(track.path)) || 0;
  } catch {
    savedPos = 0;
  }
  if (savedPos > 5) {
    player.seek(0);
    await window.api?.clearPlaybackPosition(track.path);
    player.showResumePrompt(track.path, savedPos);
  }
}
