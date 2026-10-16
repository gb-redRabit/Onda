import type { Router } from 'vue-router';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import type { MediaFile } from '@renderer/types/media';
import { buildMediaFile } from '@renderer/utils/explorerMedia';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { i18n } from '@renderer/i18n';
import { logger } from '@shared/logger';
import { RESUME_MIN_SECONDS } from '@shared/constants';

// Token anty-wyścig: dwa szybkie wywołania (np. podwójne „open-file" albo kolejne
// przeciągnięcia) przeplatały `await grantMediaAccess` i `setTrack`, ustawiając ostatecznie
// utwór z jednego wywołania, a trasę z drugiego.
let openSeq = 0;

export async function openMediaFiles(paths: string[], router: Router): Promise<void> {
  const player = usePlayerStore();

  if (!paths.length) return;

  const seq = ++openSeq;
  logger.info('openMedia', `openMediaFiles: ${paths.length} paths`, paths);

  const ordered = paths.map((path) => buildMediaFile({ path }));
  const playable = ordered.filter((t) => t.type === 'audio' || t.type === 'video');
  if (!playable.length) {
    // Nic z wyboru nie jest odtwarzalne — wcześniej renderer nawigował do /player
    // i natychmiast wracał, bez słowa wyjaśnienia.
    useUIStore().notify('warning', i18n.global.t('openMedia.unsupported'));
    return;
  }

  const audio = playable.filter((t) => t.type === 'audio');
  const mixed = audio.length > 0 && audio.length < playable.length;
  if (mixed) {
    // Pliki wideo przy mieszanym wyborze są pomijane — użytkownik musi o tym wiedzieć.
    useUIStore().notify(
      'info',
      i18n.global.t('openMedia.videosSkipped', { n: playable.length - audio.length })
    );
  }

  const queue = mixed ? audio : playable;
  const [first, ...rest] = queue;

  // Przyznaj serwerowi mediów dostęp do folderów WSZYSTKICH utworów z kolejki — przy
  // drag&drop / wyborze wielofolderowym kolejne pliki spoza folderu pierwszego dostawały
  // 403 z serwera mediów. Limit korzeni (200) egzekwuje proces główny.
  await Promise.all(queue.map((t) => window.api?.grantMediaAccess(t.path) ?? Promise.resolve()));
  if (seq !== openSeq) return;

  player.clearQueue();
  // Ustaw utwór PRZED pytaniem o wznowienie: `handleMediaResume` woła `seek(0)`,
  // które na poprzednim utworze przestawiało pozycję starego utworu.
  player.setTrack(first);
  player.enrichTrack(first);
  if (rest.length) {
    player.pendingQueue = [...rest];
  }

  await handleMediaResume(first, player);
  if (seq !== openSeq) return;

  logger.info('openMedia', `first track type=${first.type} url=${toMediaServerUrl(first.path)}`);

  router.push(audio.length > 0 ? '/audio' : '/player');
}

async function handleMediaResume(
  track: MediaFile,
  player: ReturnType<typeof usePlayerStore>
): Promise<void> {
  let savedPos: number;
  try {
    savedPos = (await window.api?.getPlaybackPosition(track.path)) || 0;
  } catch {
    savedPos = 0;
  }
  if (savedPos > RESUME_MIN_SECONDS) {
    player.seek(0);
    player.showResumePrompt(track.path, savedPos);
  }
}
