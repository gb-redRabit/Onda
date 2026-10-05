import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { FolderOpen, Disc3, Radio, FolderUp } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { audioEngine } from '@renderer/modules/audioEngine';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';
import { useHomeContextMenu } from '@renderer/composables/useHomeContextMenu';
import { orderedHomeSections } from '@renderer/utils/homeSections';
import { pluralCategory } from '@renderer/utils/plural';
import { formatDuration } from '@renderer/utils/formatters';
import type { MediaFile } from '@renderer/types/media';
import type { HomeSectionId } from '@renderer/types/settings';
import type { TabId } from '@renderer/utils/libraryTabs';

// Logika widoku Home (akcje, liczniki, półki, karta kontynuacji) wyodrębniona z
// `HomeView.vue`. Template składa półki z zwróconego stanu.

export function useHomeView() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const player = usePlayerStore();
  const library = useLibraryStore();
  const settings = useSettingsStore();
  const homeContextMenu = useHomeContextMenu();

  const sections = computed(() => orderedHomeSections(settings.home.sections));
  function has(id: HomeSectionId): boolean {
    return sections.value.includes(id);
  }

  async function openFile() {
    const result = (await window.api?.invoke('dialog:openFile')) as
      { filePaths: string[]; canceled: boolean } | undefined;
    if (!result || result.canceled || !result.filePaths.length) return;
    await openMediaFiles(result.filePaths, router);
  }

  async function openFolder() {
    const result = (await window.api?.invoke('dialog:openFolderFiles')) as
      { filePaths: string[]; canceled: boolean } | undefined;
    if (!result || result.canceled || !result.filePaths.length) return;
    await openMediaFiles(result.filePaths, router);
  }

  const actions = [
    {
      id: 'open-file',
      labelKey: 'home.openFile',
      descKey: 'home.browseLocalMedia',
      icon: FolderOpen,
      route: openFile
    },
    {
      id: 'open-folder',
      labelKey: 'home.openFolder',
      descKey: 'home.loadMediaFromFolder',
      icon: FolderUp,
      route: openFolder
    },
    {
      id: 'library',
      labelKey: 'library.title',
      descKey: 'home.yourMusicCollection',
      icon: Disc3,
      route: () => router.push('/library')
    },
    {
      id: 'online',
      labelKey: 'nav.online',
      descKey: 'home.searchAndDownload',
      icon: Radio,
      route: () => router.push('/online')
    }
  ];

  interface HomeCounter {
    value: number;
    key: string;
    color: string;
    tab: TabId;
  }

  const counters = computed<HomeCounter[]>(() => [
    {
      value: library.totalCount,
      key: 'home.totalTracks',
      color: 'text-base-content',
      tab: 'overview'
    },
    { value: library.audioCount, key: 'home.audioFiles', color: 'text-primary', tab: 'tracks' },
    { value: library.videoCount, key: 'home.videoFiles', color: 'text-success', tab: 'video' },
    { value: library.imageCount, key: 'home.imageFiles', color: 'text-secondary', tab: 'images' },
    {
      value: library.playlists.length,
      key: 'library.playlists',
      color: 'text-warning',
      tab: 'playlists'
    }
  ]);

  function openLibrary(tab: TabId): void {
    router.push({ path: '/library', query: { tab } });
  }

  // ---- Półki -----------------------------------------------------------------

  const recentTracks = computed(() => library.recentTracks.slice(0, 12));
  const mostPlayed = computed(() =>
    library.mostPlayed.filter((t) => (t.playCount || 0) > 0).slice(0, 12)
  );
  const favoriteTracks = computed(() => {
    const favorites = new Set(player.favorites);
    if (!favorites.size) return [];
    return library.tracks.filter((t) => favorites.has(t.path)).slice(0, 12);
  });
  const playlists = computed(() => library.playlists.slice(0, 12));
  const albums = computed(() => library.albums.slice(0, 12));
  const artists = computed(() => library.artists.slice(0, 12));

  function trackTitle(track: MediaFile): string {
    return track.metadata?.title || track.name;
  }

  function trackSubtitle(track: MediaFile): string {
    const artist = track.metadata?.artist;
    if (artist) return artist;
    const duration = track.duration || track.metadata?.duration || 0;
    return duration > 0 ? formatDuration(duration) : track.extension;
  }

  // Wbudowane reguły liczby mnogiej vue-i18n błędnie obsługują polskie one/few/many
  // dla komunikatu 3-formowego, więc forma jest wybierana jawnie (patrz utils/plural.ts).
  function trackCountLabel(count: number): string {
    const category = pluralCategory(locale.value, count);
    const key =
      category === 'one'
        ? 'home.trackCountOne'
        : category === 'few'
          ? 'home.trackCountFew'
          : 'home.trackCountMany';
    return t(key, { count });
  }

  // ---- Karta kontynuacji -----------------------------------------------------

  // 1. Jeśli odtwarzacz ma wstrzymany utwór, to właśnie jego użytkownik chce wznowić.
  // 2. Jeśli odtwarzacz gra lub jest bez utworu, bierzemy najnowszy utwór z historii odtwarzania.
  const continueTrack = computed<MediaFile | null>(() => {
    if (!player.isPlaying && player.currentTrack) {
      return player.currentTrack;
    }
    const current = player.isPlaying ? player.currentTrack?.path : null;
    return library.recentTracks.find((t) => t.path !== current) ?? player.currentTrack ?? null;
  });
  const continuePosition = ref(0);

  async function loadContinuePosition(track: MediaFile | null): Promise<void> {
    if (!track) {
      continuePosition.value = 0;
      return;
    }
    try {
      const dbPos = (await window.api?.getPlaybackPosition(track.path)) || 0;
      const livePos = player.currentTrack?.path === track.path ? Math.floor(player.currentTime) : 0;
      continuePosition.value = Math.max(dbPos, livePos);
    } catch {
      continuePosition.value =
        player.currentTrack?.path === track.path ? Math.floor(player.currentTime) : 0;
    }
  }

  watch([continueTrack, () => player.isPlaying], ([track]) => void loadContinuePosition(track), {
    immediate: true
  });

  function playContinue(): void {
    const track = continueTrack.value;
    if (!track) return;
    if (track.type === 'video') {
      if (player.currentTrack?.path !== track.path) {
        player.setTrack(track);
      }
      if (continuePosition.value > 5) player.seek(continuePosition.value);
    } else {
      if (player.currentTrack?.path === track.path) {
        if (continuePosition.value > 5) {
          player.seek(continuePosition.value);
          audioEngine.seek(continuePosition.value);
        }
      } else {
        player.setTrack(track, { resume: true });
      }
    }
    player.play();
    if (track.type === 'video') router.push('/player');
  }

  function playContinueFromStart(): void {
    const track = continueTrack.value;
    if (!track) return;
    void window.api?.clearPlaybackPosition(track.path);
    if (track.type === 'audio') audioEngine.clearSavedPosition(track.path);
    continuePosition.value = 0;
    player.seek(0);
    if (player.currentTrack?.path !== track.path) {
      player.setTrack(track);
    } else {
      audioEngine.seek(0);
    }
    player.play();
    if (track.type === 'video') router.push('/player');
  }

  onMounted(() => {
    // Ulubione żyją w ustawieniach; wczytaj je, żeby półka wyrenderowała się przy pierwszym malowaniu.
    void player.ensureFavorites();
  });

  return {
    t,
    player,
    library,
    homeContextMenu,
    // sekcje
    has,
    actions,
    counters,
    openLibrary,
    // półki
    recentTracks,
    mostPlayed,
    favoriteTracks,
    playlists,
    albums,
    artists,
    // etykiety
    trackTitle,
    trackSubtitle,
    trackCountLabel,
    // kontynuacja
    continueTrack,
    continuePosition,
    playContinue,
    playContinueFromStart
  };
}
